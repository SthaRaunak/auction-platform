import { z } from 'zod';
import { CATEGORY_SLUGS, CONDITION_VALUES, DELIVERY_VALUES, REPORT_REASON_VALUES, SORT_VALUES } from './catalog';
import { incrementBandsSchema } from './increments';

// Shape validation only (D6). Domain rules — "a bid must beat the current
// price", "material fields freeze after the first bid" — live in the API's use-cases.

const minor = z.number().int().nonnegative().max(1e13);

// ── auth ────────────────────────────────────────────────────────────────────
export const emailSchema = z.email().max(254).transform((e) => e.trim().toLowerCase());
export const passwordSchema = z.string().min(10, 'Use at least 10 characters').max(200);

export const registerInput = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(2).max(60),
});
export type RegisterInput = z.infer<typeof registerInput>;

export const loginInput = z.object({ email: emailSchema, password: z.string().min(1).max(200) });
export type LoginInput = z.infer<typeof loginInput>;

export const tokenInput = z.object({ token: z.string().min(16).max(200) });
export const emailOnlyInput = z.object({ email: emailSchema });
export const resetPasswordInput = z.object({ token: z.string().min(16).max(200), password: passwordSchema });

// ── auctions ────────────────────────────────────────────────────────────────
export const specSchema = z.object({ label: z.string().trim().min(1).max(40), value: z.string().trim().min(1).max(120) });

// Nepali text is optional; the web app falls back to English wherever it's missing.
export const auctionCreateInput = z.object({
  title: z.string().trim().min(5).max(120),
  titleNe: z.string().trim().max(120).nullish(),
  description: z.string().trim().max(5000).default(''),
  descriptionNe: z.string().trim().max(5000).nullish(),
  category: z.enum(CATEGORY_SLUGS),
  brand: z.string().trim().max(60).nullish(),
  condition: z.enum(CONDITION_VALUES),
  specs: z.array(specSchema).max(12).default([]),
  images: z.array(z.string().max(500)).max(8).default([]),
  delivery: z.enum(DELIVERY_VALUES),
  shippingCost: minor.nullish(),
  location: z.string().trim().min(2).max(80),
  startPrice: minor.min(100, 'Start price must be at least Rs. 1'),
  reservePrice: minor.nullish(),
  incrementBands: incrementBandsSchema.optional(),
  emdAmount: minor.nullish(),
  startsAt: z.iso.datetime({ offset: true }).optional(),
  endsAt: z.iso.datetime({ offset: true }),
  softCloseWindowSec: z.number().int().min(0).max(3600).optional(),
  softCloseExtendSec: z.number().int().min(0).max(3600).optional(),
  /** false = bidder names are public in the live bid history (maximums stay sealed either way). Default true. */
  maskBidders: z.boolean().optional(),
});
export type AuctionCreateInput = z.infer<typeof auctionCreateInput>;

export const auctionUpdateInput = auctionCreateInput.partial();
export type AuctionUpdateInput = z.infer<typeof auctionUpdateInput>;

/**
 * Fields that freeze once the first bid lands (A6). Everything else —
 * description (in either language) and *additional* photos — stays editable,
 * and every edit is appended to the public amendment log.
 */
export const MATERIAL_FIELDS = [
  'title', 'titleNe', 'category', 'brand', 'condition', 'specs', 'delivery', 'shippingCost', 'location',
  'startPrice', 'reservePrice', 'incrementBands', 'emdAmount', 'startsAt', 'endsAt',
  'softCloseWindowSec', 'softCloseExtendSec', 'maskBidders',
] as const satisfies readonly (keyof AuctionCreateInput)[];
export type MaterialField = (typeof MATERIAL_FIELDS)[number];

const csv = <T extends z.ZodType<unknown, string>>(item: T) =>
  z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').filter(Boolean) : []))
    .pipe(z.array(item));

export const listAuctionsQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.enum(CATEGORY_SLUGS).optional(),
  brand: csv(z.string().max(60)),
  condition: csv(z.enum(CONDITION_VALUES)),
  delivery: csv(z.enum(['free_shipping', 'local_pickup'])),
  ending: z.enum(['hour', 'today', 'week']).optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().nonnegative().optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  sort: z.enum(SORT_VALUES).default('ending_soonest'),
  cursor: z.string().max(400).optional(),
  limit: z.coerce.number().int().min(1).max(48).default(12),
});
export type ListAuctionsQuery = z.infer<typeof listAuctionsQuery>;

// ── bids ────────────────────────────────────────────────────────────────────
export const placeBidInput = z.object({
  /** The bidder's secret maximum, in minor units. */
  maxAmount: minor.min(1),
  /** Generated client-side per bid attempt; retries reuse it (A9). */
  idempotencyKey: z.uuid(),
});
export type PlaceBidInput = z.infer<typeof placeBidInput>;

// ── moderation ──────────────────────────────────────────────────────────────
export const reportInput = z.object({
  reason: z.enum(REPORT_REASON_VALUES),
  details: z.string().trim().max(1000).default(''),
});
export type ReportInput = z.infer<typeof reportInput>;

export const moderationActionInput = z.object({
  action: z.enum(['hide', 'restore', 'void']),
  reason: z.string().trim().min(10, 'Give a reason of at least 10 characters').max(1000),
  reportId: z.uuid().optional(),
});
export type ModerationActionInput = z.infer<typeof moderationActionInput>;

export const appealInput = z.object({
  actionId: z.uuid(),
  text: z.string().trim().min(10).max(2000),
});

export const resolveAppealInput = z.object({
  decision: z.enum(['upheld', 'overturned']),
  note: z.string().trim().min(5).max(1000),
});

export const reviewInput = z.object({
  stars: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).default(''),
});
export type ReviewInput = z.infer<typeof reviewInput>;

export const commentInput = z.object({
  body: z.string().trim().min(1, 'Write something first').max(1000),
});

export const removeCommentInput = z.object({
  /** Required when a moderator removes someone else's comment. */
  reason: z.string().trim().max(500).optional(),
});

export const roleInput = z.object({ role: z.enum(['user', 'moderator', 'admin']) });
