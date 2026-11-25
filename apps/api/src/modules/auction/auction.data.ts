import type { ListAuctionsQuery } from '@bidwell/contract';
import { and, asc, count, desc, eq, gt, ilike, inArray, isNotNull, lt, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import type { Executor, Tx } from '@/db';
import { users } from '../auth/auth.schema';
import { reviews } from '../review/review.schema';
import { amendments, auctions, watchlist } from './auction.schema';

export type AuctionRow = typeof auctions.$inferSelect;
export type NewAuction = typeof auctions.$inferInsert;

export async function insertAuction(ex: Executor, row: NewAuction) {
  const [created] = await ex.insert(auctions).values(row).returning();
  return created;
}

export async function findAuctionById(ex: Executor, id: string) {
  const [row] = await ex.select().from(auctions).where(eq(auctions.id, id));
  return row ?? null;
}

/**
 * Row lock that serialises everything touching one auction — bids, edits,
 * closing, moderation (A2). Other auctions are unaffected.
 */
export async function lockAuction(tx: Tx, id: string) {
  const [row] = await tx.select().from(auctions).where(eq(auctions.id, id)).for('update');
  return row ?? null;
}

export async function updateAuctionRow(ex: Executor, id: string, patch: Partial<NewAuction>) {
  const [row] = await ex
    .update(auctions)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(eq(auctions.id, id))
    .returning();
  return row;
}

/** Closes only if still live — the conditional update is what makes closing idempotent (A1). */
export async function markClosed(tx: Tx, id: string, patch: Partial<NewAuction>) {
  const [row] = await tx
    .update(auctions)
    .set({ ...patch, status: 'closed', updatedAt: sql`now()` })
    .where(and(eq(auctions.id, id), eq(auctions.status, 'live')))
    .returning();
  return row ?? null;
}

export async function findDueForClose(ex: Executor, limit: number) {
  const rows = await ex
    .select({ id: auctions.id })
    .from(auctions)
    .where(and(eq(auctions.status, 'live'), eq(auctions.hidden, false), lte(auctions.endsAt, sql`now()`)))
    .orderBy(asc(auctions.endsAt))
    .limit(limit);
  return rows.map((r) => r.id);
}

// ── listing ─────────────────────────────────────────────────────────────────
const visibleLive = () => and(eq(auctions.status, 'live'), eq(auctions.hidden, false), lte(auctions.startsAt, sql`now()`));

function filtersFor(q: ListAuctionsQuery, opts: { skipBrand?: boolean } = {}): SQL[] {
  const where: SQL[] = [visibleLive()!];
  if (q.q) {
    const term = `%${q.q.replace(/[%_\\]/g, (c) => '\\' + c)}%`;
    // Matches the lot (either language), its make, or the selling office/bank by name.
    const sellerNamed = sql`exists (select 1 from ${users} where ${users.id} = ${auctions.sellerId} and ${users.displayName} ilike ${term})`;
    where.push(or(ilike(auctions.title, term), ilike(auctions.titleNe, term), ilike(auctions.brand, term), sellerNamed)!);
  }
  if (q.category) where.push(eq(auctions.category, q.category));
  if (!opts.skipBrand && q.brand.length) where.push(inArray(auctions.brand, q.brand));
  if (q.condition.length) where.push(inArray(auctions.condition, q.condition));
  if (q.delivery.length) where.push(inArray(auctions.delivery, q.delivery));
  if (q.ending === 'hour') where.push(lte(auctions.endsAt, sql`now() + interval '1 hour'`));
  if (q.ending === 'today') {
    where.push(lt(auctions.endsAt, sql`(date_trunc('day', now() at time zone 'Asia/Kathmandu') + interval '1 day') at time zone 'Asia/Kathmandu'`));
  }
  if (q.ending === 'week') where.push(lte(auctions.endsAt, sql`now() + interval '7 days'`));
  if (q.minPrice !== undefined) where.push(sql`${auctions.currentPrice} >= ${q.minPrice}`);
  if (q.maxPrice !== undefined) where.push(sql`${auctions.currentPrice} <= ${q.maxPrice}`);
  if (q.minRating !== undefined) {
    where.push(
      inArray(
        auctions.sellerId,
        sql`(select ${reviews.revieweeId} from ${reviews} where ${reviews.revieweeRole} = 'seller' group by ${reviews.revieweeId} having avg(${reviews.stars}) >= ${q.minRating})`,
      ),
    );
  }
  return where;
}

const SORTS = {
  ending_soonest: { col: auctions.endsAt, key: 'endsAt', dir: 'asc' },
  ending_latest: { col: auctions.endsAt, key: 'endsAt', dir: 'desc' },
  newly_listed: { col: auctions.createdAt, key: 'createdAt', dir: 'desc' },
  price_asc: { col: auctions.currentPrice, key: 'currentPrice', dir: 'asc' },
  price_desc: { col: auctions.currentPrice, key: 'currentPrice', dir: 'desc' },
  most_bids: { col: auctions.bidCount, key: 'bidCount', dir: 'desc' },
  fewest_bids: { col: auctions.bidCount, key: 'bidCount', dir: 'asc' },
} as const;

type CursorValue = string | number;

function encodeCursor(value: CursorValue, id: string) {
  return Buffer.from(JSON.stringify([value, id])).toString('base64url');
}

function decodeCursor(cursor: string): [CursorValue, string] | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    if (Array.isArray(parsed) && parsed.length === 2 && typeof parsed[1] === 'string') return parsed as [CursorValue, string];
  } catch {}
  return null;
}

