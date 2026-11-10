import type { AuctionLiveState, FeedEntry, LiveEvent } from '@bidwell/contract';
import type { Request, Response } from 'express';
import type { EventPublisher } from '../ports/eventPublisher';

const COALESCE_MS = 250;
const HEARTBEAT_MS = 15_000;

interface Pending {
  state: AuctionLiveState;
  feed: FeedEntry[];
}

/**
 * Server-Sent Events fan-out for auction detail pages (B2).
 *  - Every message carries the auction's monotonic `version` as its SSE id, so
 *    a reconnecting browser sends it back as Last-Event-ID (B1).
 *  - On (re)connect the client gets a full snapshot unless it is already at
 *    the current version — that is what makes a dropped connection converge.
 *  - Bursts are coalesced to one message per auction per 250ms (B4): the latest
 *    absolute state plus every feed entry in between.
 *  - Payloads are the masked public state; no user id is ever written here (E5).
 */
export function createSseHub(events: EventPublisher, snapshotOf: (auctionId: string) => Promise<{ state: AuctionLiveState; feed: FeedEntry[] }>) {
  const channels = new Map<string, Set<Response>>();
  const pending = new Map<string, Pending>();

  const write = (res: Response, event: LiveEvent) => {
    res.write(`id: ${event.version}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  };

  const flush = (auctionId: string) => {
    const p = pending.get(auctionId);
    pending.delete(auctionId);
    const subs = channels.get(auctionId);
    if (!p || !subs) return;
    for (const res of subs) write(res, { type: 'delta', ...p.state, feed: p.feed });
  };

  events.subscribe((e) => {
    if (e.topic !== 'auction.state' || !channels.has(e.aggregateId)) return;
    const { state, feed } = e.payload as unknown as Pending;
    const p = pending.get(e.aggregateId);
    if (p) {
      if (state.version >= p.state.version) p.state = state;
      p.feed.push(...feed);
    } else {
      pending.set(e.aggregateId, { state, feed: [...feed] });
      setTimeout(() => flush(e.aggregateId), COALESCE_MS);
    }
  });

  async function attach(auctionId: string, req: Request, res: Response) {
    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write('retry: 2000\n\n');

    // Subscribe before reading the snapshot so nothing committed in between is lost.
    let subs = channels.get(auctionId);
    if (!subs) channels.set(auctionId, (subs = new Set()));
    subs.add(res);

    const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
    req.on('close', () => {
      clearInterval(heartbeat);
      subs.delete(res);
      if (!subs.size) channels.delete(auctionId);
    });

    const lastSeen = Number(req.get('Last-Event-ID') ?? req.query.lastVersion ?? -1);
    const snap = await snapshotOf(auctionId);
    if (snap.state.version !== lastSeen) write(res, { type: 'snapshot', ...snap.state, feed: snap.feed });
  }

  return { attach, connections: () => [...channels.values()].reduce((n, s) => n + s.size, 0) };
}
