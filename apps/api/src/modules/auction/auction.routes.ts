import { auctionCreateInput, auctionUpdateInput, listAuctionsQuery, placeBidInput, reviewInput, type MarketStats } from '@bidwell/contract';
import { Router } from 'express';
import { z } from 'zod';
import { dbNow, db } from '@/db';
import { meta, parse, rateLimit, requireUser } from '@/http/middleware';
import type { createSseHub } from '@/infra/sse';
import * as bids from '../bid/bid.usecase';
import { payDeposit } from '../payment/payment.usecase';
import { submitReview } from '../review/review.usecase';
import * as auctions from './auction.usecase';

const uuidParam = z.uuid();
const id = (raw: unknown) => parse(uuidParam, raw);

/** Bids: generous for humans, tight enough to blunt scripted hammering of one lot. */
const bidLimit = rateLimit({ name: 'bid', windowMs: 10_000, max: 20, key: (req) => req.user?.id ?? req.ip ?? '' });

export function auctionRoutes(sse: ReturnType<typeof createSseHub>) {
  const r = Router();

  r.get('/', async (req, res) => {
    res.json(await auctions.listAuctions(parse(listAuctionsQuery, req.query), req.user?.id ?? null));
  });

  r.get('/facets', async (req, res) => {
    res.json({ brands: await auctions.brandFacets(parse(listAuctionsQuery, req.query)) });
  });

  r.get('/stats', async (_req, res) => {
    const [counts, bidsPerMinute, now] = await Promise.all([auctions.marketCounts(), bids.bidsPerMinute(), dbNow(db)]);
    const stats: MarketStats = { ...counts, bidsPerMinute, serverNow: now.toISOString() };
    res.json(stats);
  });

  r.get('/ending-soon', async (req, res) => {
    const limit = Math.min(24, Number(req.query.limit) || 12);
    res.json({ items: await auctions.endingSoon(limit, req.user?.id ?? null) });
  });

  r.post('/', async (req, res) => {
    const created = await auctions.createAuction(requireUser(req), parse(auctionCreateInput, req.body));
    res.status(201).json({ id: created.id });
  });

  r.get('/:id', async (req, res) => {
    res.json(await bids.getAuctionDetail(id(req.params.id), req.user));
  });

  r.patch('/:id', async (req, res) => {
    await auctions.updateAuction(requireUser(req), id(req.params.id), parse(auctionUpdateInput, req.body));
    res.json({ ok: true });
  });

  r.get('/:id/similar', async (req, res) => {
    const a = await auctions.getAuction(id(req.params.id));
    res.json({ items: await auctions.similarTo(a, req.user?.id ?? null) });
  });

  r.get('/:id/amendments', async (req, res) => {
    res.json({ items: await auctions.amendmentsFor(id(req.params.id)) });
  });

  r.get('/:id/result', async (req, res) => {
    res.json(await bids.getAuctionResult(id(req.params.id)));
  });

  r.get('/:id/verify', async (req, res) => {
    res.json(await bids.verifyAuctionChain(id(req.params.id)));
  });

  r.get('/:id/events', async (req, res) => {
    const auctionId = id(req.params.id);
    await auctions.getAuction(auctionId);
    await sse.attach(auctionId, req, res);
  });

  r.post('/:id/bids', bidLimit, async (req, res) => {
    const result = await bids.placeBid(requireUser(req), id(req.params.id), parse(placeBidInput, req.body), meta(req));
    res.status(result.replayed ? 200 : 201).json(result);
  });

  r.post('/:id/deposit', async (req, res) => {
    const d = await payDeposit(requireUser(req), id(req.params.id));
    res.status(201).json({ id: d.id, status: d.status, amount: d.amount });
  });

  r.put('/:id/watch', async (req, res) => {
    res.json(await auctions.setWatched(requireUser(req), id(req.params.id), true));
  });

  r.delete('/:id/watch', async (req, res) => {
    res.json(await auctions.setWatched(requireUser(req), id(req.params.id), false));
  });

  r.post('/:id/review', async (req, res) => {
    await submitReview(requireUser(req), id(req.params.id), parse(reviewInput, req.body));
    res.status(201).json({ ok: true });
  });

  return r;
}

export const meRoutes = Router();

meRoutes.get('/watchlist', async (req, res) => {
  res.json({ items: await auctions.myWatchlist(requireUser(req)) });
});

meRoutes.get('/bids', async (req, res) => {
  res.json({ items: await bids.myBids(requireUser(req)) });
});

meRoutes.get('/listings', async (req, res) => {
  res.json({ items: await auctions.myListings(requireUser(req)) });
});
