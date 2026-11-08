import {
  incrementFor,
  type AuctionDetail,
  type AuctionLiveState,
  type AuctionResult,
  type BidResult,
  type ChainVerification,
  type FeedEntry,
  type LedgerEntry,
  type PlaceBidInput,
  type Viewer,
} from '@bidwell/contract';
import { db, dbNow, type Executor, type Tx } from '@/db';
import { DomainError, conflict, forbidden, notFound } from '@/errors';
import {
  amendmentsFor,
  auctionsByIds,
  closeIfLive,
  getAuction,
  isWatching,
  lockAuctionForUpdate,
  saveAuctionState,
  toCards,
  type AuctionRow,
} from '../auction/auction.usecase';
import { getUserNames, requireVerified, type RequestMeta, type UserRow } from '../auth/auth.usecase';
import { kickDrainer } from '../outbox/outbox.drainer';
import { enqueueEvents, type NewOutboxEvent } from '../outbox/outbox.usecase';
import { hasHeldDeposit } from '../payment/payment.usecase';
import { pendingReview } from '../review/review.usecase';
import { genesisHash, hashBid, verifyChain } from './bid.chain';
import { auctionIdsBidOnBy, bidderIdsFor, countBidsInLastMinute, findBidByIdempotencyKey, insertBid, listBids, maxOfBidder, type BidRow } from './bid.data';
import { deriveFeed, feedForBid, minNextBid, resolve, softCloseEndsAt, validateBid, type FeedItem, type LedgerBid, type Resolution, type Rules } from './bid.engine';

const FEED_LIMIT = 12;

// ── pure-ish helpers ────────────────────────────────────────────────────────
const rulesOf = (a: AuctionRow): Rules => ({ startPrice: a.startPrice, reservePrice: a.reservePrice, bands: a.incrementBands });
const toLedger = (rows: BidRow[]): LedgerBid[] => rows.map((r) => ({ seq: r.seq, bidderId: r.bidderId, maxAmount: r.maxAmount, at: r.createdAt }));

/** "Bidder #N" numbering by order of first bid — the only identity broadcast while live (E5). */
function bidderNumbers(ledger: readonly LedgerBid[]) {
  const numbers = new Map<string, number>();
  for (const b of ledger) if (!numbers.has(b.bidderId)) numbers.set(b.bidderId, numbers.size + 1);
  return numbers;
}

type Names = Map<string, { displayName: string }> | null;

function toFeedEntries(items: FeedItem[], numbers: Map<string, number>, names: Names): FeedEntry[] {
  // One bid yields at most one 'bid' and one 'auto' entry, so (seq, kind) is unique.
  return items.map((f) => ({
    key: `${f.seq}-${f.kind}`,
    seq: f.seq,
    bidderNo: numbers.get(f.bidderId)!,
    name: names?.get(f.bidderId)?.displayName ?? null,
    kind: f.kind,
    amount: f.amount,
    at: f.at.toISOString(),
  }));
}

function liveStateOf(a: AuctionRow, res: Resolution, numbers: Map<string, number>, names: Names): AuctionLiveState {
  const rules = rulesOf(a);
  return {
    auctionId: a.id,
    version: a.version,
    status: a.status,
    hidden: a.hidden,
    price: res.price,
    bidCount: res.bidCount,
    endsAt: a.endsAt.toISOString(),
    minNextBid: minNextBid(res, rules),
    increment: incrementFor(res.price, rules.bands),
    hasReserve: a.reservePrice !== null,
    reserveMet: res.bidCount > 0 && res.reserveMet,
    leaderNo: res.leaderId ? numbers.get(res.leaderId)! : null,
    winnerName: a.winnerId ? (names?.get(a.winnerId)?.displayName ?? null) : null,
    finalPrice: a.finalPrice,
  };
}

/** Identities are revealed once the auction is no longer live (E3/E5). */
async function namesIfEnded(a: AuctionRow, ledger: LedgerBid[]): Promise<Names> {
  if (a.status === 'live') return null;
  return getUserNames(ledger.map((b) => b.bidderId));
}

async function snapshot(ex: Executor, a: AuctionRow) {
  const ledger = toLedger(await listBids(ex, a.id));
  const res = resolve(ledger, rulesOf(a));
  const numbers = bidderNumbers(ledger);
  const names = await namesIfEnded(a, ledger);
  const feed = toFeedEntries(deriveFeed(ledger, rulesOf(a)), numbers, names).slice(-FEED_LIMIT).reverse();
  return { ledger, res, numbers, state: liveStateOf(a, res, numbers, names), feed };
}