/**
 * Keyset pagination: (sort value, id) after the cursor. Live values (price,
 * end time) can move between pages — an accepted trade-off for a list that
 * polls every few seconds anyway (see docs/decisions.md B3).
 */
export async function listAuctionRows(ex: Executor, q: ListAuctionsQuery) {
  const where = filtersFor(q);
  const sort = SORTS[q.sort];
  const cursor = q.cursor ? decodeCursor(q.cursor) : null;
  const pageWhere = [...where];
  if (cursor) {
    const [v, id] = cursor;
    const value: Date | number = sort.key === 'endsAt' || sort.key === 'createdAt' ? new Date(v) : Number(v);
    const beyond = sort.dir === 'asc' ? gt(sort.col, value) : lt(sort.col, value);
    pageWhere.push(or(beyond, and(eq(sort.col, value), gt(auctions.id, id)))!);
  }

  const rows = await ex
    .select()
    .from(auctions)
    .where(and(...pageWhere))
    .orderBy(sort.dir === 'asc' ? asc(sort.col) : desc(sort.col), asc(auctions.id))
    .limit(q.limit + 1);

  const hasMore = rows.length > q.limit;
  const page = rows.slice(0, q.limit);
  const last = page[page.length - 1];
  let nextCursor: string | null = null;
  if (hasMore && last) {
    const v = last[sort.key];
    nextCursor = encodeCursor(v instanceof Date ? v.toISOString() : v, last.id);
  }

  const [totals] = await ex
    .select({
      total: count(),
      endingWithinHour: sql<number>`count(*) filter (where ${auctions.endsAt} <= now() + interval '1 hour')`.mapWith(Number),
    })
    .from(auctions)
    .where(and(...where));

  return { rows: page, nextCursor, total: totals.total, endingWithinHour: totals.endingWithinHour };
}

export function brandFacetRows(ex: Executor, q: ListAuctionsQuery) {
  return ex
    .select({ brand: sql<string>`${auctions.brand}`, count: count() })
    .from(auctions)
    .where(and(...filtersFor(q, { skipBrand: true }), isNotNull(auctions.brand)))
    .groupBy(auctions.brand)
    .orderBy(desc(count()), asc(auctions.brand))
    .limit(60);
}

export async function liveCounts(ex: Executor) {
  const [row] = await ex
    .select({
      openLots: count(),
      endingWithinHour: sql<number>`count(*) filter (where ${auctions.endsAt} <= now() + interval '1 hour')`.mapWith(Number),
    })
    .from(auctions)
    .where(visibleLive());
  return row;
}

export function endingSoonRows(ex: Executor, limit: number) {
  return ex.select().from(auctions).where(visibleLive()).orderBy(asc(auctions.endsAt)).limit(limit);
}

export function similarRows(ex: Executor, auction: AuctionRow, limit: number) {
  return ex
    .select()
    .from(auctions)
    .where(and(visibleLive(), eq(auctions.category, auction.category), ne(auctions.id, auction.id)))
    .orderBy(asc(auctions.endsAt))
    .limit(limit);
}

export function rowsByIds(ex: Executor, ids: string[]) {
  if (!ids.length) return Promise.resolve([] as AuctionRow[]);
  return ex.select().from(auctions).where(inArray(auctions.id, ids));
}

export function rowsBySeller(ex: Executor, sellerId: string) {
  return ex.select().from(auctions).where(eq(auctions.sellerId, sellerId)).orderBy(desc(auctions.createdAt));
}

