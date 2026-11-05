import { index, integer, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['user', 'moderator', 'admin']);
export const emailTokenPurposeEnum = pgEnum('email_token_purpose', ['verify_email', 'reset_password']);

export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  /** Always stored lower-cased. */
  email: text().notNull().unique(),
  emailVerifiedAt: timestamp({ withTimezone: true }),
  /** Null for Google-only accounts, and after a C1 takeover reset. */
  passwordHash: text(),
  displayName: text().notNull(),
  role: roleEnum().notNull().default('user'),
  failedLoginCount: integer().notNull().default(0),
  lockedUntil: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Opaque server-side sessions: the cookie holds a random token, the row holds its SHA-256. */
export const sessions = pgTable(
  'sessions',
  {
    id: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ip: text(),
    userAgent: text(),
  },
  (t) => [index().on(t.userId)],
);

export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    provider: text().notNull(),
    providerUserId: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    email: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerUserId] }), index().on(t.userId)],
);

export const emailTokens = pgTable('email_tokens', {
  tokenHash: text().primaryKey(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  purpose: emailTokenPurposeEnum().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  usedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
