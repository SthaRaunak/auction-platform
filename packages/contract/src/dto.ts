import type { IncrementBand } from './increments';

// Response shapes shared by the API (producer) and the web app (consumer).
// All money is integer minor units; all instants are ISO-8601 strings.

export type Role = 'user' | 'moderator' | 'admin';
export type AuctionStatus = 'live' | 'closed' | 'voided';

export interface Me {
  id: string;
  email: string;
  displayName: string;
  initials: string;
  role: Role;
  emailVerified: boolean;
  hasPassword: boolean;
  googleLinked: boolean;
  watchCount: number;
}

export interface SellerSummary {
  id: string;
  displayName: string;
  initials: string;
  rating: number | null;
  ratingCount: number;
  sales: number;
  memberSince: string;
}

export interface AuctionCard {
  id: string;
  lotNo: number;
  title: string;
  /** Optional Nepali title; clients fall back to `title`. */
  titleNe: string | null;
  category: string;
  brand: string | null;
  condition: string;
  delivery: string;
  shippingCost: number | null;
  location: string;
  currency: string;
  price: number;
  startPrice: number;
  bidCount: number;
  endsAt: string;
  createdAt: string;
  status: AuctionStatus;
  hidden: boolean;
  image: string | null;
  seller: SellerSummary;
  watched: boolean;
  /** Only set for the signed-in viewer. */
  viewerIsLeader: boolean;
}

export interface AuctionList {
  items: AuctionCard[];
  nextCursor: string | null;
  total: number;
  endingWithinHour: number;
}

export interface BrandFacet {
  brand: string;
  count: number;
}

export interface MarketStats {
  openLots: number;
  endingWithinHour: number;
  bidsPerMinute: number;
  serverNow: string;
}

/**
 * One row in the public bid feed. During an auction bidders are masked as
 * "Bidder #N" (E5) — `bidderNo` lets a client recognise its own rows without
 * any user id ever being broadcast. After close, `name` is revealed.
 */
export interface FeedEntry {
  key: string;
  seq: number;
  bidderNo: number;
  name: string | null;
  kind: 'bid' | 'auto';
  amount: number;
  at: string;
}

/** Full ledger row, published only after the auction ends (E3). */
export interface LedgerEntry {
  seq: number;
  /** Revealed with the name once the auction is over, so the bidder's profile can be linked. */
  userId: string;
  bidderNo: number;
  name: string;
  maxAmount: number;
  priceAfter: number;
  leaderAfterNo: number | null;
  at: string;
  prevHash: string;
  hash: string;
}

export interface Viewer {
  signedIn: boolean;
  isSeller: boolean;
  bidderNo: number | null;
  isLeader: boolean;
  yourMax: number | null;
  watched: boolean;
  emailVerified: boolean;
  hasDeposit: boolean;
  /** Set when the viewer is a party to a completed sale and hasn't reviewed the other side yet. */
  review: null | { revieweeName: string; revieweeRole: ReviewRole };
  /** Why the viewer can't bid right now, if they can't. */
  bidBlocker: null | 'sign_in' | 'verify_email' | 'seller' | 'deposit_required' | 'not_started' | 'ended' | 'paused';
}

export interface Amendment {
  id: string;
  at: string;
  afterBids: boolean;
  changes: { field: string; from: unknown; to: unknown }[];
}

export interface ModerationNotice {
  kind: 'hidden' | 'voided';
  reason: string;
  at: string;
}

export interface AuctionLiveState {
  auctionId: string;
  version: number;
  status: AuctionStatus;
  hidden: boolean;
  price: number;
  bidCount: number;
  endsAt: string;
  minNextBid: number;
  increment: number;
  hasReserve: boolean;
  reserveMet: boolean;
  leaderNo: number | null;
  winnerName: string | null;
  finalPrice: number | null;
}

export interface ImageCredit {
  author: string;
  authorUrl: string;
  sourceUrl: string;
  source: 'Unsplash';
}

