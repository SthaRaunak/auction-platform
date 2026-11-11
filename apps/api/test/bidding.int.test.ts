import { eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { auctions } from '@/modules/auction/auction.schema';
import { bids } from '@/modules/bid/bid.schema';
import { closeAuction, getAuctionDetail, getAuctionResult, placeBid, verifyAuctionChain } from '@/modules/bid/bid.usecase';
import { outbox } from '@/modules/outbox/outbox.schema';
import { closeDueAuctions } from '@/workers/closer';
import { key, makeAuction, makeUser, meta, resetDb, setEndsIn } from './helpers';

beforeEach(resetDb);

const row = async (id: string) => (await db.select().from(auctions).where(eq(auctions.id, id)))[0];

describe('place bid — one transaction', () => {
  it('writes the bid, the derived state and the outbox events atomically (D1)', async () => {
    const seller = await makeUser();
    const alice = await makeUser();
    const a = await makeAuction(seller);

    const r = await placeBid(alice, a.id, { maxAmount: 50_000, idempotencyKey: key() }, meta);
    expect(r).toMatchObject({ accepted: true, isLeader: true, state: { price: 10_000, bidCount: 1, version: 1, leaderNo: 1 } });

    const events = await db.select().from(outbox).where(eq(outbox.aggregateId, a.id));
    expect(events.map((e) => e.topic)).toEqual(['auction.state']);
    // The broadcast payload is masked: no user ids anywhere in it (E5).
    expect(JSON.stringify(events[0].payload)).not.toContain(alice.id);
  });

  it('a rejected bid leaves no trace — no ledger row, no outbox event', async () => {
    const seller = await makeUser();
    const a = await makeAuction(seller);
    await expect(placeBid(seller, a.id, { maxAmount: 50_000, idempotencyKey: key() }, meta)).rejects.toMatchObject({ code: 'SELLER_CANNOT_BID' });
    expect(await db.select().from(bids)).toHaveLength(0);
    expect(await db.select().from(outbox)).toHaveLength(0);
  });

  it('rejects a max below the minimum and reports the minimum', async () => {
    const seller = await makeUser();
    const [alice, bob] = [await makeUser(), await makeUser()];
    const a = await makeAuction(seller);
    await placeBid(alice, a.id, { maxAmount: 30_000, idempotencyKey: key() }, meta);
    await expect(placeBid(bob, a.id, { maxAmount: 10_000, idempotencyKey: key() }, meta)).rejects.toMatchObject({
      code: 'BID_TOO_LOW',
      details: { minimum: 10_500 },
    });
  });

  it('20 concurrent bids: exactly one leader, correct price, every bid in the ledger once (A2)', async () => {
    const seller = await makeUser();
    const a = await makeAuction(seller);
    const bidders = await Promise.all(Array.from({ length: 20 }, () => makeUser()));
    // Distinct maximums 20_000, 21_000, … 39_000 — the top one must win at second + increment.
    const results = await Promise.allSettled(bidders.map((u, i) => placeBid(u, a.id, { maxAmount: 20_000 + i * 1_000, idempotencyKey: key() }, meta)));

    const accepted = results.filter((r) => r.status === 'fulfilled');
    const ledger = await db.select().from(bids).where(eq(bids.auctionId, a.id));
    expect(ledger).toHaveLength(accepted.length);
    expect(new Set(ledger.map((b) => b.seq)).size).toBe(ledger.length);

    const detail = await getAuctionDetail(a.id, null);
    const final = await row(a.id);
    expect(final.leaderId).toBe(bidders[19].id);
    expect(final.currentPrice).toBe(detail.price);
    expect(final.currentPrice).toBe(38_500); // 38_000 (second) + 500
    expect(final.version).toBe(accepted.length);
    expect((await verifyAuctionChain(a.id)).valid).toBe(true);
    // Late arrivals below the climbing price are legitimately rejected — never double-accepted.
    for (const r of results) if (r.status === 'rejected') expect((r.reason as { code: string }).code).toBe('BID_TOO_LOW');
  });

  it('20 concurrent identical maximums: the earliest committed bid leads at that price', async () => {
    const seller = await makeUser();
    const a = await makeAuction(seller);
    const bidders = await Promise.all(Array.from({ length: 20 }, () => makeUser()));
    const results = await Promise.allSettled(bidders.map((u) => placeBid(u, a.id, { maxAmount: 30_000, idempotencyKey: key() }, meta)));
    const leaders = results.filter((r) => r.status === 'fulfilled' && r.value.isLeader);
    expect(leaders).toHaveLength(1);
    const first = (await db.select().from(bids).where(eq(bids.auctionId, a.id)).orderBy(bids.seq))[0];
    expect((await row(a.id)).leaderId).toBe(first.bidderId);
  });

  it('is idempotent: a retried request returns the original result and adds nothing (A9)', async () => {
    const seller = await makeUser();
    const alice = await makeUser();
    const a = await makeAuction(seller);
    const k = key();
    const [one, two] = await Promise.all([
      placeBid(alice, a.id, { maxAmount: 40_000, idempotencyKey: k }, meta),
      placeBid(alice, a.id, { maxAmount: 40_000, idempotencyKey: k }, meta),
    ]);
    expect([one.replayed, two.replayed].sort()).toEqual([false, true]);
    expect(await db.select().from(bids)).toHaveLength(1);
    await expect(placeBid(alice, a.id, { maxAmount: 45_000, idempotencyKey: k }, meta)).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  });

  it('judges lateness by database time, not the client (A4)', async () => {
    const seller = await makeUser();
    const alice = await makeUser();
    const a = await makeAuction(seller);
    await setEndsIn(a.id, -50); // ended 50ms ago by the DB clock; the closer hasn't run yet
    await expect(placeBid(alice, a.id, { maxAmount: 40_000, idempotencyKey: key() }, meta)).rejects.toMatchObject({ code: 'AUCTION_ENDED' });
  });

  it('unverified accounts cannot bid (C3)', async () => {
    const seller = await makeUser();
    const eve = await makeUser({ emailVerifiedAt: null });
    const a = await makeAuction(seller);
    await expect(placeBid(eve, a.id, { maxAmount: 40_000, idempotencyKey: key() }, meta)).rejects.toMatchObject({ code: 'EMAIL_UNVERIFIED' });
  });
});

describe('soft close and the closer (A1, A5)', () => {
  it('a bid inside the window extends the end time; outside it does not', async () => {
    const seller = await makeUser();
    const [alice, bob] = [await makeUser(), await makeUser()];
    const a = await makeAuction(seller, { softCloseWindowSec: 120, softCloseExtendSec: 120 });

    await placeBid(alice, a.id, { maxAmount: 20_000, idempotencyKey: key() }, meta);
    const unchanged = await row(a.id);
    expect(unchanged.endsAt).toEqual(a.endsAt);

    await setEndsIn(a.id, 30_000);
    await placeBid(bob, a.id, { maxAmount: 30_000, idempotencyKey: key() }, meta);
    const extended = await row(a.id);
    const [{ remaining }] = (await db.execute<{ remaining: number }>(sql`select extract(epoch from (ends_at - clock_timestamp())) as remaining from auctions where id = ${a.id}`)).rows;
    expect(Number(remaining)).toBeGreaterThan(115);
    expect(extended.originalEndsAt).toEqual(a.originalEndsAt);
  });

  it('the closer re-reads endsAt and leaves an extended auction open', async () => {
    const seller = await makeUser();
    const a = await makeAuction(seller);
    await setEndsIn(a.id, 5_000);
    // Simulate a closer that picked this lot up earlier: closeAuction must re-check under the lock.
    expect(await closeAuction(a.id)).toBeNull();
    expect((await row(a.id)).status).toBe('live');
  });

  it('closes due auctions exactly once, picks the winner, and publishes the full ledger', async () => {
    const seller = await makeUser();
    const [alice, bob] = [await makeUser(), await makeUser()];
    const a = await makeAuction(seller);
    await placeBid(alice, a.id, { maxAmount: 20_000, idempotencyKey: key() }, meta);
    await placeBid(bob, a.id, { maxAmount: 25_000, idempotencyKey: key() }, meta);
    await setEndsIn(a.id, -10);

    const [n1, n2] = await Promise.all([closeDueAuctions(), closeDueAuctions()]);
    expect(n1 + n2).toBe(1);
    const closed = await row(a.id);
    expect(closed).toMatchObject({ status: 'closed', winnerId: bob.id, finalPrice: 20_500, reserveMet: true });

    const result = await getAuctionResult(a.id);
    expect(result).toMatchObject({ outcome: 'sold', winnerName: bob.displayName, finalPrice: 20_500, chain: { valid: true, checked: 2 } });
    // Maximums are sealed while live and published after close (E3).
    expect(result.ledger.map((l) => l.maxAmount)).toEqual([20_000, 25_000]);
    expect(await db.select().from(outbox).where(eq(outbox.topic, 'auction.closed'))).toHaveLength(1);
  });

  it('reserve not met: closes with no winner', async () => {
    const seller = await makeUser();
    const alice = await makeUser();
    const a = await makeAuction(seller, { reservePrice: 100_000 });
    await placeBid(alice, a.id, { maxAmount: 50_000, idempotencyKey: key() }, meta);
    await setEndsIn(a.id, -10);
    await closeDueAuctions();
    expect(await row(a.id)).toMatchObject({ status: 'closed', winnerId: null, finalPrice: null, reserveMet: false });
    expect((await getAuctionResult(a.id)).outcome).toBe('reserve_not_met');
  });

  it('results are not published while the auction is live', async () => {
    const seller = await makeUser();
    const a = await makeAuction(seller);
    await expect(getAuctionResult(a.id)).rejects.toMatchObject({ code: 'AUCTION_LIVE' });
  });
});

describe('ledger integrity (E1, E2)', () => {
  it('the database refuses UPDATE and DELETE on bids', async () => {
    const seller = await makeUser();
    const alice = await makeUser();
    const a = await makeAuction(seller);
    await placeBid(alice, a.id, { maxAmount: 20_000, idempotencyKey: key() }, meta);
    await expect(db.execute(sql`update bids set max_amount = 1`)).rejects.toThrow();
    await expect(db.execute(sql`delete from bids`)).rejects.toThrow();
  });

  it('tampering with a bid behind the trigger’s back breaks the hash chain', async () => {
    const seller = await makeUser();
    const [alice, bob] = [await makeUser(), await makeUser()];
    const a = await makeAuction(seller);
    await placeBid(alice, a.id, { maxAmount: 20_000, idempotencyKey: key() }, meta);
    await placeBid(bob, a.id, { maxAmount: 25_000, idempotencyKey: key() }, meta);
    await placeBid(alice, a.id, { maxAmount: 30_000, idempotencyKey: key() }, meta);
    expect(await verifyAuctionChain(a.id)).toMatchObject({ valid: true, checked: 3 });

    // What a DBA with superuser rights could do: disable the trigger and rewrite history.
    await db.transaction(async (tx) => {
      await tx.execute(sql`alter table bids disable trigger bids_append_only`);
      await tx.execute(sql`update bids set max_amount = 99999 where auction_id = ${a.id} and seq = 2`);
      await tx.execute(sql`alter table bids enable trigger bids_append_only`);
    });
    expect(await verifyAuctionChain(a.id)).toMatchObject({ valid: false, brokenAtSeq: 2 });
  });

  it('deleting the newest bid is caught against the head stored on the auction', async () => {
    const seller = await makeUser();
    const [alice, bob] = [await makeUser(), await makeUser()];
    const a = await makeAuction(seller);
    await placeBid(alice, a.id, { maxAmount: 20_000, idempotencyKey: key() }, meta);
    await placeBid(bob, a.id, { maxAmount: 25_000, idempotencyKey: key() }, meta);
    await db.transaction(async (tx) => {
      await tx.execute(sql`alter table bids disable trigger bids_append_only`);
      await tx.execute(sql`delete from bids where auction_id = ${a.id} and seq = 2`);
      await tx.execute(sql`alter table bids enable trigger bids_append_only`);
    });
    expect(await verifyAuctionChain(a.id)).toMatchObject({ valid: false, brokenAtSeq: 2 });
  });
});
