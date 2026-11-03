import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { config } from '../config';
import * as relations from './relations';
import * as schema from './schema';

export const pool = new Pool({ connectionString: config.DATABASE_URL, max: 20 });

export const db = drizzle({ client: pool, schema: { ...schema, ...relations }, casing: 'snake_case' });

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/**
 * Data functions take an Executor so a use-case can thread one transaction
 * through several modules (D2): bid + auction + outbox commit together.
 */
export type Executor = Db | Tx;

/**
 * Authoritative "now" (A4): the database clock, read after the row lock is
 * held (clock_timestamp, not the transaction-start now()), truncated to the
 * millisecond precision bids are stored at.
 */
export async function dbNow(ex: Executor): Promise<Date> {
  const { rows } = await ex.execute<{ now: Date }>(sql`select date_trunc('milliseconds', clock_timestamp()) as now`);
  return new Date(rows[0].now);
}
