import type { RatingSummary, Review, ReviewInput, ReviewRole } from '@bidwell/contract';
import { db } from '@/db';
import { conflict, forbidden } from '@/errors';
import { getAuction, type AuctionRow } from '../auction/auction.usecase';
import { getUser, initialsOf, type UserRow } from '../auth/auth.usecase';
import { findReviewBy, insertReview, ratingRows, reviewsReceivedRows } from './review.data';

/** The other party to a completed sale, from `user`'s side — or null if they weren't a party. */
function counterparty(user: UserRow, a: AuctionRow): { revieweeId: string; revieweeRole: ReviewRole } | null {
  if (a.status !== 'closed' || !a.winnerId) return null;
  if (user.id === a.winnerId) return { revieweeId: a.sellerId, revieweeRole: 'seller' };
  if (user.id === a.sellerId) return { revieweeId: a.winnerId, revieweeRole: 'buyer' };
  return null;
}

/** What the viewer may still review on this lot (shown on the lot page), or null. */
export async function pendingReview(user: UserRow | null, a: AuctionRow) {
  if (!user) return null;
  const party = counterparty(user, a);
  if (!party || (await findReviewBy(db, a.id, user.id))) return null;
  const reviewee = await getUser(party.revieweeId);
  return reviewee ? { revieweeName: reviewee.displayName, revieweeRole: party.revieweeRole } : null;
}

/** Winner reviews the seller; seller reviews the winner. Once each, only after a completed sale. */
export async function submitReview(user: UserRow, auctionId: string, input: ReviewInput) {
  const a = await getAuction(auctionId);
  const party = counterparty(user, a);
  if (!party) throw forbidden('NOT_A_PARTY', 'Only the seller and the winning bidder can review a completed sale.');
  const created = await insertReview(db, { auctionId, reviewerId: user.id, ...party, stars: input.stars, comment: input.comment });
  if (!created) throw conflict('ALREADY_REVIEWED', 'You’ve already reviewed this sale.');
  return created;
}

export async function reviewsReceived(userId: string): Promise<Review[]> {
  const rows = await reviewsReceivedRows(db, userId);
  return rows.map(({ review, auctionTitle, lotNo, reviewerName }) => ({
    id: review.id,
    auctionId: review.auctionId,
    auctionTitle,
    lotNo,
    reviewer: { id: review.reviewerId, displayName: reviewerName, initials: initialsOf(reviewerName) },
    revieweeRole: review.revieweeRole,
    stars: review.stars,
    comment: review.comment,
    at: review.createdAt.toISOString(),
  }));
}

export async function ratingSummaries(userId: string): Promise<Record<ReviewRole, RatingSummary>> {
  const out: Record<ReviewRole, RatingSummary> = { seller: { average: null, count: 0 }, buyer: { average: null, count: 0 } };
  for (const r of await ratingRows(db, userId)) {
    out[r.role] = { average: r.average === null ? null : Math.round(Number(r.average) * 10) / 10, count: r.n };
  }
  return out;
}
