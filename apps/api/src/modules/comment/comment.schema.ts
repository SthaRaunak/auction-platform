import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { auctions } from '../auction/auction.schema';
import { users } from '../auth/auth.schema';

/**
 * Public discussion on a lot. Removal is a soft flag with who/why, so the
 * thread shows that something was removed and moderators stay accountable.
 */
export const auctionComments = pgTable(
  'auction_comments',
  {
    id: uuid().primaryKey().defaultRandom(),
    auctionId: uuid()
      .notNull()
      .references(() => auctions.id),
    authorId: uuid()
      .notNull()
      .references(() => users.id),
    body: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp({ withTimezone: true }),
    removedById: uuid().references(() => users.id),
    removalReason: text(),
  },
  (t) => [index().on(t.auctionId, t.createdAt), index().on(t.authorId)],
);
