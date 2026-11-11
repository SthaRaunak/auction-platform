import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { auctions } from '@/modules/auction/auction.schema';
import { bids } from '@/modules/bid/bid.schema';
import { verifyAuctionChain } from '@/modules/bid/bid.usecase';
import { Client } from './http';
import { makeAuction, makeUser, resetDb } from './helpers';

// Proves the serialisation lives in Postgres, not in Node: two separate API
// processes, one database, bids split across both (plan §Verification).

const root = path.resolve(import.meta.dirname, '..');
const procs: ChildProcess[] = [];

function startApi(port: number) {
  const child = spawn(path.join(root, 'node_modules/.bin/tsx'), ['src/server.ts'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test', RUN_WORKERS: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  procs.push(child);
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`API on ${port} didn't start`)), 20_000);
    child.stdout!.on('data', (d: Buffer) => {
      if (d.toString().includes('Bidwell API on')) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${port}`);
      }
    });
    child.stderr!.on('data', (d: Buffer) => process.stderr.write(d));
  });
}

let bases: string[] = [];

beforeAll(async () => {
  await resetDb();
  bases = await Promise.all([startApi(4711), startApi(4712)]);
});

afterAll(() => {
  for (const p of procs) p.kill('SIGTERM');
});

describe('two API processes, one Postgres', () => {
  it('20 bids split across both processes: one leader, one ledger, valid chain', async () => {
    const seller = await makeUser();
    const a = await makeAuction(seller);
    const bidders = await Promise.all(Array.from({ length: 20 }, () => makeUser()));
    const clients = await Promise.all(
      bidders.map(async (u, i) => {
        const c = new Client(bases[i % 2]);
        expect((await c.req('POST', '/api/auth/login', { email: u.email, password: 'correct horse battery' })).status).toBe(200);
        return c;
      }),
    );

    const results = await Promise.all(
      clients.map((c, i) => c.req('POST', `/api/auctions/${a.id}/bids`, { maxAmount: 20_000 + i * 1_000, idempotencyKey: randomUUID() })),
    );
    const accepted = results.filter((r) => r.status === 201);
    for (const r of results) expect([201, 422]).toContain(r.status);

    const [final] = await db.select().from(auctions).where(eq(auctions.id, a.id));
    expect(final.leaderId).toBe(bidders[19].id);
    expect(final.currentPrice).toBe(38_500);
    expect(await db.select().from(bids).where(eq(bids.auctionId, a.id))).toHaveLength(accepted.length);
    expect(await verifyAuctionChain(a.id)).toMatchObject({ valid: true, checked: accepted.length });
  });
});
