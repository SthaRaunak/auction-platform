import { sql } from 'drizzle-orm';
import { bigserial, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Transactional outbox (D1). Use-cases insert events here in the same
 * transaction as the state change; the drainer publishes them afterwards.
 */
export const outbox = pgTable(
  'outbox',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    topic: text().notNull(),
    aggregateId: uuid().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index('outbox_unpublished_idx').on(t.id).where(sql`${t.publishedAt} is null`)],
);
