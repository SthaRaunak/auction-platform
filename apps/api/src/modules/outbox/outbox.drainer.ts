import { db } from '@/db';
import { deps } from '@/deps';
import { claimUnpublished, markPublished } from './outbox.data';

const BATCH = 100;
const IDLE_POLL_MS = 250;

/**
 * Publishes committed outbox rows in id order. Delivery is at-least-once (a
 * crash between publish and commit republishes), so every consumer is
 * idempotent: SSE clients drop versions they've seen, settlement checks status.
 */
export async function drainOnce(): Promise<number> {
  return db.transaction(async (tx) => {
    const rows = await claimUnpublished(tx, BATCH);
    for (const row of rows) {
      await deps.events.publish({ id: row.id, topic: row.topic, aggregateId: row.aggregateId, payload: row.payload });
    }
    await markPublished(
      tx,
      rows.map((r) => r.id),
    );
    return rows.length;
  });
}

let timer: NodeJS.Timeout | null = null;
let inFlight: Promise<void> | null = null;
let again = false;

async function run() {
  do {
    again = false;
    while ((await drainOnce()) === BATCH);
  } while (again);
}

function loop() {
  if (inFlight) {
    again = true;
    return inFlight;
  }
  inFlight = run()
    .catch((err) => console.error('[outbox] drain failed', err))
    .finally(() => (inFlight = null));
  return inFlight;
}

/** Wake the drainer now instead of waiting for the next poll (called after a commit). */
export function kickDrainer() {
  void loop();
}

/** Resolves once everything committed so far has been published (tests, shutdown). */
export async function flushOutbox() {
  if (inFlight) await inFlight;
  await loop();
}

export function startDrainer() {
  timer ??= setInterval(loop, IDLE_POLL_MS);
}

export function stopDrainer() {
  if (timer) clearInterval(timer);
  timer = null;
}
