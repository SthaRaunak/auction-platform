import { relations } from 'drizzle-orm';
import { auctions, amendments, watchlist } from '../modules/auction/auction.schema';
import { users } from '../modules/auth/auth.schema';
import { bids } from '../modules/bid/bid.schema';

export const usersRelations = relations(users, ({ many }) => ({
  auctions: many(auctions),
  bids: many(bids),
}));

export const auctionsRelations = relations(auctions, ({ one, many }) => ({
  seller: one(users, { fields: [auctions.sellerId], references: [users.id] }),
  bids: many(bids),
  amendments: many(amendments),
  watchers: many(watchlist),
}));

export const bidsRelations = relations(bids, ({ one }) => ({
  auction: one(auctions, { fields: [bids.auctionId], references: [auctions.id] }),
  bidder: one(users, { fields: [bids.bidderId], references: [users.id] }),
}));

export const amendmentsRelations = relations(amendments, ({ one }) => ({
  auction: one(auctions, { fields: [amendments.auctionId], references: [auctions.id] }),
}));

export const watchlistRelations = relations(watchlist, ({ one }) => ({
  auction: one(auctions, { fields: [watchlist.auctionId], references: [auctions.id] }),
}));
