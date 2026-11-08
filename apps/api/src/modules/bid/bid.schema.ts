import { bigint, bigserial, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { auctions } from '../auction/auction.schema';
import { users } from '../auth/auth.schema';

/**
 * The bid ledger (E1). Append-only: a trigger (see the custom migration)
 * rejects UPDATE and DELETE. Each row is hash-chained to the previous row of
 * the same auction (E2), so after-the-fact edits are detectable.
 */
export const bids = pgTable(
  'bids',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    auctionId: uuid()
      .notNull()
      .references(() => auctions.id),
    /** 1-based position in this auction's chain. */
    seq: integer().notNull(),
    bidderId: uuid()
      .notNull()
      .references(() => users.id),
    /** The bidder's secret maximum — sealed until the auction ends (E3). */
    maxAmount: bigint({ mode: 'number' }).notNull(),
    /** Derived outcome at the moment of the bid, recorded for the audit trail. */
    priceAfter: bigint({ mode: 'number' }).notNull(),
    leaderAfterId: uuid()
      .notNull()
      .references(() => users.id),
    idempotencyKey: uuid().notNull(),
    ip: text(),
    userAgent: text(),
    /** Database time at acceptance — the only clock that decides lateness (A4). */
    createdAt: timestamp({ withTimezone: true, precision: 3 }).notNull(),
    prevHash: text().notNull(),
    hash: text().notNull(),
  },
  (t) => [uniqueIndex().on(t.auctionId, t.seq), uniqueIndex().on(t.idempotencyKey), index().on(t.bidderId), index().on(t.createdAt)],
);
