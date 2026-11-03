/**
 * App-level time (D4): session/token expiry and rate-limit windows. Auction
 * lateness is *not* judged with this — bids and closes use database time
 * inside the transaction (A4).
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function fixedClock(start: Date) {
  let t = start.getTime();
  return { now: () => new Date(t), advance: (ms: number) => void (t += ms) } satisfies Clock & { advance(ms: number): void };
}
