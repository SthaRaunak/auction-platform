import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../auth/auth.schema';

/**
 * Every privileged action — moderation, role changes, deposit forfeits, account
 * takeover resets — with actor, target, reason and time (C6). Append-only (trigger).
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Null when the system acted (e.g. the C1 takeover reset). */
    actorId: uuid().references(() => users.id),
    action: text().notNull(),
    targetType: text().notNull(),
    targetId: text().notNull(),
    reason: text().notNull().default(''),
    meta: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.targetType, t.targetId), index().on(t.createdAt)],
);
