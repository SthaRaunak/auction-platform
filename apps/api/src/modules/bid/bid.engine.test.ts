import { describe, expect, it } from 'vitest';
import type { IncrementBand } from '@bidwell/contract';
import { deriveFeed, minNextBid, resolve, softCloseEndsAt, validateBid, type LedgerBid } from './bid.engine';

// The A7 table from docs/decisions.md, plus the edges around it. All amounts are
// minor units; the engine never sees a float or a clock.

const flat = (step: number): IncrementBand[] => [{ below: null, step }];
const rules = (over: Partial<{ startPrice: number; reservePrice: number | null; bands: IncrementBand[] }> = {}) => ({
  startPrice: 50,
  reservePrice: null,
  bands: flat(5),
  ...over,
});

let seq = 0;
const bid = (bidderId: string, maxAmount: number): LedgerBid => ({ seq: ++seq, bidderId, maxAmount, at: new Date(seq * 1000) });

describe('resolve — the A7 table', () => {
  it('equal maximums: the earliest bid wins at that price', () => {
    const r = resolve([bid('alice', 100), bid('bob', 100)], rules());
    expect(r.leaderId).toBe('alice');
    expect(r.price).toBe(100);
  });

  it('the winner pays their own max when it is less than second + increment', () => {
    const r = resolve([bid('alice', 100), bid('bob', 102)], rules());
    expect(r.leaderId).toBe('bob');
    expect(r.price).toBe(102); // not 105
  });

  it('a single bidder holds the price at the start price', () => {
    const r = resolve([bid('alice', 500)], rules());
    expect(r.leaderId).toBe('alice');
    expect(r.price).toBe(50);
  });

  it('reserve not met: no winner', () => {
    const r = resolve([bid('alice', 120), bid('bob', 150)], rules({ reservePrice: 200 }));
    expect(r.reserveMet).toBe(false);
    expect(r.winnerId).toBeNull();
    expect(r.leaderId).toBe('bob');
    expect(r.price).toBe(125);
  });

  it('seller bidding on their own lot is rejected (shill prevention)', () => {
    const state = resolve([], rules());
    const v = validateBid(state, rules(), { bidderId: 'seller', sellerId: 'seller', amount: 500 });
    expect(v).toMatchObject({ ok: false, code: 'SELLER_CANNOT_BID' });
  });

  it('a new max below the required minimum is rejected with that minimum', () => {
    const state = resolve([bid('alice', 100), bid('bob', 80)], rules());
    expect(state.price).toBe(85);
    const v = validateBid(state, rules(), { bidderId: 'carol', sellerId: 'seller', amount: 70 });
    expect(v).toEqual({ ok: false, code: 'BID_TOO_LOW', minimum: 90, message: expect.any(String) });
  });
});

describe('resolve — further cases', () => {
  it('no bids: price is the start price, nobody leads, nobody wins', () => {
    const r = resolve([], rules());
    expect(r).toMatchObject({ price: 50, leaderId: null, winnerId: null, bidCount: 0 });
  });

  it('second + increment when the leader has headroom', () => {
    const r = resolve([bid('alice', 300), bid('bob', 120)], rules());
    expect(r.leaderId).toBe('alice');
    expect(r.price).toBe(125);
  });

  it('a bidder raising their own max uses the latest max, ranked from when it was set', () => {
    const r = resolve([bid('alice', 100), bid('bob', 150), bid('alice', 150)], rules());
    // Bob reached 150 first; Alice's raise to 150 ties and loses.
    expect(r.leaderId).toBe('bob');
    expect(r.price).toBe(150);
  });

  it('a lone bidder whose max clears the reserve is lifted to the reserve', () => {
    const r = resolve([bid('alice', 500)], rules({ reservePrice: 200 }));
    expect(r.price).toBe(200);
    expect(r.reserveMet).toBe(true);
    expect(r.winnerId).toBe('alice');
  });

  it('tiered increments use the band for the second-highest max', () => {
    const tiered: IncrementBand[] = [{ below: 1000, step: 10 }, { below: null, step: 100 }];
    const r = resolve([bid('alice', 5000), bid('bob', 995)], rules({ bands: tiered }));
    expect(r.price).toBe(1005);
    const r2 = resolve([bid('alice', 5000), bid('bob', 1000)], rules({ bands: tiered }));
    expect(r2.price).toBe(1100);
  });

  it('price never drops below the start price', () => {
    const r = resolve([bid('alice', 60), bid('bob', 55)], rules({ startPrice: 58 }));
    expect(r.price).toBe(60);
  });
});