export interface AuctionDetail extends AuctionCard, AuctionLiveState {
  description: string;
  descriptionNe: string | null;
  specs: { label: string; value: string }[];
  images: string[];
  /** Keyed by image URL; only stock demo photos have one. */
  imageCredits: Record<string, ImageCredit>;
  incrementBands: IncrementBand[];
  emdAmount: number | null;
  startsAt: string;
  originalEndsAt: string;
  softCloseWindowSec: number;
  softCloseExtendSec: number;
  /** When false, feed entries carry bidder names while the auction is live. */
  maskBidders: boolean;
  closedAt: string | null;
  sellerLocation: string;
  amendments: Amendment[];
  moderation: ModerationNotice | null;
  feed: FeedEntry[];
  viewer: Viewer;
  serverNow: string;
}

/** Server-sent event payload on /auctions/:id/events (versioned for B1). */
export type LiveEvent =
  | ({ type: 'snapshot'; feed: FeedEntry[] } & AuctionLiveState)
  | ({ type: 'delta'; feed: FeedEntry[] } & AuctionLiveState);

export interface BidResult {
  accepted: true;
  replayed: boolean;
  /** The caller's own "Bidder #N" on this lot. */
  bidderNo: number;
  isLeader: boolean;
  yourMax: number;
  state: AuctionLiveState;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export interface AuctionResult {
  auctionId: string;
  lotNo: number;
  title: string;
  titleNe: string | null;
  status: AuctionStatus;
  outcome: 'sold' | 'reserve_not_met' | 'no_bids' | 'voided';
  winnerName: string | null;
  finalPrice: number | null;
  currency: string;
  bidCount: number;
  bidderCount: number;
  startsAt: string;
  originalEndsAt: string;
  endedAt: string | null;
  voidReason: string | null;
  ledger: LedgerEntry[];
  amendments: Amendment[];
  chain: ChainVerification;
}

export interface ChainVerification {
  valid: boolean;
  checked: number;
  headHash: string | null;
  brokenAtSeq: number | null;
}

export interface ReportRow {
  id: string;
  auctionId: string;
  auctionTitle: string;
  lotNo: number;
  auctionStatus: AuctionStatus;
  auctionHidden: boolean;
  reason: string;
  details: string;
  reporterName: string;
  status: 'open' | 'actioned' | 'dismissed';
  createdAt: string;
}

export interface AuditRow {
  id: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  meta: Record<string, unknown>;
  at: string;
}

export interface AppealRow {
  id: string;
  actionId: string;
  auctionId: string;
  auctionTitle: string;
  action: string;
  actionReason: string;
  sellerName: string;
  text: string;
  status: 'open' | 'upheld' | 'overturned';
  resolutionNote: string | null;
  createdAt: string;
}

export interface MyModerationAction {
  id: string;
  auctionId: string;
  auctionTitle: string;
  action: string;
  reason: string;
  at: string;
  appeal: { status: AppealRow['status']; resolutionNote: string | null } | null;
}

export type ReviewRole = 'seller' | 'buyer';

export interface RatingSummary {
  average: number | null;
  count: number;
}

export interface UserProfile {
  id: string;
  displayName: string;
  initials: string;
  memberSince: string;
  isStaff: boolean;
  asSeller: RatingSummary;
  asBuyer: RatingSummary;
  lotsListed: number;
  lotsSold: number;
  lotsWon: number;
}

export interface Review {
  id: string;
  auctionId: string;
  auctionTitle: string;
  auctionTitleNe: string | null;
  lotNo: number;
  reviewer: { id: string; displayName: string; initials: string };
  /** The reviewed person's side of the sale. */
  revieweeRole: ReviewRole;
  stars: number;
  comment: string;
  at: string;
}

export interface Comment {
  id: string;
  author: { id: string; displayName: string; initials: string; isSeller: boolean; isStaff: boolean };
  /** Empty when removed. */
  body: string;
  at: string;
  removed: null | { by: 'author' | 'moderator'; reason: string | null; at: string };
  canRemove: boolean;
}

export interface MailItem {
  to: string;
  subject: string;
  text: string;
  at: string;
}
