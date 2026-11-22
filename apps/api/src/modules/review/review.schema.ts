import { sql } from 'drizzle-orm';
import { check, index, pgEnum, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { auctions } from '../auction/auction.schema';
import { users } from '../auth/auth.schema';

/** Which side of the sale the reviewed person was on. */
export const reviewRoleEnum = pgEnum('review_role', ['seller', 'buyer']);

/**
 * Two-way reviews after a completed sale: the winner reviews the seller, and
 * the seller reviews the winner. One review per party per auction.
 */
export const reviews = pgTable(
  'reviews',
  {
    id: uuid().primaryKey().defaultRandom(),
    auctionId: uuid()
      .notNull()
      .references(() => auctions.id),
    reviewerId: uuid()
      .notNull()
      .references(() => users.id),
    revieweeId: uuid()
      .notNull()
      .references(() => users.id),
    revieweeRole: reviewRoleEnum().notNull(),
    stars: smallint().notNull(),
    comment: text().notNull().default(''),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex().on(t.auctionId, t.reviewerId),
    index().on(t.revieweeId, t.revieweeRole),
    check('reviews_stars_range', sql`${t.stars} between 1 and 5`),
    check('reviews_not_self', sql`${t.reviewerId} <> ${t.revieweeId}`),
  ],
);
