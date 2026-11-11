import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startDrainer, stopDrainer } from '@/modules/outbox/outbox.drainer';
import { Client, openStream, startServer } from './http';
import { makeAuction, makeUser, resetDb } from './helpers';

let server: Awaited<ReturnType<typeof startServer>>;

beforeAll(async () => {
  server = await startServer();
  startDrainer();
});
afterAll(async () => {
  stopDrainer();
  await server.close();
});
beforeEach(resetDb);

async function signedIn(email: string) {
  const c = new Client(server.base);
  const r = await c.req('POST', '/api/auth/login', { email, password: 'correct horse battery' });
  expect(r.status).toBe(200);
  return c;
}

describe('CSRF and origin (C4)', () => {
  it('refuses a state change without the double-submit token', async () => {
    const u = await makeUser();
    const c = new Client(server.base);
    const r = await c.req('POST', '/api/auth/login', { email: u.email, password: 'correct horse battery' }, { csrf: false });
    expect(r).toMatchObject({ status: 403, body: { error: { code: 'CSRF' } } });
  });

  it('refuses a cross-origin request even with a token', async () => {
    const u = await makeUser();
    const c = new Client(server.base, 'https://evil.example');
    const r = await c.req('POST', '/api/auth/login', { email: u.email, password: 'correct horse battery' });
    expect(r).toMatchObject({ status: 403, body: { error: { code: 'BAD_ORIGIN' } } });
  });
});

describe('SSE live updates (B1, B4, E5)', () => {
  it('pushes versioned deltas with masked identities', async () => {
    const seller = await makeUser();
    const alice = await makeUser();
    const a = await makeAuction(seller);
    const client = await signedIn(alice.email);

    const stream = openStream(`${server.base}/api/auctions/${a.id}/events`);
    await stream.waitFor((m) => m.some((x) => x.event === 'snapshot'));

    const r = await client.req('POST', `/api/auctions/${a.id}/bids`, { maxAmount: 30_000, idempotencyKey: randomUUID() });
    expect(r.status).toBe(201);
    await stream.waitFor((m) => m.some((x) => x.event === 'delta'));
    const delta = stream.messages.find((m) => m.event === 'delta')!;
    expect(delta.id).toBe('1');
    expect(delta.data).toMatchObject({ version: 1, price: 10_000, bidCount: 1, leaderNo: 1 });
    expect(JSON.stringify(delta.data)).not.toContain(alice.id);
    await stream.close();
  });

  it('a client that drops, misses bids and reconnects with Last-Event-ID converges to the right state', async () => {
    const seller = await makeUser();
    const [alice, bob] = [await makeUser(), await makeUser()];
    const a = await makeAuction(seller);
    const [ca, cb] = [await signedIn(alice.email), await signedIn(bob.email)];

    const first = openStream(`${server.base}/api/auctions/${a.id}/events`);
    await first.waitFor((m) => m.length > 0);
    const seen = Number(first.messages.at(-1)!.id);
    await first.close(); // connection drops

    await ca.req('POST', `/api/auctions/${a.id}/bids`, { maxAmount: 20_000, idempotencyKey: randomUUID() });
    await cb.req('POST', `/api/auctions/${a.id}/bids`, { maxAmount: 26_000, idempotencyKey: randomUUID() });

    const again = openStream(`${server.base}/api/auctions/${a.id}/events`, { 'Last-Event-ID': String(seen) });
    await again.waitFor((m) => m.some((x) => x.event === 'snapshot'));
    const snap = again.messages.find((m) => m.event === 'snapshot')!.data;
    expect(snap).toMatchObject({ version: 2, price: 20_500, bidCount: 2, leaderNo: 2 });
    expect(snap.feed[0]).toMatchObject({ bidderNo: 2, kind: 'bid', amount: 20_500 });
    await again.close();
  });

  it('a client already at the current version gets no redundant snapshot', async () => {
    const seller = await makeUser();
    const a = await makeAuction(seller);
    const s = openStream(`${server.base}/api/auctions/${a.id}/events`, { 'Last-Event-ID': '0' });
    await new Promise((r) => setTimeout(r, 300));
    expect(s.messages).toHaveLength(0);
    await s.close();
  });
});
