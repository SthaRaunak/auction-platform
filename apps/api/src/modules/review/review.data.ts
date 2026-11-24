import { and, avg, count, desc, eq } from 'drizzle-orm';
import type { Executor } from '@/db';
import { auctions } from '../auction/auction.schema';
import { users } from '../auth/auth.schema';
import { reviews } from './review.schema';

export async function insertReview(ex: Executor, row: typeof reviews.$inferInsert) {
  const [created] = await ex.insert(reviews).values(row).onConflictDoNothing().returning();
  return created ?? null;
}

export async function findReviewBy(ex: Executor, auctionId: string, reviewerId: string) {
  const [row] = await ex
    .select()
    .from(reviews)
    .where(and(eq(reviews.auctionId, auctionId), eq(reviews.reviewerId, reviewerId)));
  return row ?? null;
}

export function reviewsReceivedRows(ex: Executor, userId: string) {
  return ex
    .select({ review: reviews, auctionTitle: auctions.title, auctionTitleNe: auctions.titleNe, lotNo: auctions.lotNo, reviewerName: users.displayName })
    .from(reviews)
    .innerJoin(auctions, eq(auctions.id, reviews.auctionId))
    .innerJoin(users, eq(users.id, reviews.reviewerId))
    .where(eq(reviews.revieweeId, userId))
    .orderBy(desc(reviews.createdAt))
    .limit(200);
}

export function ratingRows(ex: Executor, userId: string) {
  return ex
    .select({ role: reviews.revieweeRole, average: avg(reviews.stars), n: count() })
    .from(reviews)
    .where(eq(reviews.revieweeId, userId))
    .groupBy(reviews.revieweeRole);
}
