import { dueForClose } from '@/modules/auction/auction.usecase';
import { closeAuction } from '@/modules/bid/bid.usecase';

const TICK_MS = 1000;

/**
 * Nothing ends an auction unless something ends it (A1). Polls for live lots
 * past their end time (by DB clock) and closes each through the idempotent,
 * endsAt-rechecking closeAuction (A5). Safe to run in several processes.
 */
export async function closeDueAuctions() {
  let closed = 0;
  for (const id of await dueForClose()) {
    try {
      if (await closeAuction(id)) closed++;
    } catch (err) {
      console.error(`[closer] failed to close ${id}`, err);
    }
  }
  return closed;
}

let timer: NodeJS.Timeout | null = null;
let busy = false;

export function startCloser() {
  timer ??= setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await closeDueAuctions();
    } finally {
      busy = false;
    }
  }, TICK_MS);
}

export function stopCloser() {
  if (timer) clearInterval(timer);
  timer = null;
}
