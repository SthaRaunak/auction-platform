import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import type { Executor } from '@/db';
import { emailTokens, oauthAccounts, sessions, users } from './auth.schema';

export type UserRow = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export async function findUserByEmail(ex: Executor, email: string) {
  const [row] = await ex.select().from(users).where(eq(users.email, email));
  return row ?? null;
}

export async function findUserById(ex: Executor, id: string) {
  const [row] = await ex.select().from(users).where(eq(users.id, id));
  return row ?? null;
}

export function findUsersByIds(ex: Executor, ids: string[]) {
  if (!ids.length) return Promise.resolve([]);
  return ex.select({ id: users.id, displayName: users.displayName, email: users.email }).from(users).where(inArray(users.id, ids));
}

export async function insertUser(ex: Executor, user: NewUser) {
  const [row] = await ex.insert(users).values(user).returning();
  return row;
}

export async function updateUser(ex: Executor, id: string, patch: Partial<NewUser>) {
  const [row] = await ex.update(users).set(patch).where(eq(users.id, id)).returning();
  return row;
}

export async function incrementFailedLogins(ex: Executor, id: string) {
  const [row] = await ex
    .update(users)
    .set({ failedLoginCount: sql`${users.failedLoginCount} + 1` })
    .where(eq(users.id, id))
    .returning({ failedLoginCount: users.failedLoginCount });
  return row.failedLoginCount;
}

// ── sessions ────────────────────────────────────────────────────────────────
export async function insertSession(ex: Executor, row: typeof sessions.$inferInsert) {
  await ex.insert(sessions).values(row);
}

export async function findLiveSession(ex: Executor, id: string, now: Date) {
  const [row] = await ex
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, now)));
  return row ?? null;
}

export async function deleteSession(ex: Executor, id: string) {
  await ex.delete(sessions).where(eq(sessions.id, id));
}

export async function deleteSessionsForUser(ex: Executor, userId: string) {
  await ex.delete(sessions).where(eq(sessions.userId, userId));
}

// ── oauth ───────────────────────────────────────────────────────────────────
export async function findOauthAccount(ex: Executor, provider: string, providerUserId: string) {
  const [row] = await ex
    .select()
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.provider, provider), eq(oauthAccounts.providerUserId, providerUserId)));
  return row ?? null;
}

export async function hasOauthAccount(ex: Executor, userId: string) {
  const [row] = await ex.select({ userId: oauthAccounts.userId }).from(oauthAccounts).where(eq(oauthAccounts.userId, userId)).limit(1);
  return Boolean(row);
}

export async function insertOauthAccount(ex: Executor, row: typeof oauthAccounts.$inferInsert) {
  await ex.insert(oauthAccounts).values(row);
}

// ── email tokens ────────────────────────────────────────────────────────────
export async function insertEmailToken(ex: Executor, row: typeof emailTokens.$inferInsert) {
  await ex.insert(emailTokens).values(row);
}

/** Single-use: marks the token used and returns its owner, or null if missing/expired/used. */
export async function consumeEmailToken(ex: Executor, tokenHash: string, purpose: 'verify_email' | 'reset_password', now: Date) {
  const [row] = await ex
    .update(emailTokens)
    .set({ usedAt: now })
    .where(
      and(eq(emailTokens.tokenHash, tokenHash), eq(emailTokens.purpose, purpose), isNull(emailTokens.usedAt), gt(emailTokens.expiresAt, now)),
    )
    .returning({ userId: emailTokens.userId });
  return row?.userId ?? null;
}
