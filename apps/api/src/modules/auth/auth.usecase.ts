import type { LoginInput, Me, RegisterInput, Role } from '@bidwell/contract';
import { config } from '@/config';
import { db, type Executor } from '@/db';
import { deps } from '@/deps';
import { DomainError, forbidden, unauthorized } from '@/errors';
import { hashPassword, verifyAgainstDummy, verifyPassword } from '@/infra/argon';
import { randomToken, sha256 } from '@/infra/tokens';
import { recordAudit } from '../audit/audit.usecase';
import {
  consumeEmailToken,
  deleteSession,
  deleteSessionsForUser,
  findLiveSession,
  findOauthAccount,
  findUserByEmail,
  findUserById,
  findUsersByIds,
  hasOauthAccount,
  incrementFailedLogins,
  insertEmailToken,
  insertOauthAccount,
  insertSession,
  insertUser,
  updateUser,
  type UserRow,
} from './auth.data';

export type { UserRow };

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60_000;
const VERIFY_TTL_MS = 24 * 60 * 60_000;
const RESET_TTL_MS = 30 * 60_000;

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : (parts[0]?.[1] ?? ''))).toUpperCase();
}

export async function toMe(user: UserRow, watchCount: number): Promise<Me> {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    initials: initialsOf(user.displayName),
    role: user.role,
    emailVerified: Boolean(user.emailVerifiedAt),
    hasPassword: Boolean(user.passwordHash),
    googleLinked: await hasOauthAccount(db, user.id),
    watchCount,
  };
}

// ── sessions ────────────────────────────────────────────────────────────────
async function createSession(ex: Executor, userId: string, meta: RequestMeta) {
  const token = randomToken();
  const now = deps.clock.now();
  await insertSession(ex, {
    id: sha256(token),
    userId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + config.SESSION_TTL_DAYS * 86_400_000),
    ip: meta.ip,
    userAgent: meta.userAgent?.slice(0, 300),
  });
  return token;
}

export async function getSessionUser(token: string | undefined) {
  if (!token) return null;
  const found = await findLiveSession(db, sha256(token), deps.clock.now());
  return found ? { sessionId: found.session.id, user: found.user } : null;
}

export async function logout(token: string) {
  await deleteSession(db, sha256(token));
}

/** Revocation is a DELETE because sessions are server-side rows, not JWTs (C5). */
export async function logoutEverywhere(userId: string) {
  await deleteSessionsForUser(db, userId);
}

// ── email tokens ────────────────────────────────────────────────────────────
async function issueEmailToken(ex: Executor, userId: string, purpose: 'verify_email' | 'reset_password') {
  const token = randomToken();
  await insertEmailToken(ex, {
    tokenHash: sha256(token),
    userId,
    purpose,
    expiresAt: new Date(deps.clock.now().getTime() + (purpose === 'verify_email' ? VERIFY_TTL_MS : RESET_TTL_MS)),
  });
  return token;
}

async function sendVerification(ex: Executor, user: UserRow) {
  const token = await issueEmailToken(ex, user.id, 'verify_email');
  await deps.email.send({
    to: user.email,
    subject: 'Confirm your email for Bidwell',
    text: `Hi ${user.displayName},\n\nConfirm your email to start bidding and selling:\n${config.APP_ORIGIN}/verify-email?token=${token}\n\nThe link expires in 24 hours.`,
  });
}

// ── password accounts ───────────────────────────────────────────────────────
/**
 * Always answers the same way, whether or not the email is taken, so the form
 * can't be used to enumerate accounts. The existing owner gets a heads-up instead.
 */
export async function register(input: RegisterInput): Promise<void> {
  const existing = await findUserByEmail(db, input.email);
  if (existing) {
    await deps.email.send({
      to: existing.email,
      subject: 'Someone tried to register with your email',
      text: `Someone tried to create a Bidwell account with this address. If it was you, sign in instead or reset your password:\n${config.APP_ORIGIN}/forgot-password`,
    });
    return;
  }
  const passwordHash = await hashPassword(input.password);
  await db.transaction(async (tx) => {
    const user = await insertUser(tx, { email: input.email, displayName: input.displayName, passwordHash });
    await sendVerification(tx, user);
  });
}

export async function resendVerification(userId: string) {
  const user = await findUserById(db, userId);
  if (!user || user.emailVerifiedAt) return;
  await sendVerification(db, user);
}

/** Consumes a verification link and signs the user in. */
export async function verifyEmail(token: string, meta: RequestMeta) {
  return db.transaction(async (tx) => {
    const userId = await consumeEmailToken(tx, sha256(token), 'verify_email', deps.clock.now());
    if (!userId) throw new DomainError(400, 'TOKEN_INVALID', 'This link is invalid or has expired.');
    await updateUser(tx, userId, { emailVerifiedAt: deps.clock.now() });
    return createSession(tx, userId, meta);
  });
}

