import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { deps } from '@/deps';
import { auditLog } from '@/modules/audit/audit.schema';
import { listingsBy } from '@/modules/auction/auction.usecase';
import { closeAuction, getAuctionDetail, placeBid } from '@/modules/bid/bid.usecase';
import { listComments, postComment, removeComment } from '@/modules/comment/comment.usecase';
import * as mod from '@/modules/moderation/moderation.usecase';
import { ratingSummaries, reviewsReceived, submitReview } from '@/modules/review/review.usecase';
import { Client, startServer } from './http';
import { drainAll, key, makeAuction, makeUser, meta, resetDb, setEndsIn } from './helpers';

beforeEach(resetDb);

async function completedSale() {
  const seller = await makeUser();
  const [winner, loser] = [await makeUser(), await makeUser()];
  const a = await makeAuction(seller);
  await placeBid(loser, a.id, { maxAmount: 20_000, idempotencyKey: key() }, meta);
  await placeBid(winner, a.id, { maxAmount: 30_000, idempotencyKey: key() }, meta);
  await setEndsIn(a.id, -10);
  await closeAuction(a.id);
  return { seller, winner, loser, a };
}

describe('two-way reviews', () => {
  it('the winner reviews the seller and the seller reviews the winner, once each', async () => {
    const { seller, winner, a } = await completedSale();
    expect((await getAuctionDetail(a.id, winner)).viewer.review).toEqual({ revieweeName: seller.displayName, revieweeRole: 'seller' });
    expect((await getAuctionDetail(a.id, seller)).viewer.review).toEqual({ revieweeName: winner.displayName, revieweeRole: 'buyer' });

    await submitReview(winner, a.id, { stars: 4, comment: 'As described.' });
    await submitReview(seller, a.id, { stars: 5, comment: 'Paid promptly.' });
    await expect(submitReview(winner, a.id, { stars: 1, comment: '' })).rejects.toMatchObject({ code: 'ALREADY_REVIEWED' });
    expect((await getAuctionDetail(a.id, winner)).viewer.review).toBeNull();

    expect(await ratingSummaries(seller.id)).toEqual({ seller: { average: 4, count: 1 }, buyer: { average: null, count: 0 } });
    expect(await ratingSummaries(winner.id)).toEqual({ seller: { average: null, count: 0 }, buyer: { average: 5, count: 1 } });
    const [received] = await reviewsReceived(winner.id);
    expect(received).toMatchObject({ stars: 5, revieweeRole: 'buyer', reviewer: { id: seller.id }, auctionTitle: a.title });
  });

  it('losing bidders and outsiders cannot review, and nobody can review a live or unsold lot', async () => {
    const { loser, a } = await completedSale();
    await expect(submitReview(loser, a.id, { stars: 1, comment: '' })).rejects.toMatchObject({ code: 'NOT_A_PARTY' });
    const seller = await makeUser();
    const live = await makeAuction(seller);
    await expect(submitReview(seller, live.id, { stars: 5, comment: '' })).rejects.toMatchObject({ code: 'NOT_A_PARTY' });
  });
});

describe('comments', () => {
  it('verified users comment; the seller is flagged and emailed', async () => {
    const seller = await makeUser();
    const asker = await makeUser();
    const a = await makeAuction(seller);
    await postComment(asker, a.id, 'Is the bluebook up to date?');
    await postComment(seller, a.id, 'Yes, tax cleared to 2081/82.');
    await drainAll();

    const thread = await listComments(a.id, null);
    expect(thread.map((c) => [c.author.displayName, c.author.isSeller, c.body])).toEqual([
      [asker.displayName, false, 'Is the bluebook up to date?'],
      [seller.displayName, true, 'Yes, tax cleared to 2081/82.'],
    ]);
    expect(deps.mailbox.filter((m) => m.to === seller.email && /New comment/.test(m.subject))).toHaveLength(1);
  });

  it('unverified users cannot comment, and a voided lot’s thread is closed', async () => {
    const seller = await makeUser();
    const moderator = await makeUser({ role: 'moderator' });
    const a = await makeAuction(seller);
    await expect(postComment(await makeUser({ emailVerifiedAt: null }), a.id, 'hi')).rejects.toMatchObject({ code: 'EMAIL_UNVERIFIED' });
    await mod.moderateAuction(moderator, a.id, { action: 'void', reason: 'Listing duplicated another notice.' });
    await expect(postComment(await makeUser(), a.id, 'hello?')).rejects.toMatchObject({ code: 'COMMENTS_CLOSED' });
  });

  it('authors withdraw their own; moderators must give a reason, which is audited and shown', async () => {
    const seller = await makeUser();
    const [author, other] = [await makeUser(), await makeUser()];
    const moderator = await makeUser({ role: 'moderator' });
    const a = await makeAuction(seller);
    const mine = await postComment(author, a.id, 'Oops, wrong lot');
    const spam = await postComment(author, a.id, 'Call me for cheap parts');

    await expect(removeComment(other, spam.id, undefined)).rejects.toMatchObject({ code: 'NOT_AUTHOR' });
    await removeComment(author, mine.id, undefined);
    await expect(removeComment(moderator, spam.id, undefined)).rejects.toMatchObject({ code: 'REASON_REQUIRED' });
    await removeComment(moderator, spam.id, 'Advertising is not allowed.');

    const thread = await listComments(a.id, other);
    expect(thread.map((c) => [c.body, c.removed?.by, c.removed?.reason])).toEqual([
      ['', 'author', null],
      ['', 'moderator', 'Advertising is not allowed.'],
    ]);
    const audit = await db.select().from(auditLog).where(eq(auditLog.action, 'comment.removed'));
    expect(audit).toHaveLength(1);
  });
});

describe('public profiles', () => {
  let server: Awaited<ReturnType<typeof startServer>>;
  beforeAll(async () => (server = await startServer()));
  afterAll(async () => server.close());

  it('lists what a user auctioned (hidden lots only for the owner or staff) and never what they bid on', async () => {
    const seller = await makeUser();
    const moderator = await makeUser({ role: 'moderator' });
    const visible = await makeAuction(seller, { title: 'Visible lot for profile' });
    const hidden = await makeAuction(seller, { title: 'Hidden lot for profile' });
    await mod.moderateAuction(moderator, hidden.id, { action: 'hide', reason: 'Checking the listing.' });
    const bidder = await makeUser();
    await placeBid(bidder, visible.id, { maxAmount: 20_000, idempotencyKey: key() }, meta);

    expect((await listingsBy(seller.id, null, 'live')).map((c) => c.id)).toEqual([visible.id]);
    expect((await listingsBy(seller.id, seller, 'live')).map((c) => c.id).sort()).toEqual([visible.id, hidden.id].sort());
    expect(await listingsBy(bidder.id, null, 'live')).toEqual([]);

    const c = new Client(server.base);
    const profile = await c.req('GET', `/api/users/${bidder.id}`);
    expect(profile).toMatchObject({ status: 200, body: { displayName: bidder.displayName, lotsListed: 0, lotsWon: 0 } });
    expect(JSON.stringify(profile.body)).not.toContain(visible.id);
    expect((await c.req('GET', `/api/users/${seller.id}/listings?status=live`)).body.items).toHaveLength(1);
  });
});
