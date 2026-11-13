import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { deps } from '@/deps';
import { amendments } from '@/modules/auction/auction.schema';
import { updateAuction } from '@/modules/auction/auction.usecase';
import { bids } from '@/modules/bid/bid.schema';
import { getAuctionDetail, getAuctionResult, placeBid } from '@/modules/bid/bid.usecase';
import * as mod from '@/modules/moderation/moderation.usecase';
import { deposits } from '@/modules/payment/payment.schema';
import { payDeposit } from '@/modules/payment/payment.usecase';
import { closeDueAuctions } from '@/workers/closer';
import { drainAll, key, makeAuction, makeUser, meta, resetDb, setEndsIn } from './helpers';

beforeEach(resetDb);

describe('edits after the first bid (A6)', () => {
  it('everything is editable before a bid, and each edit is logged', async () => {
    const seller = await makeUser();
    const a = await makeAuction(seller);
    await updateAuction(seller, a.id, { startPrice: 20_000, title: 'Toyota Hilux (2010), condemned' });
    const [log] = await db.select().from(amendments).where(eq(amendments.auctionId, a.id));
    expect(log.afterBids).toBe(false);
    expect(log.changes.map((c) => c.field).sort()).toEqual(['startPrice', 'title']);
  });

  it('freezes material fields once a bid lands, but allows description and added photos', async () => {
    const seller = await makeUser();
    const alice = await makeUser();
    const a = await makeAuction(seller, { images: ['/api/uploads/one.jpg'] });
    await placeBid(alice, a.id, { maxAmount: 20_000, idempotencyKey: key() }, meta);

    await expect(updateAuction(seller, a.id, { reservePrice: 50_000 })).rejects.toMatchObject({ code: 'MATERIAL_FIELDS_FROZEN', details: { fields: ['reservePrice'] } });
    await expect(updateAuction(seller, a.id, { endsAt: new Date(Date.now() + 86_400_000).toISOString() })).rejects.toMatchObject({ code: 'MATERIAL_FIELDS_FROZEN' });
    await expect(updateAuction(seller, a.id, { images: ['/api/uploads/two.jpg'] })).rejects.toMatchObject({ code: 'MATERIAL_FIELDS_FROZEN' });

    await updateAuction(seller, a.id, { description: 'Boxed. Small mark on the base plate — see photo 2.', images: ['/api/uploads/one.jpg', '/api/uploads/two.jpg'] });
    const detail = await getAuctionDetail(a.id, null);
    expect(detail.amendments).toHaveLength(1);
    expect(detail.amendments[0].afterBids).toBe(true);
  });

  it('only the seller can edit', async () => {
    const seller = await makeUser();
    const other = await makeUser();
    const a = await makeAuction(seller);
    await expect(updateAuction(other, a.id, { title: 'Mine now, honest' })).rejects.toMatchObject({ code: 'NOT_SELLER' });
  });
});