/** Public payload for SSE (re)connects — masked, viewer-independent. */
export async function getLiveSnapshot(auctionId: string) {
  const a = await getAuction(auctionId);
  const { state, feed } = await snapshot(db, a);
  return { state, feed };
}

/** Queue the current public state for broadcast (moderation changes use this too). */
export async function enqueueStateEvent(tx: Tx, a: AuctionRow, extra: NewOutboxEvent[] = []) {
  const { state } = await snapshot(tx, a);
  await enqueueEvents(tx, [{ topic: 'auction.state', aggregateId: a.id, payload: { state, feed: [] } }, ...extra]);
}

// ── place a bid ─────────────────────────────────────────────────────────────
/**
 * One transaction, serialised per auction by the row lock (A2):
 * lock → idempotency check (A9) → judge lateness by DB time (A4) →
 * validate against the derived state (A8) → append to the hash-chained
 * ledger (E1/E2) → soft close (A5) → update the cached state + version (B1) →
 * outbox events (D1). Nothing is broadcast until it commits.
 */
export async function placeBid(user: UserRow, auctionId: string, input: PlaceBidInput, meta: RequestMeta): Promise<BidResult> {
  requireVerified(user);
  let result: BidResult;
  try {
    result = await db.transaction(async (tx) => {
      const a = await lockAuctionForUpdate(tx, auctionId);
      if (!a) throw notFound('Auction');

      const replay = await findBidByIdempotencyKey(tx, input.idempotencyKey);
      if (replay) {
        if (replay.bidderId !== user.id || replay.auctionId !== auctionId || replay.maxAmount !== input.maxAmount) {
          throw conflict('IDEMPOTENCY_KEY_REUSED', 'This request id was already used for a different bid.');
        }
        const { res, state, numbers } = await snapshot(tx, a);
        return { accepted: true, replayed: true, bidderNo: numbers.get(user.id)!, isLeader: res.leaderId === user.id, yourMax: replay.maxAmount, state };
      }

      const now = await dbNow(tx);
      if (a.status !== 'live') throw conflict('AUCTION_ENDED', 'This auction has ended.');
      if (a.hidden) throw conflict('AUCTION_PAUSED', 'Bidding on this lot is paused while it is reviewed.');
      if (now < a.startsAt) throw conflict('NOT_STARTED', 'Bidding hasn’t opened yet.');
      if (now >= a.endsAt) throw conflict('AUCTION_ENDED', 'Bidding closed before your bid arrived.', { endedAt: a.endsAt.toISOString() });
      if (a.emdAmount && a.sellerId !== user.id && !(await hasHeldDeposit(tx, auctionId, user.id))) {
        throw forbidden('DEPOSIT_REQUIRED', 'This auction requires a refundable deposit before you can bid.');
      }

      const rules = rulesOf(a);
      const ledger = toLedger(await listBids(tx, auctionId));
      const before = resolve(ledger, rules);
      const verdict = validateBid(before, rules, { bidderId: user.id, sellerId: a.sellerId, amount: input.maxAmount });
      if (!verdict.ok) {
        throw new DomainError(verdict.code === 'SELLER_CANNOT_BID' ? 403 : 422, verdict.code, verdict.message, { minimum: verdict.minimum });
      }

      const bid: LedgerBid = { seq: a.bidSeq + 1, bidderId: user.id, maxAmount: input.maxAmount, at: now };
      const after = resolve([...ledger, bid], rules);
      const prevHash = a.lastHash ?? genesisHash(auctionId);
      const fields = {
        auctionId,
        seq: bid.seq,
        bidderId: user.id,
        maxAmount: input.maxAmount,
        priceAfter: after.price,
        leaderAfterId: after.leaderId!,
        idempotencyKey: input.idempotencyKey,
        createdAt: now,
      };
      const hash = hashBid(prevHash, fields);
      await insertBid(tx, { ...fields, prevHash, hash, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300) });

      const updated = await saveAuctionState(tx, auctionId, {
        currentPrice: after.price,
        leaderId: after.leaderId,
        bidCount: after.bidCount,
        bidderCount: after.bidderCount,
        reserveMet: after.reserveMet,
        bidSeq: bid.seq,
        lastHash: hash,
        endsAt: softCloseEndsAt(a.endsAt, now, a.softCloseWindowSec, a.softCloseExtendSec),
        firstBidAt: a.firstBidAt ?? now,
        version: a.version + 1,
      });

      const numbers = bidderNumbers([...ledger, bid]);
      const state = liveStateOf(updated, after, numbers, null);
      const events: NewOutboxEvent[] = [
        { topic: 'auction.state', aggregateId: auctionId, payload: { state, feed: toFeedEntries(feedForBid(before, after, bid), numbers, null) } },
      ];
      if (before.leaderId && before.leaderId !== after.leaderId) {
        events.push({ topic: 'auction.outbid', aggregateId: auctionId, payload: { userId: before.leaderId, title: a.title, price: after.price } });
      }
      await enqueueEvents(tx, events);
      return { accepted: true, replayed: false, bidderNo: numbers.get(user.id)!, isLeader: after.leaderId === user.id, yourMax: input.maxAmount, state };
    });
  } catch (err) {
    // Same key, different auction, racing outside the row lock: the unique index decides.
    if ((err as { code?: string; cause?: { code?: string } }).cause?.code === '23505' || (err as { code?: string }).code === '23505') {
      throw conflict('IDEMPOTENCY_KEY_REUSED', 'This request id was already used.');
    }
    throw err;
  }
  kickDrainer();
  return result;
}

