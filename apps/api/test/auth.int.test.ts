import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { deps } from '@/deps';
import { auditLog } from '@/modules/audit/audit.schema';
import { sessions, users } from '@/modules/auth/auth.schema';
import * as auth from '@/modules/auth/auth.usecase';
import { meta, resetDb } from './helpers';

beforeEach(resetDb);

const lastMailTo = (to: string) => deps.mailbox.find((m) => m.to === to);
const tokenFrom = (text: string) => /token=([A-Za-z0-9_-]+)/.exec(text)![1];

describe('password accounts', () => {
  it('register → verify link → signed in and verified', async () => {
    await auth.register({ email: 'asha@example.com', password: 'a long passphrase', displayName: 'Asha K' });
    const [u] = await db.select().from(users).where(eq(users.email, 'asha@example.com'));
    expect(u.emailVerifiedAt).toBeNull();

    const token = await auth.verifyEmail(tokenFrom(lastMailTo('asha@example.com')!.text), meta);
    const session = await auth.getSessionUser(token);
    expect(session?.user.emailVerifiedAt).not.toBeNull();
    // Single use.
    await expect(auth.verifyEmail(tokenFrom(lastMailTo('asha@example.com')!.text), meta)).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
  });

  it('registering a taken email answers identically and warns the owner instead (no enumeration)', async () => {
    await auth.register({ email: 'asha@example.com', password: 'a long passphrase', displayName: 'Asha' });
    await expect(auth.register({ email: 'asha@example.com', password: 'another passphrase', displayName: 'Mallory' })).resolves.toBeUndefined();
    expect(lastMailTo('asha@example.com')!.subject).toMatch(/tried to register/);
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it('locks the account after five failures', async () => {
    await auth.register({ email: 'asha@example.com', password: 'a long passphrase', displayName: 'Asha' });
    for (let i = 0; i < 5; i++) {
      await expect(auth.login({ email: 'asha@example.com', password: 'wrong password' }, meta)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    }
    await expect(auth.login({ email: 'asha@example.com', password: 'a long passphrase' }, meta)).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED' });
  });

  it('password reset revokes every existing session (C5)', async () => {
    await auth.register({ email: 'asha@example.com', password: 'a long passphrase', displayName: 'Asha' });
    const t1 = await auth.login({ email: 'asha@example.com', password: 'a long passphrase' }, meta);
    await auth.requestPasswordReset('asha@example.com');
    const t2 = await auth.resetPassword(tokenFrom(lastMailTo('asha@example.com')!.text), 'a brand new passphrase', meta);
    expect(await auth.getSessionUser(t1)).toBeNull();
    expect(await auth.getSessionUser(t2)).not.toBeNull();
  });
});

describe('Google linking — the C1 takeover', () => {
  const google = (over: Partial<auth.GoogleProfile> = {}): auth.GoogleProfile => ({
    sub: 'google-123',
    email: 'victim@gmail.com',
    emailVerified: true,
    name: 'Real Victim',
    ...over,
  });

  it('blocks an attacker who pre-registered the victim’s email without verifying it', async () => {
    // 1. Attacker registers victim@gmail.com with their own password and never verifies.
    await auth.register({ email: 'victim@gmail.com', password: 'attacker password', displayName: 'Attacker' });
    const attackerSession = await auth.login({ email: 'victim@gmail.com', password: 'attacker password' }, meta);

    // 2. The real owner signs in with Google.
    const victimSession = await auth.loginWithGoogle(google(), meta);
    const victim = (await auth.getSessionUser(victimSession))!.user;

    // 3. The attacker's password and session no longer open the account.
    expect(victim.passwordHash).toBeNull();
    expect(victim.emailVerifiedAt).not.toBeNull();
    expect(await auth.getSessionUser(attackerSession)).toBeNull();
    await expect(auth.login({ email: 'victim@gmail.com', password: 'attacker password' }, meta)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, 'account.unverified_password_revoked'));
    expect(entry.targetId).toBe(victim.id);
  });

  it('links to an existing verified account and keeps its password', async () => {
    await auth.register({ email: 'victim@gmail.com', password: 'owner passphrase', displayName: 'Owner' });
    await auth.verifyEmail(tokenFrom(lastMailTo('victim@gmail.com')!.text), meta);
    const t = await auth.loginWithGoogle(google(), meta);
    const user = (await auth.getSessionUser(t))!.user;
    expect(user.passwordHash).not.toBeNull();
    await expect(auth.login({ email: 'victim@gmail.com', password: 'owner passphrase' }, meta)).resolves.toBeTypeOf('string');
  });

  it('refuses a Google identity whose email Google hasn’t verified', async () => {
    await expect(auth.loginWithGoogle(google({ emailVerified: false }), meta)).rejects.toMatchObject({ code: 'GOOGLE_EMAIL_UNVERIFIED' });
  });

  it('a returning Google user signs in by subject, even if their email changed', async () => {
    await auth.loginWithGoogle(google(), meta);
    const t = await auth.loginWithGoogle(google({ email: 'renamed@gmail.com' }), meta);
    expect((await auth.getSessionUser(t))!.user.email).toBe('victim@gmail.com');
    expect(await db.select().from(sessions)).toHaveLength(2);
  });
});
