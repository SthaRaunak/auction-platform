import {
  DEFAULT_INCREMENT_BANDS,
  MATERIAL_FIELDS,
  type Amendment,
  type AuctionCard,
  type AuctionCreateInput,
  type AuctionList,
  type AuctionUpdateInput,
  type BrandFacet,
  type ListAuctionsQuery,
  type SellerSummary,
} from '@bidwell/contract';
import { db, type Executor, type Tx } from '@/db';
import { deps } from '@/deps';
import { badRequest, conflict, forbidden, notFound } from '@/errors';
import { initialsOf, requireVerified, type UserRow } from '../auth/auth.usecase';
import { enqueueEvents } from '../outbox/outbox.usecase';
import {
  addWatch,
  amendmentRows,
  brandFacetRows,
  countWatched,
  endingSoonRows,
  findAuctionById,
  findDueForClose,
  insertAmendment,
  insertAuction,
  listAuctionRows,
  liveCounts,
  lockAuction,
  markClosed,
  removeWatch,
  rowsByIds,
  rowsBySeller,
  sellerListingRows,
  profileCountRows,
  sellerSummaryRows,
  similarRows,
  updateAuctionRow,
  watchedAmong,
  watchedRows,
  watcherIds,
  type AuctionRow,
  type NewAuction,
} from './auction.data';

export type { AuctionRow };

const MIN_DURATION_MS = 5 * 60_000;
const MAX_DURATION_MS = 30 * 86_400_000;
const UPLOAD_PATH = /^\/api\/uploads\/[A-Za-z0-9_-]+\.(jpe?g|png|webp)$/;

// ── reads ───────────────────────────────────────────────────────────────────
export async function getAuction(id: string, ex: Executor = db) {
  const row = await findAuctionById(ex, id);
  if (!row) throw notFound('Auction');
  return row;
}

export async function sellerSummaries(ids: string[]): Promise<Map<string, SellerSummary>> {
  const rows = await sellerSummaryRows(db, [...new Set(ids)]);
  return new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        displayName: r.displayName,
        initials: initialsOf(r.displayName),
        rating: r.rating === null ? null : Math.round(Number(r.rating) * 10) / 10,
        ratingCount: Number(r.ratingCount ?? 0),
        sales: Number(r.sales ?? 0),
        memberSince: r.createdAt.toISOString(),
      },
    ]),
  );
}

export async function toCards(rows: AuctionRow[], viewerId: string | null): Promise<AuctionCard[]> {
  const [sellers, watched] = await Promise.all([
    sellerSummaries(rows.map((r) => r.sellerId)),
    viewerId ? watchedAmong(db, viewerId, rows.map((r) => r.id)) : Promise.resolve(new Set<string>()),
  ]);
  return rows.map((r) => ({
    id: r.id,
    lotNo: r.lotNo,
    title: r.title,
    titleNe: r.titleNe,
    category: r.category,
    brand: r.brand,
    condition: r.condition,
    delivery: r.delivery,
    shippingCost: r.shippingCost,
    location: r.location,
    currency: r.currency,
    price: r.currentPrice,
    startPrice: r.startPrice,
    bidCount: r.bidCount,
    endsAt: r.endsAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    status: r.status,
    hidden: r.hidden,
    image: r.images[0] ?? null,
    seller: sellers.get(r.sellerId)!,
    watched: watched.has(r.id),
    viewerIsLeader: viewerId !== null && r.leaderId === viewerId,
  }));
}

export async function listAuctions(q: ListAuctionsQuery, viewerId: string | null): Promise<AuctionList> {
  const { rows, nextCursor, total, endingWithinHour } = await listAuctionRows(db, q);
  return { items: await toCards(rows, viewerId), nextCursor, total, endingWithinHour };
}

export async function brandFacets(q: ListAuctionsQuery): Promise<BrandFacet[]> {
  return brandFacetRows(db, q);
}

export function marketCounts() {
  return liveCounts(db);
}

export async function endingSoon(limit: number, viewerId: string | null) {
  return toCards(await endingSoonRows(db, limit), viewerId);
}

export async function similarTo(auction: AuctionRow, viewerId: string | null) {
  return toCards(await similarRows(db, auction, 4), viewerId);
}

export async function auctionsByIds(ids: string[], viewerId: string | null) {
  const rows = await rowsByIds(db, ids);
  return toCards(rows, viewerId);
}

export async function myListings(user: UserRow) {
  return toCards(await rowsBySeller(db, user.id), user.id);
}

