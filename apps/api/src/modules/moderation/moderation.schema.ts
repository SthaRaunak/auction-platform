import { index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { auctions } from '../auction/auction.schema';
import { auditLog } from '../audit/audit.schema';
import { users } from '../auth/auth.schema';

export const reportStatusEnum = pgEnum('report_status', ['open', 'actioned', 'dismissed']);
export const appealStatusEnum = pgEnum('appeal_status', ['open', 'upheld', 'overturned']);

export const reports = pgTable(
  'reports',
  {
    id: uuid().primaryKey().defaultRandom(),
    auctionId: uuid()
      .notNull()
      .references(() => auctions.id),
    reporterId: uuid()
      .notNull()
      .references(() => users.id),
    reason: text().notNull(),
    details: text().notNull().default(''),
    status: reportStatusEnum().notNull().default('open'),
    resolvedById: uuid().references(() => users.id),
    resolvedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.status, t.createdAt), index().on(t.auctionId)],
);

export const appeals = pgTable(
  'appeals',
  {
    id: uuid().primaryKey().defaultRandom(),
    auditId: uuid()
      .notNull()
      .unique()
      .references(() => auditLog.id),
    appellantId: uuid()
      .notNull()
      .references(() => users.id),
    text: text().notNull(),
    status: appealStatusEnum().notNull().default('open'),
    resolvedById: uuid().references(() => users.id),
    resolutionNote: text(),
    resolvedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.status)],
);
