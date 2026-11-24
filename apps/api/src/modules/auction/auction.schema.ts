import type { ImageCredit, IncrementBand } from '@bidwell/contract';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../auth/auth.schema';

export const auctionStatusEnum = pgEnum('auction_status', ['live', 'closed', 'voided']);
export const conditionEnum = pgEnum('item_condition', ['new', 'like_new', 'good', 'fair']);
export const deliveryEnum = pgEnum('delivery', ['free_shipping', 'paid_shipping', 'local_pickup']);

const money = () => bigint({ mode: 'number' });

export const auctions = pgTable(
  'auctions',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Human-facing lot number ("Lot #1042"). */
    lotNo: serial().notNull().unique(),
    sellerId: uuid()
      .notNull()
      .references(() => users.id),

    title: text().notNull(),
    /** Optional Nepali title and description; the web app falls back to English. */
    titleNe: text(),
    description: text().notNull().default(''),
    descriptionNe: text(),
    category: text().notNull(),
    brand: text(),
    condition: conditionEnum().notNull(),
    specs: jsonb().$type<{ label: string; value: string }[]>().notNull().default([]),
    images: jsonb().$type<string[]>().notNull().default([]),
    /** Attribution for third-party photos, keyed by image URL (demo stock photos only). */
    imageCredits: jsonb().$type<Record<string, ImageCredit>>().notNull().default({}),
    delivery: deliveryEnum().notNull(),
    shippingCost: money(),
    location: text().notNull(),

    // Money is integer minor units (A3), with the currency alongside.
    currency: char({ length: 3 }).notNull().default('NPR'),
    startPrice: money().notNull(),
    reservePrice: money(),
    incrementBands: jsonb().$type<IncrementBand[]>().notNull(),
    /** Earnest money deposit required to bid (E9); null = none. */
    emdAmount: money(),

    startsAt: timestamp({ withTimezone: true, precision: 3 }).notNull().defaultNow(),
    /** Mutable: soft close moves it (A5). The closer always re-reads it. */
    endsAt: timestamp({ withTimezone: true, precision: 3 }).notNull(),
    originalEndsAt: timestamp({ withTimezone: true, precision: 3 }).notNull(),
    softCloseWindowSec: integer().notNull().default(120),
    softCloseExtendSec: integer().notNull().default(120),

    status: auctionStatusEnum().notNull().default('live'),
    /** Moderator freeze: off the listings and closed to bids, pending review. */
    hidden: boolean().notNull().default(false),

    // Derived-state cache (A8) — recomputed from the bid ledger under the row
    // lock on every bid and stamped with `version` (B1).
    version: integer().notNull().default(0),
    currentPrice: money().notNull(),
    leaderId: uuid().references(() => users.id),
    bidCount: integer().notNull().default(0),
    bidderCount: integer().notNull().default(0),
    reserveMet: boolean().notNull().default(false),
    /** Ledger head: sequence and hash of the last bid (E2). */
    bidSeq: integer().notNull().default(0),
    lastHash: text(),
    firstBidAt: timestamp({ withTimezone: true }),

    closedAt: timestamp({ withTimezone: true }),
    winnerId: uuid().references(() => users.id),
    finalPrice: money(),
    voidedAt: timestamp({ withTimezone: true }),
    voidReason: text(),

    // Millisecond precision: keyset cursors round-trip through JS Dates.
    createdAt: timestamp({ withTimezone: true, precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.status, t.endsAt),
    index().on(t.category, t.status),
    index().on(t.sellerId),
    check('auctions_reserve_gte_start', sql`${t.reservePrice} is null or ${t.reservePrice} >= ${t.startPrice}`),
    check('auctions_ends_after_starts', sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

/** Append-only amendment log (A6): every edit, with before/after per field. */
export const amendments = pgTable(
  'amendments',
  {
    id: uuid().primaryKey().defaultRandom(),
    auctionId: uuid()
      .notNull()
      .references(() => auctions.id),
    actorId: uuid()
      .notNull()
      .references(() => users.id),
    afterBids: boolean().notNull(),
    changes: jsonb().$type<{ field: string; from: unknown; to: unknown }[]>().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.auctionId)],
);

export const watchlist = pgTable(
  'watchlist',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    auctionId: uuid()
      .notNull()
      .references(() => auctions.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.auctionId] })],
);
