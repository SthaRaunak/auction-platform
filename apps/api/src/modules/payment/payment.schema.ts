import { bigint, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { auctions } from '../auction/auction.schema';
import { users } from '../auth/auth.schema';

/**
 * Earnest money deposits (E9): deposit → qualification → hold →
 * applied (winner) / refunded (everyone else) / forfeited (winner defaults).
 * Money moves only through the PaymentGateway port, which is a stub.
 */
export const depositStatusEnum = pgEnum('deposit_status', ['held', 'applied', 'refunded', 'forfeited']);

export const deposits = pgTable(
  'deposits',
  {
    id: uuid().primaryKey().defaultRandom(),
    auctionId: uuid()
      .notNull()
      .references(() => auctions.id),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    amount: bigint({ mode: 'number' }).notNull(),
    currency: text().notNull(),
    status: depositStatusEnum().notNull().default('held'),
    gatewayRef: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex().on(t.auctionId, t.userId)],
);