/** Lots on a user's public profile. Hidden lots show only to their seller and to staff. */
export async function listingsBy(sellerId: string, viewer: UserRow | null, which: 'live' | 'ended') {
  const privileged = viewer?.id === sellerId || viewer?.role === 'moderator' || viewer?.role === 'admin';
  return toCards(await sellerListingRows(db, sellerId, which, privileged), viewer?.id ?? null);
}

export function profileCounts(userId: string) {
  return profileCountRows(db, userId);
}

export async function amendmentsFor(auctionId: string): Promise<Amendment[]> {
  const rows = await amendmentRows(db, auctionId);
  return rows.map((r) => ({ id: r.id, at: r.createdAt.toISOString(), afterBids: r.afterBids, changes: r.changes }));
}

export function dueForClose(limit = 50) {
  return findDueForClose(db, limit);
}

// ── watchlist ───────────────────────────────────────────────────────────────
export async function setWatched(user: UserRow, auctionId: string, watched: boolean) {
  await getAuction(auctionId);
  if (watched) await addWatch(db, user.id, auctionId);
  else await removeWatch(db, user.id, auctionId);
  return { watched, watchCount: await countWatched(db, user.id) };
}

export function watchCount(userId: string) {
  return countWatched(db, userId);
}

export async function isWatching(userId: string, auctionId: string) {
  return (await watchedAmong(db, userId, [auctionId])).has(auctionId);
}

export async function myWatchlist(user: UserRow) {
  const rows = await watchedRows(db, user.id);
  return toCards(
    rows.map((r) => r.auction),
    user.id,
  );
}

export function watchersOf(ex: Executor, auctionId: string) {
  return watcherIds(ex, auctionId);
}

// ── create & edit ───────────────────────────────────────────────────────────
function checkImages(images: string[]) {
  const bad = images.find((src) => !UPLOAD_PATH.test(src));
  if (bad) throw badRequest('INVALID_IMAGE', 'Photos must be uploaded through Bidwell.');
}

function checkSchedule(startsAt: Date, endsAt: Date, now: Date) {
  if (endsAt.getTime() - Math.max(now.getTime(), startsAt.getTime()) < MIN_DURATION_MS) {
    throw badRequest('DURATION_TOO_SHORT', 'Auctions must run for at least 5 minutes.');
  }
  if (endsAt.getTime() - startsAt.getTime() > MAX_DURATION_MS) {
    throw badRequest('DURATION_TOO_LONG', 'Auctions can run for at most 30 days.');
  }
}

function checkPrices(p: { startPrice: number; reservePrice?: number | null; emdAmount?: number | null }) {
  if (p.reservePrice != null && p.reservePrice < p.startPrice) {
    throw badRequest('RESERVE_BELOW_START', 'The reserve can’t be lower than the starting price.');
  }
  if (p.emdAmount != null && p.emdAmount > p.startPrice * 10) {
    throw badRequest('EMD_TOO_HIGH', 'The deposit is unreasonably high for this starting price.');
  }
}

export async function createAuction(user: UserRow, input: AuctionCreateInput) {
  requireVerified(user);
  checkImages(input.images);
  checkPrices(input);
  const now = deps.clock.now();
  const startsAt = input.startsAt ? new Date(input.startsAt) : now;
  const endsAt = new Date(input.endsAt);
  checkSchedule(startsAt, endsAt, now);

  const row: NewAuction = {
    sellerId: user.id,
    title: input.title,
    titleNe: input.titleNe?.trim() || null,
    description: input.description,
    descriptionNe: input.descriptionNe?.trim() || null,
    category: input.category,
    brand: input.brand || null,
    condition: input.condition,
    specs: input.specs,
    images: input.images,
    delivery: input.delivery,
    shippingCost: input.delivery === 'paid_shipping' ? (input.shippingCost ?? 0) : null,
    location: input.location,
    startPrice: input.startPrice,
    reservePrice: input.reservePrice ?? null,
    incrementBands: input.incrementBands ?? DEFAULT_INCREMENT_BANDS,
    emdAmount: input.emdAmount || null,
    startsAt,
    endsAt,
    originalEndsAt: endsAt,
    softCloseWindowSec: input.softCloseWindowSec ?? 120,
    softCloseExtendSec: input.softCloseExtendSec ?? 120,
    currentPrice: input.startPrice,
  };
  return insertAuction(db, row);
}

const comparable = (v: unknown) => JSON.stringify(v instanceof Date ? v.toISOString() : (v ?? null));

