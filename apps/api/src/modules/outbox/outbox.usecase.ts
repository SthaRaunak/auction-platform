import type { Executor } from '@/db';
import { insertOutboxEvents, type NewOutboxEvent } from './outbox.data';

export type { NewOutboxEvent };

/**
 * Record events in the caller's transaction (D1). They become visible to the
 * drainer only if that transaction commits — a rolled-back bid never broadcasts,
 * and a crash after commit cannot lose one.
 */
export function enqueueEvents(ex: Executor, events: NewOutboxEvent[]) {
  return insertOutboxEvents(ex, events);
}