// ── close ───────────────────────────────────────────────────────────────────
/**
 * Idempotent close (A1). Re-reads endsAt under the lock and bails if a late
 * bid moved it (A5); the conditional UPDATE … WHERE status = 'live' means two
 * closers can never both close the same lot.
 */
export async function closeAuction(auctionId: string) {
  const closed = await db.transaction(async (tx) => {
    const a = await lockAuctionForUpdate(tx, auctionId);
    if (!a || a.status !== 'live' || a.hidden) return null;
    const now = await dbNow(tx);
    if (a.endsAt > now) return null;

    const ledger = toLedger(await listBids(tx, auctionId));
    const res = resolve(ledger, rulesOf(a));
    const updated = await closeIfLive(tx, auctionId, {
      closedAt: now,
      currentPrice: res.price,
      leaderId: res.leaderId,
      winnerId: res.winnerId,
      finalPrice: res.winnerId ? res.price : null,
      reserveMet: res.reserveMet,
      version: a.version + 1,
    });
    if (!updated) return null;

    const names = await getUserNames(ledger.map((b) => b.bidderId).concat(res.winnerId ? [res.winnerId] : []));
    const state = liveStateOf(updated, res, bidderNumbers(ledger), names);
    await enqueueEvents(tx, [
      { topic: 'auction.state', aggregateId: auctionId, payload: { state, feed: [] } },
      {
        topic: 'auction.closed',
        aggregateId: auctionId,
        payload: {
          title: a.title,
          sellerId: a.sellerId,
          winnerId: res.winnerId,
          finalPrice: updated.finalPrice,
          reserveMet: res.reserveMet,
          bidderIds: [...new Set(ledger.map((b) => b.bidderId))],
        },
      },
    ]);
    return updated;
  });
  if (closed) kickDrainer();
  return closed;
}

// ── reads ───────────────────────────────────────────────────────────────────
export function bidsPerMinute() {
  return countBidsInLastMinute(db);
}

export function biddersOf(ex: Executor, auctionId: string) {
  return bidderIdsFor(ex, auctionId);
}

export async function getAuctionDetail(auctionId: string, viewerUser: UserRow | null): Promise<AuctionDetail> {
  // Hidden lots drop out of listings but stay reachable by link, with the reason shown.
  const a = await getAuction(auctionId);

  const [{ ledger, res, numbers, state, feed }, [card], amendments, moderation] = await Promise.all([
    snapshot(db, a),
    toCards([a], viewerUser?.id ?? null),
    amendmentsFor(a.id),
    moderationNoticeFor(a),
  ]);
  const serverNow = await dbNow(db);

  const viewerId = viewerUser?.id ?? null;
  const yourMax = viewerId ? Math.max(0, ...ledger.filter((b) => b.bidderId === viewerId).map((b) => b.maxAmount)) || null : null;
  const viewer: Viewer = {
    signedIn: Boolean(viewerUser),
    isSeller: viewerId === a.sellerId,
    bidderNo: viewerId ? (numbers.get(viewerId) ?? null) : null,
    isLeader: viewerId !== null && res.leaderId === viewerId,
    yourMax,
    watched: viewerId ? await isWatching(viewerId, a.id) : false,
    emailVerified: Boolean(viewerUser?.emailVerifiedAt),
    hasDeposit: viewerId && a.emdAmount ? await hasHeldDeposit(db, a.id, viewerId) : false,
    review: await pendingReview(viewerUser, a),
    bidBlocker: null,
  };
  viewer.bidBlocker =
    a.status !== 'live' || serverNow >= a.endsAt ? 'ended'
    : a.hidden ? 'paused'
    : serverNow < a.startsAt ? 'not_started'
    : !viewerUser ? 'sign_in'
    : !viewer.emailVerified ? 'verify_email'
    : viewer.isSeller ? 'seller'
    : a.emdAmount && !viewer.hasDeposit ? 'deposit_required'
    : null;

  return {
    ...card,
    ...state,
    description: a.description,
    specs: a.specs,
    images: a.images,
    imageCredits: a.imageCredits,
    incrementBands: a.incrementBands,
    emdAmount: a.emdAmount,
    startsAt: a.startsAt.toISOString(),
    originalEndsAt: a.originalEndsAt.toISOString(),
    softCloseWindowSec: a.softCloseWindowSec,
    softCloseExtendSec: a.softCloseExtendSec,
    closedAt: a.closedAt?.toISOString() ?? null,
    sellerLocation: a.location,
    amendments,
    moderation,
    feed,
    viewer,
    serverNow: serverNow.toISOString(),
  };
}

