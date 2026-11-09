import { asc, inArray, isNull, sql } from 'drizzle-orm';
import type { Executor, Tx } from '@/db';
import { outbox } from './outbox.schema';

export type NewOutboxEvent = Pick<typeof outbox.$inferInsert, 'topic' | 'aggregateId' | 'payload'>;

export async function insertOutboxEvents(ex: Executor, events: NewOutboxEvent[]) {
  if (events.length) await ex.insert(outbox).values(events);
}

/** Claims the oldest unpublished rows; concurrent drainers skip each other's claims. */
export function claimUnpublished(tx: Tx, limit: number) {
  return tx.select().from(outbox).where(isNull(outbox.publishedAt)).orderBy(asc(outbox.id)).limit(limit).for('update', { skipLocked: true });
}

export async function markPublished(tx: Tx, ids: number[]) {
  if (ids.length) await tx.update(outbox).set({ publishedAt: sql`now()` }).where(inArray(outbox.id, ids));
}