/** A seller's lots for their public profile: live ones by end time, ended ones newest first. */
export function sellerListingRows(ex: Executor, sellerId: string, which: 'live' | 'ended', includeHidden: boolean) {
  const where = [eq(auctions.sellerId, sellerId), which === 'live' ? eq(auctions.status, 'live') : ne(auctions.status, 'live')];
  if (!includeHidden) where.push(eq(auctions.hidden, false));
  return ex
    .select()
    .from(auctions)
    .where(and(...where))
    .orderBy(which === 'live' ? asc(auctions.endsAt) : desc(auctions.endsAt))
    .limit(60);
}

export async function profileCountRows(ex: Executor, userId: string) {
  const [listed] = await ex
    .select({
      listed: count(),
      sold: sql<number>`count(*) filter (where ${auctions.status} = 'closed' and ${auctions.winnerId} is not null)`.mapWith(Number),
    })
    .from(auctions)
    .where(eq(auctions.sellerId, userId));
  const [won] = await ex
    .select({ n: count() })
    .from(auctions)
    .where(and(eq(auctions.winnerId, userId), eq(auctions.status, 'closed')));
  return { listed: listed.listed, sold: listed.sold, won: won.n };
}

// ── sellers ─────────────────────────────────────────────────────────────────
export async function sellerSummaryRows(ex: Executor, sellerIds: string[]) {
  if (!sellerIds.length) return [];
  const ratings = ex
    .select({
      sellerId: reviews.revieweeId,
      avg: sql<string>`avg(${reviews.stars})`.as('avg'),
      n: count().as('n'),
    })
    .from(reviews)
    .where(eq(reviews.revieweeRole, 'seller'))
    .groupBy(reviews.revieweeId)
    .as('r');
  const sales = ex
    .select({ sellerId: auctions.sellerId, n: count().as('sales_n') })
    .from(auctions)
    .where(and(eq(auctions.status, 'closed'), isNotNull(auctions.winnerId)))
    .groupBy(auctions.sellerId)
    .as('s');
  return ex
    .select({
      id: users.id,
      displayName: users.displayName,
      createdAt: users.createdAt,
      rating: ratings.avg,
      ratingCount: ratings.n,
      sales: sales.n,
    })
    .from(users)
    .leftJoin(ratings, eq(ratings.sellerId, users.id))
    .leftJoin(sales, eq(sales.sellerId, users.id))
    .where(inArray(users.id, sellerIds));
}

// ── watchlist ───────────────────────────────────────────────────────────────
export async function addWatch(ex: Executor, userId: string, auctionId: string) {
  await ex.insert(watchlist).values({ userId, auctionId }).onConflictDoNothing();
}

export async function removeWatch(ex: Executor, userId: string, auctionId: string) {
  await ex.delete(watchlist).where(and(eq(watchlist.userId, userId), eq(watchlist.auctionId, auctionId)));
}

export async function watchedAmong(ex: Executor, userId: string, auctionIds: string[]) {
  if (!auctionIds.length) return new Set<string>();
  const rows = await ex
    .select({ auctionId: watchlist.auctionId })
    .from(watchlist)
    .where(and(eq(watchlist.userId, userId), inArray(watchlist.auctionId, auctionIds)));
  return new Set(rows.map((r) => r.auctionId));
}

export async function countWatched(ex: Executor, userId: string) {
  const [row] = await ex.select({ n: count() }).from(watchlist).where(eq(watchlist.userId, userId));
  return row.n;
}

export function watchedRows(ex: Executor, userId: string) {
  return ex
    .select({ auction: auctions })
    .from(watchlist)
    .innerJoin(auctions, eq(auctions.id, watchlist.auctionId))
    .where(eq(watchlist.userId, userId))
    .orderBy(asc(auctions.endsAt));
}

export async function watcherIds(ex: Executor, auctionId: string) {
  const rows = await ex.select({ userId: watchlist.userId }).from(watchlist).where(eq(watchlist.auctionId, auctionId));
  return rows.map((r) => r.userId);
}

// ── amendments ──────────────────────────────────────────────────────────────
export async function insertAmendment(ex: Executor, row: typeof amendments.$inferInsert) {
  const [created] = await ex.insert(amendments).values(row).returning();
  return created;
}

export function amendmentRows(ex: Executor, auctionId: string) {
  return ex.select().from(amendments).where(eq(amendments.auctionId, auctionId)).orderBy(asc(amendments.createdAt));
}
