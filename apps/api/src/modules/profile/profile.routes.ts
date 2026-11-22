import type { UserProfile } from '@bidwell/contract';
import { Router } from 'express';
import { z } from 'zod';
import { notFound } from '@/errors';
import { parse } from '@/http/middleware';
import { listingsBy, profileCounts } from '../auction/auction.usecase';
import { getUser, initialsOf } from '../auth/auth.usecase';
import { ratingSummaries, reviewsReceived } from '../review/review.usecase';

// Public profiles compose three modules' use-cases. What a person is *bidding on*
// is deliberately absent: bidders stay masked while auctions run (E5).

const uuid = (raw: unknown) => parse(z.uuid(), raw);
const which = z.enum(['live', 'ended']).default('live');

export const profileRoutes = Router();

profileRoutes.get('/:id', async (req, res) => {
  const user = await getUser(uuid(req.params.id));
  if (!user) throw notFound('User');
  const [ratings, counts] = await Promise.all([ratingSummaries(user.id), profileCounts(user.id)]);
  const profile: UserProfile = {
    id: user.id,
    displayName: user.displayName,
    initials: initialsOf(user.displayName),
    memberSince: user.createdAt.toISOString(),
    isStaff: user.role === 'moderator' || user.role === 'admin',
    asSeller: ratings.seller,
    asBuyer: ratings.buyer,
    lotsListed: counts.listed,
    lotsSold: counts.sold,
    lotsWon: counts.won,
  };
  res.json(profile);
});

profileRoutes.get('/:id/listings', async (req, res) => {
  const user = await getUser(uuid(req.params.id));
  if (!user) throw notFound('User');
  res.json({ items: await listingsBy(user.id, req.user, parse(which, req.query.status)) });
});

profileRoutes.get('/:id/reviews', async (req, res) => {
  res.json({ items: await reviewsReceived(uuid(req.params.id)) });
});
