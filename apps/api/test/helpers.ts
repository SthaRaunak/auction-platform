import { randomUUID } from 'node:crypto';
import type { AuctionCreateInput } from '@bidwell/contract';
import { sql } from 'drizzle-orm';
import { registerSubscribers } from '@/bootstrap';
import { db } from '@/db';
import { hashPassword } from '@/infra/argon';
import { createAuction, type AuctionRow } from '@/modules/auction/auction.usecase';
import { users } from '@/modules/auth/auth.schema';
import type { UserRow } from '@/modules/auth/auth.usecase';
import { flushOutbox } from '@/modules/outbox/outbox.drainer';

registerSubscribers();

const TABLES = [
  'appeals', 'reports', 'audit_log', 'deposits', 'reviews', 'auction_comments', 'watchlist', 'amendments', 'bids',
  'outbox', 'auctions', 'email_tokens', 'oauth_accounts', 'sessions', 'users',
];

/** Wipes every table. The append-only triggers are suspended for this one statement only. */
export async function resetDb() {
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`alter table bids disable trigger user; alter table audit_log disable trigger user; alter table amendments disable trigger user`));
    await tx.execute(sql.raw(`truncate ${TABLES.join(', ')} restart identity cascade`));
    await tx.execute(sql.raw(`alter table bids enable trigger user; alter table audit_log enable trigger user; alter table amendments enable trigger user`));
  });
}

let n = 0;
const fastHash = hashPassword('correct horse battery');

export async function makeUser(over: Partial<typeof users.$inferInsert> = {}): Promise<UserRow> {
  n++;
  const [u] = await db
    .insert(users)
    .values({
      email: `user${n}-${randomUUID().slice(0, 6)}@example.com`,
      displayName: `User ${n}`,
      passwordHash: await fastHash,
      emailVerifiedAt: new Date(),
      ...over,
    })
    .returning();
  return u;
}

export async function makeAuction(seller: UserRow, over: Partial<AuctionCreateInput> = {}): Promise<AuctionRow> {
  return createAuction(seller, {
    title: 'Toyota Hilux (2010), Ga 1 Ja ••71',
    description: 'Condemned by survey board.',
    category: 'vehicles',
    brand: 'Tata',
    condition: 'good',
    specs: [],
    images: [],
    delivery: 'local_pickup',
    location: 'Pune',
    startPrice: 10_000,
    incrementBands: [{ below: null, step: 500 }],
    endsAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    ...over,
  });
}

/** Moves an auction's end time relative to *database* now, bypassing edit rules (test-only). */
export async function setEndsIn(auctionId: string, ms: number) {
  await db.execute(
    sql`update auctions set starts_at = least(starts_at, clock_timestamp() - interval '1 hour'),
        ends_at = clock_timestamp() + ${`${ms} milliseconds`}::interval where id = ${auctionId}`,
  );
}

export const key = () => randomUUID();
export const meta = { ip: '127.0.0.1', userAgent: 'vitest' };

export const drainAll = flushOutbox;
