import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client } from 'pg';

/** Creates the test database if needed and applies every migration (including the append-only triggers). */
export default async function setup() {
  const url = new URL(process.env.TEST_DATABASE_URL ?? 'postgres://raunak@localhost:5432/bidwell_test');
  const name = url.pathname.slice(1);
  const admin = new Client({ connectionString: Object.assign(new URL(url), { pathname: '/postgres' }).toString() });
  await admin.connect();
  const exists = await admin.query('select 1 from pg_database where datname = $1', [name]);
  if (!exists.rowCount) await admin.query(`create database "${name}"`);
  await admin.end();

  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  await migrate(drizzle({ client }), { migrationsFolder: path.resolve(import.meta.dirname, '../drizzle') });
  await client.end();
}