describe('moderation and takedown (E6, C6)', () => {
  it('hide pauses bidding and drops the lot from listings; restore guarantees time remains', async () => {
    const seller = await makeUser();
    const mod1 = await makeUser({ role: 'moderator' });
    const alice = await makeUser();
    const a = await makeAuction(seller);

    await mod.moderateAuction(mod1, a.id, { action: 'hide', reason: 'Checking the listing photos are genuine.' });
    await expect(placeBid(alice, a.id, { maxAmount: 20_000, idempotencyKey: key() }, meta)).rejects.toMatchObject({ code: 'AUCTION_PAUSED' });
    expect((await getAuctionDetail(a.id, null)).moderation).toMatchObject({ kind: 'hidden', reason: 'Checking the listing photos are genuine.' });

    await setEndsIn(a.id, 60_000);
    await mod.moderateAuction(mod1, a.id, { action: 'restore', reason: 'Photos verified with the seller.' });
    const restored = await getAuctionDetail(a.id, null);
    expect(new Date(restored.endsAt).getTime() - Date.now()).toBeGreaterThan(9 * 60_000);
  });

  it('void keeps every bid in the ledger, publishes the reason, refunds deposits and tells every bidder', async () => {
    const seller = await makeUser();
    const moderator = await makeUser({ role: 'moderator' });
    const [alice, bob] = [await makeUser(), await makeUser()];
    const a = await makeAuction(seller, { emdAmount: 5_000 });
    await payDeposit(alice, a.id);
    await payDeposit(bob, a.id);
    await placeBid(alice, a.id, { maxAmount: 20_000, idempotencyKey: key() }, meta);
    await placeBid(bob, a.id, { maxAmount: 30_000, idempotencyKey: key() }, meta);

    await mod.moderateAuction(moderator, a.id, { action: 'void', reason: 'Listing infringes a trademark.' });
    await drainAll();

    expect(await db.select().from(bids).where(eq(bids.auctionId, a.id))).toHaveLength(2);
    const result = await getAuctionResult(a.id);
    expect(result).toMatchObject({ outcome: 'voided', voidReason: 'Listing infringes a trademark.', winnerName: null, chain: { valid: true } });
    expect((await db.select().from(deposits)).map((d) => d.status)).toEqual(['refunded', 'refunded']);
    for (const u of [alice, bob, seller]) expect(deps.mailbox.some((m) => m.to === u.email && /voided/.test(m.subject))).toBe(true);

    const audit = await mod.listAudit(moderator);
    expect(audit[0]).toMatchObject({ action: 'auction.voided', actorName: moderator.displayName, reason: 'Listing infringes a trademark.' });
  });

  it('non-staff cannot moderate', async () => {
    const seller = await makeUser();
    const a = await makeAuction(seller);
    await expect(mod.moderateAuction(seller, a.id, { action: 'hide', reason: 'I would like to hide my own lot.' })).rejects.toMatchObject({ code: 'STAFF_ONLY' });
  });

  it('appeals: the deciding moderator can’t rule on their own decision; an overturned hide restores the lot', async () => {
    const seller = await makeUser();
    const [m1, m2] = [await makeUser({ role: 'moderator' }), await makeUser({ role: 'moderator' })];
    const a = await makeAuction(seller);
    await mod.moderateAuction(m1, a.id, { action: 'hide', reason: 'Suspected counterfeit item.' });

    const [action] = await mod.myModerationActions(seller);
    const appeal = await mod.fileAppeal(seller, { actionId: action.id, text: 'Here is the purchase receipt from the authorised dealer.' });
    await expect(mod.resolveAppeal(m1, appeal.id, { decision: 'overturned', note: 'Looks fine.' })).rejects.toMatchObject({ code: 'SAME_MODERATOR' });

    await mod.resolveAppeal(m2, appeal.id, { decision: 'overturned', note: 'Receipt checks out with the dealer.' });
    expect((await getAuctionDetail(a.id, null)).hidden).toBe(false);
  });
});

describe('earnest money deposits (E9)', () => {
  it('requires a deposit to bid, then applies the winner’s and refunds the rest at close', async () => {
    const seller = await makeUser();
    const [alice, bob] = [await makeUser(), await makeUser()];
    const a = await makeAuction(seller, { emdAmount: 5_000 });

    await expect(placeBid(alice, a.id, { maxAmount: 20_000, idempotencyKey: key() }, meta)).rejects.toMatchObject({ code: 'DEPOSIT_REQUIRED' });
    await payDeposit(alice, a.id);
    await payDeposit(bob, a.id);
    await payDeposit(bob, a.id); // idempotent
    await placeBid(alice, a.id, { maxAmount: 20_000, idempotencyKey: key() }, meta);
    await placeBid(bob, a.id, { maxAmount: 30_000, idempotencyKey: key() }, meta);

    await setEndsIn(a.id, -10);
    await closeDueAuctions();
    await drainAll();
    const rows = await db.select().from(deposits);
    expect(Object.fromEntries(rows.map((d) => [d.userId, d.status]))).toEqual({ [alice.id]: 'refunded', [bob.id]: 'applied' });
  });
});