describe('validateBid / minNextBid', () => {
  it('the first bid must meet the start price', () => {
    const state = resolve([], rules());
    expect(minNextBid(state, rules())).toBe(50);
    expect(validateBid(state, rules(), { bidderId: 'a', sellerId: 's', amount: 49 })).toMatchObject({ ok: false, minimum: 50 });
    expect(validateBid(state, rules(), { bidderId: 'a', sellerId: 's', amount: 50 })).toEqual({ ok: true });
  });

  it('after one bid the next minimum is start + increment', () => {
    const state = resolve([bid('alice', 500)], rules());
    expect(minNextBid(state, rules())).toBe(55);
  });

  it('the leader may only raise their max, by at least one increment', () => {
    const state = resolve([bid('alice', 500)], rules());
    expect(validateBid(state, rules(), { bidderId: 'alice', sellerId: 's', amount: 500 })).toMatchObject({
      ok: false,
      code: 'MAX_NOT_RAISED',
      minimum: 505,
    });
    expect(validateBid(state, rules(), { bidderId: 'alice', sellerId: 's', amount: 505 })).toEqual({ ok: true });
  });
});

describe('softCloseEndsAt — anti-sniping (A5, E7)', () => {
  const endsAt = new Date('2026-01-01T12:00:00Z');

  it('a bid 59s before close extends the auction to bid time + extension', () => {
    const at = new Date(endsAt.getTime() - 59_000);
    expect(softCloseEndsAt(endsAt, at, 60, 120).toISOString()).toBe('2026-01-01T12:01:01.000Z');
  });

  it('a bid outside the window leaves the end time alone', () => {
    const at = new Date(endsAt.getTime() - 61_000);
    expect(softCloseEndsAt(endsAt, at, 60, 120)).toEqual(endsAt);
  });

  it('never moves the end time earlier', () => {
    const at = new Date(endsAt.getTime() - 50_000);
    expect(softCloseEndsAt(endsAt, at, 60, 10)).toEqual(endsAt);
  });

  it('is disabled with a zero window', () => {
    const at = new Date(endsAt.getTime() - 1_000);
    expect(softCloseEndsAt(endsAt, at, 0, 120)).toEqual(endsAt);
  });
});

describe('deriveFeed', () => {
  it('shows the challenger and the proxy response when the challenger is outbid', () => {
    const feed = deriveFeed([bid('alice', 300), bid('bob', 120)], rules());
    expect(feed.map((f) => [f.bidderId, f.kind, f.amount])).toEqual([
      ['alice', 'bid', 50],
      ['bob', 'bid', 120],
      ['alice', 'auto', 125],
    ]);
  });

  it('shows the old leader’s proxy topping out when a challenger takes the lead', () => {
    const feed = deriveFeed([bid('alice', 100), bid('bob', 200)], rules());
    expect(feed.map((f) => [f.bidderId, f.kind, f.amount])).toEqual([
      ['alice', 'bid', 50],
      ['alice', 'auto', 100],
      ['bob', 'bid', 105],
    ]);
  });

  it('a leader raising their own max adds nothing public', () => {
    const feed = deriveFeed([bid('alice', 100), bid('alice', 400)], rules());
    expect(feed).toHaveLength(1);
  });
});