/**
 * Edits (A6). Before the first bid every field is editable. After it, material
 * fields are frozen and photos can only be added. Every accepted edit is
 * appended to the public amendment log, and watchers/bidders are notified.
 */
export async function updateAuction(user: UserRow, auctionId: string, patch: AuctionUpdateInput) {
  requireVerified(user);
  return db.transaction(async (tx) => {
    const current = await lockAuction(tx, auctionId);
    if (!current) throw notFound('Auction');
    if (current.sellerId !== user.id) throw forbidden('NOT_SELLER', 'Only the seller can edit this auction.');
    if (current.status !== 'live') throw conflict('AUCTION_ENDED', 'This auction has ended and can no longer be edited.');

    const next: Record<string, unknown> = { ...patch };
    if (patch.startsAt !== undefined) next.startsAt = new Date(patch.startsAt);
    if (patch.endsAt !== undefined) next.endsAt = new Date(patch.endsAt);
    if (patch.brand !== undefined) next.brand = patch.brand || null;
    // Blank Nepali text means "none", so clients fall back to English.
    if (patch.titleNe !== undefined) next.titleNe = patch.titleNe?.trim() || null;
    if (patch.descriptionNe !== undefined) next.descriptionNe = patch.descriptionNe?.trim() || null;

    const changes = Object.entries(next)
      .filter(([field, to]) => field in current && comparable(current[field as keyof AuctionRow]) !== comparable(to))
      .map(([field, to]) => ({ field, from: current[field as keyof AuctionRow] ?? null, to: to ?? null }));
    if (!changes.length) return current;

    const afterBids = current.bidCount > 0;
    if (afterBids) {
      const frozen = changes.filter((c) => (MATERIAL_FIELDS as readonly string[]).includes(c.field)).map((c) => c.field);
      if (frozen.length) {
        throw conflict('MATERIAL_FIELDS_FROZEN', 'Bids have been placed, so these details can no longer change.', { fields: frozen });
      }
      const images = next.images as string[] | undefined;
      if (images && !current.images.every((src, i) => images[i] === src)) {
        throw conflict('MATERIAL_FIELDS_FROZEN', 'After the first bid you can add photos but not remove or reorder them.', { fields: ['images'] });
      }
    }

    // Only newly added photos must be uploads; ones already on the lot (incl. seeded stock photos) stay valid.
    if (patch.images) checkImages(patch.images.filter((src) => !current.images.includes(src)));
    const merged = { ...current, ...next } as AuctionRow;
    checkPrices(merged);
    if (patch.startsAt !== undefined || patch.endsAt !== undefined) checkSchedule(merged.startsAt, merged.endsAt, deps.clock.now());

    const rowPatch: Partial<NewAuction> = { ...(next as Partial<NewAuction>), version: current.version + 1 };
    if (patch.endsAt !== undefined) rowPatch.originalEndsAt = merged.endsAt;
    if (patch.startPrice !== undefined) rowPatch.currentPrice = merged.startPrice;
    if (patch.delivery !== undefined && patch.delivery !== 'paid_shipping') rowPatch.shippingCost = null;
    if (patch.images) rowPatch.imageCredits = Object.fromEntries(Object.entries(current.imageCredits).filter(([src]) => patch.images!.includes(src)));

    const updated = await updateAuctionRow(tx, auctionId, rowPatch);
    const amendment = await insertAmendment(tx, {
      auctionId,
      actorId: user.id,
      afterBids,
      changes: changes.map((c) => ({ ...c, from: c.from instanceof Date ? c.from.toISOString() : c.from, to: c.to instanceof Date ? c.to.toISOString() : c.to })),
    });
    await enqueueEvents(tx, [
      {
        topic: 'auction.amended',
        aggregateId: auctionId,
        payload: { auctionId, amendmentId: amendment.id, afterBids, fields: changes.map((c) => c.field), title: updated.title },
      },
    ]);
    return updated;
  });
}

// ── used by the bid, moderation and payment modules ─────────────────────────
export function lockAuctionForUpdate(tx: Tx, auctionId: string) {
  return lockAuction(tx, auctionId);
}

export function saveAuctionState(tx: Tx, auctionId: string, patch: Partial<NewAuction>) {
  return updateAuctionRow(tx, auctionId, patch);
}

export function closeIfLive(tx: Tx, auctionId: string, patch: Partial<NewAuction>) {
  return markClosed(tx, auctionId, patch);
}
