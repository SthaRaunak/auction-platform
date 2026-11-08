import { and, asc, count, eq, gt, inArray, sql } from 'drizzle-orm';
import type { Executor } from '@/db';
import { bids } from './bid.schema';

export type BidRow = typeof bids.$inferSelect;

export function listBids(ex: Executor, auctionId: string) {
  return ex.select().from(bids).where(eq(bids.auctionId, auctionId)).orderBy(asc(bids.seq));
}

export async function findBidByIdempotencyKey(ex: Executor, key: string) {
  const [row] = await ex.select().from(bids).where(eq(bids.idempotencyKey, key));
  return row ?? null;
}

export async function insertBid(ex: Executor, row: typeof bids.$inferInsert) {
  const [created] = await ex.insert(bids).values(row).returning();
  return created;
}

export async function countBidsInLastMinute(ex: Executor) {
  const [row] = await ex.select({ n: count() }).from(bids).where(gt(bids.createdAt, sql`now() - interval '1 minute'`));
  return row.n;
}

export async function auctionIdsBidOnBy(ex: Executor, bidderId: string) {
  const rows = await ex
    .select({ auctionId: bids.auctionId, yourMax: sql<number>`max(${bids.maxAmount})`.mapWith(Number), lastAt: sql<Date>`max(${bids.createdAt})` })
    .from(bids)
    .where(eq(bids.bidderId, bidderId))
    .groupBy(bids.auctionId)
    .orderBy(sql`max(${bids.createdAt}) desc`);
  return rows;
}

export async function bidderIdsFor(ex: Executor, auctionId: string) {
  const rows = await ex.selectDistinct({ bidderId: bids.bidderId }).from(bids).where(eq(bids.auctionId, auctionId));
  return rows.map((r) => r.bidderId);
}

export async function maxOfBidder(ex: Executor, auctionIds: string[], bidderId: string) {
  if (!auctionIds.length) return new Map<string, number>();
  const rows = await ex
    .select({ auctionId: bids.auctionId, max: sql<number>`max(${bids.maxAmount})`.mapWith(Number) })
    .from(bids)
    .where(and(inArray(bids.auctionId, auctionIds), eq(bids.bidderId, bidderId)))
    .groupBy(bids.auctionId);
  return new Map(rows.map((r) => [r.auctionId, r.max]));
}