export async function login(input: LoginInput, meta: RequestMeta) {
  const user = await findUserByEmail(db, input.email);
  const invalid = new DomainError(401, 'INVALID_CREDENTIALS', 'That email and password don’t match.');
  if (!user || !user.passwordHash) {
    await verifyAgainstDummy(input.password);
    throw invalid;
  }
  const now = deps.clock.now();
  if (user.lockedUntil && user.lockedUntil > now) {
    throw new DomainError(429, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again in a few minutes, or reset your password.');
  }
  if (!(await verifyPassword(user.passwordHash, input.password))) {
    const failures = await incrementFailedLogins(db, user.id);
    if (failures >= MAX_FAILED_LOGINS) {
      await updateUser(db, user.id, { lockedUntil: new Date(now.getTime() + LOCKOUT_MS), failedLoginCount: 0 });
    }
    throw invalid;
  }
  await updateUser(db, user.id, { failedLoginCount: 0, lockedUntil: null });
  return createSession(db, user.id, meta);
}

export async function requestPasswordReset(email: string) {
  const user = await findUserByEmail(db, email);
  if (!user) return;
  const token = await issueEmailToken(db, user.id, 'reset_password');
  await deps.email.send({
    to: user.email,
    subject: 'Reset your Bidwell password',
    text: `Reset your password here (valid for 30 minutes):\n${config.APP_ORIGIN}/reset-password?token=${token}\n\nIf you didn't ask for this, ignore this email.`,
  });
}

/** Proves control of the inbox, so it also verifies the email. Every other session is revoked. */
export async function resetPassword(token: string, password: string, meta: RequestMeta) {
  const passwordHash = await hashPassword(password);
  return db.transaction(async (tx) => {
    const userId = await consumeEmailToken(tx, sha256(token), 'reset_password', deps.clock.now());
    if (!userId) throw new DomainError(400, 'TOKEN_INVALID', 'This link is invalid or has expired.');
    const user = await findUserById(tx, userId);
    await updateUser(tx, userId, {
      passwordHash,
      failedLoginCount: 0,
      lockedUntil: null,
      emailVerifiedAt: user?.emailVerifiedAt ?? deps.clock.now(),
    });
    await deleteSessionsForUser(tx, userId);
    return createSession(tx, userId, meta);
  });
}

// ── Google ──────────────────────────────────────────────────────────────────
export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

/**
 * The account-linking rule (C1, docs/adr/0003-account-linking.md):
 *  1. A known Google identity signs straight in.
 *  2. Google must assert the email is verified, or we refuse.
 *  3. An existing account with a *verified* email is linked.
 *  4. An existing account with an *unverified* email may have been registered
 *     by an attacker squatting on the address. Google has just proven who owns
 *     the inbox, so the owner wins: the unproven password is wiped, every
 *     session on the account is revoked, and the reset is audited.
 *  5. Otherwise a new, already-verified account is created.
 */
export async function loginWithGoogle(profile: GoogleProfile, meta: RequestMeta) {
  const email = profile.email.trim().toLowerCase();
  return db.transaction(async (tx) => {
    const linked = await findOauthAccount(tx, 'google', profile.sub);
    if (linked) return createSession(tx, linked.userId, meta);

    if (!profile.emailVerified) {
      throw forbidden('GOOGLE_EMAIL_UNVERIFIED', 'Your Google account’s email isn’t verified, so we can’t use it to sign you in.');
    }

    const now = deps.clock.now();
    let user = await findUserByEmail(tx, email);
    if (user && !user.emailVerifiedAt) {
      await updateUser(tx, user.id, { passwordHash: null, emailVerifiedAt: now, failedLoginCount: 0, lockedUntil: null });
      await deleteSessionsForUser(tx, user.id);
      await recordAudit(tx, {
        actorId: null,
        action: 'account.unverified_password_revoked',
        targetType: 'user',
        targetId: user.id,
        reason: 'Google proved control of an email whose password account was never verified (C1).',
        meta: { provider: 'google' },
      });
    } else if (!user) {
      user = await insertUser(tx, { email, displayName: profile.name || email.split('@')[0], emailVerifiedAt: now });
    }
    await insertOauthAccount(tx, { provider: 'google', providerUserId: profile.sub, userId: user.id, email });
    return createSession(tx, user.id, meta);
  });
}

// ── lookups & roles ─────────────────────────────────────────────────────────
export function getUser(id: string) {
  return findUserById(db, id);
}

export async function getUserNames(ids: string[]) {
  const rows = await findUsersByIds(db, [...new Set(ids)]);
  return new Map(rows.map((r) => [r.id, r]));
}

export function requireVerified(user: UserRow | null | undefined): asserts user is UserRow {
  if (!user) throw unauthorized();
  if (!user.emailVerifiedAt) throw forbidden('EMAIL_UNVERIFIED', 'Confirm your email address first — check your inbox for the link.');
}

export async function setRole(actor: UserRow, userId: string, role: Role, reason: string) {
  if (actor.role !== 'admin') throw forbidden('ADMIN_ONLY', 'Only admins can change roles.');
  await db.transaction(async (tx) => {
    const target = await findUserById(tx, userId);
    if (!target) throw new DomainError(404, 'NOT_FOUND', 'User not found.');
    await updateUser(tx, userId, { role });
    await recordAudit(tx, { actorId: actor.id, action: 'user.role_changed', targetType: 'user', targetId: userId, reason, meta: { from: target.role, to: role } });
  });
}