let moderationNoticeFor: (a: AuctionRow) => Promise<AuctionDetail['moderation']> = async (a) =>
  a.status === 'voided' && a.voidReason ? { kind: 'voided', reason: a.voidReason, at: a.voidedAt!.toISOString() } : null;

/** The moderation module supplies richer notices (hide reasons) without bid importing it. */
export function setModerationNoticeProvider(fn: typeof moderationNoticeFor) {
  moderationNoticeFor = fn;
}

async function chainFor(a: AuctionRow, rows: BidRow[]): Promise<ChainVerification> {
  const v = verifyChain(a.id, rows);
  // A deleted tail is invisible to the chain itself; the auction row records the head.
  if (v.valid && (rows.length !== a.bidSeq || (v.headHash ?? null) !== (a.lastHash ?? null))) {
    return { ...v, valid: false, brokenAtSeq: rows.length + 1 };
  }
  return v;
}

export async function verifyAuctionChain(auctionId: string) {
  const a = await getAuction(auctionId);
  return chainFor(a, await listBids(db, auctionId));
}

/** The public, immutable record (E4) — complete ledger with maximums (E3) once the auction has ended. */
export async function getAuctionResult(auctionId: string): Promise<AuctionResult> {
  const a = await getAuction(auctionId);
  if (a.status === 'live') throw conflict('AUCTION_LIVE', 'Results are published when the auction ends.');
  const rows = await listBids(db, auctionId);
  const ledger = toLedger(rows);
  const numbers = bidderNumbers(ledger);
  const names = (await getUserNames(ledger.map((b) => b.bidderId).concat(a.winnerId ? [a.winnerId] : [])))!;
  const res = resolve(ledger, rulesOf(a));
  const entries: LedgerEntry[] = rows.map((r) => ({
    seq: r.seq,
    userId: r.bidderId,
    bidderNo: numbers.get(r.bidderId)!,
    name: names.get(r.bidderId)?.displayName ?? 'Unknown',
    maxAmount: r.maxAmount,
    priceAfter: r.priceAfter,
    leaderAfterNo: numbers.get(r.leaderAfterId) ?? null,
    at: r.createdAt.toISOString(),
    prevHash: r.prevHash,
    hash: r.hash,
  }));
  return {
    auctionId: a.id,
    lotNo: a.lotNo,
    title: a.title,
    status: a.status,
    outcome: a.status === 'voided' ? 'voided' : a.winnerId ? 'sold' : ledger.length ? 'reserve_not_met' : 'no_bids',
    winnerName: a.winnerId ? (names.get(a.winnerId)?.displayName ?? null) : null,
    finalPrice: a.finalPrice,
    currency: a.currency,
    bidCount: res.bidCount,
    bidderCount: res.bidderCount,
    startsAt: a.startsAt.toISOString(),
    originalEndsAt: a.originalEndsAt.toISOString(),
    endedAt: (a.closedAt ?? a.voidedAt)?.toISOString() ?? null,
    voidReason: a.voidReason,
    ledger: entries,
    amendments: await amendmentsFor(a.id),
    chain: await chainFor(a, rows),
  };
}

export async function myBids(user: UserRow) {
  const rows = await auctionIdsBidOnBy(db, user.id);
  const cards = await auctionsByIds(
    rows.map((r) => r.auctionId),
    user.id,
  );
  const byId = new Map(cards.map((c) => [c.id, c]));
  const maxes = await maxOfBidder(
    db,
    rows.map((r) => r.auctionId),
    user.id,
  );
  return rows.filter((r) => byId.has(r.auctionId)).map((r) => ({ ...byId.get(r.auctionId)!, yourMax: maxes.get(r.auctionId) ?? r.yourMax }));
}

