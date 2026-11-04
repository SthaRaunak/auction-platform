import { incrementFor, type IncrementBand } from '@bidwell/contract';

// The proxy-bidding resolver (D5). Pure: no I/O, no clock, no Drizzle or Express.
// (price, leader) is *derived* from the ledger of secret maximums (A8) — nothing
// here is ever stored independently of the bids it was computed from.

export interface LedgerBid {
  seq: number;
  bidderId: string;
  /** The bidder's secret maximum at the time of this bid. */
  maxAmount: number;
  at: Date;
}

export interface Rules {
  startPrice: number;
  reservePrice: number | null;
  bands: IncrementBand[];
}

export interface Resolution {
  price: number;
  leaderId: string | null;
  leaderMax: number | null;
  /** Leader if the reserve is met (or there is none); otherwise null. */
  winnerId: string | null;
  reserveMet: boolean;
  bidCount: number;
  bidderCount: number;
}

interface Standing {
  bidderId: string;
  max: number;
  /** Seq at which this bidder set their current max — the tie-breaker. */
  since: number;
}

function standings(bids: readonly LedgerBid[]): Standing[] {
  const byBidder = new Map<string, Standing>();
  for (const b of bids) {
    const prev = byBidder.get(b.bidderId);
    if (!prev || b.maxAmount > prev.max) byBidder.set(b.bidderId, { bidderId: b.bidderId, max: b.maxAmount, since: b.seq });
  }
  return [...byBidder.values()].sort((a, b) => b.max - a.max || a.since - b.since);
}

export function resolve(bids: readonly LedgerBid[], rules: Rules): Resolution {
  const ranked = standings(bids);
  const [leader, second] = ranked;

  let price = rules.startPrice;
  if (leader && second) {
    const challenge = second.max === leader.max ? leader.max : Math.min(leader.max, second.max + incrementFor(second.max, rules.bands));
    price = Math.max(price, challenge);
  }
  // A leader whose max clears the reserve is lifted to it, so the reserve is visibly met.
  if (leader && rules.reservePrice !== null && leader.max >= rules.reservePrice) {
    price = Math.max(price, rules.reservePrice);
  }

  const reserveMet = rules.reservePrice === null ? true : (leader?.max ?? -1) >= rules.reservePrice;
  return {
    price,
    leaderId: leader?.bidderId ?? null,
    leaderMax: leader?.max ?? null,
    winnerId: leader && reserveMet ? leader.bidderId : null,
    reserveMet,
    bidCount: bids.length,
    bidderCount: ranked.length,
  };
}

/** The lowest maximum a non-leading bidder may place now. */
export function minNextBid(state: Resolution, rules: Rules): number {
  if (state.bidCount === 0) return rules.startPrice;
  return state.price + incrementFor(state.price, rules.bands);
}

export type BidRejection = { ok: false; code: 'SELLER_CANNOT_BID' | 'BID_TOO_LOW' | 'MAX_NOT_RAISED'; message: string; minimum?: number };

export function validateBid(
  state: Resolution,
  rules: Rules,
  input: { bidderId: string; sellerId: string; amount: number },
): { ok: true } | BidRejection {
  if (input.bidderId === input.sellerId) {
    return { ok: false, code: 'SELLER_CANNOT_BID', message: 'Sellers cannot bid on their own lots.' };
  }
  if (state.leaderId === input.bidderId && state.leaderMax !== null) {
    const minimum = state.leaderMax + incrementFor(state.leaderMax, rules.bands);
    if (input.amount < minimum) {
      return { ok: false, code: 'MAX_NOT_RAISED', minimum, message: 'You are already the top bidder — a new maximum must be higher than your current one.' };
    }
    return { ok: true };
  }
  const minimum = minNextBid(state, rules);
  if (input.amount < minimum) {
    return { ok: false, code: 'BID_TOO_LOW', minimum, message: 'Your maximum is below the minimum next bid.' };
  }
  return { ok: true };
}

/**
 * Soft close (A5): a bid landing inside the final `windowSec` pushes the end
 * to `extendSec` after the bid. The end time only ever moves later.
 */
export function softCloseEndsAt(endsAt: Date, bidAt: Date, windowSec: number, extendSec: number): Date {
  if (windowSec <= 0) return endsAt;
  if (endsAt.getTime() - bidAt.getTime() >= windowSec * 1000) return endsAt;
  return new Date(Math.max(endsAt.getTime(), bidAt.getTime() + extendSec * 1000));
}

export interface FeedItem {
  seq: number;
  bidderId: string;
  kind: 'bid' | 'auto';
  amount: number;
  at: Date;
}

/** Public, price-moving entries produced by one accepted bid. */
export function feedForBid(prev: Resolution, next: Resolution, b: LedgerBid): FeedItem[] {
  const item = (bidderId: string, kind: FeedItem['kind'], amount: number): FeedItem => ({ seq: b.seq, bidderId, kind, amount, at: b.at });

  if (next.leaderId === b.bidderId) {
    if (prev.leaderId === b.bidderId) {
      // Raising your own max is sealed; only show a move forced by the reserve.
      return next.price !== prev.price ? [item(b.bidderId, 'auto', next.price)] : [];
    }
    const out: FeedItem[] = [];
    if (prev.leaderId && prev.leaderMax !== null && prev.leaderMax > prev.price) {
      out.push(item(prev.leaderId, 'auto', prev.leaderMax));
    }
    out.push(item(b.bidderId, 'bid', next.price));
    return out;
  }
  // Outbid on arrival: the challenger's max is beaten, and the leader's proxy answers.
  return [item(b.bidderId, 'bid', b.maxAmount), item(next.leaderId!, 'auto', next.price)];
}

export function deriveFeed(bids: readonly LedgerBid[], rules: Rules): FeedItem[] {
  const feed: FeedItem[] = [];
  let prev = resolve([], rules);
  for (let i = 0; i < bids.length; i++) {
    const next = resolve(bids.slice(0, i + 1), rules);
    feed.push(...feedForBid(prev, next, bids[i]));
    prev = next;
  }
  return feed;
}
