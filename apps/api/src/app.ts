import cookieParser from 'cookie-parser';
import express from 'express';
import { config } from './config';
import { db, dbNow } from './db';
import { deps } from './deps';
import { attachUser, csrf, errorHandler } from './http/middleware';
import { createSseHub } from './infra/sse';
import { uploadRoutes } from './infra/uploads';
import { auctionRoutes, meRoutes } from './modules/auction/auction.routes';
import { adminRoutes, authRoutes } from './modules/auth/auth.routes';
import { getLiveSnapshot } from './modules/bid/bid.usecase';
import { commentRoutes } from './modules/comment/comment.routes';
import { moderationRoutes, reportRoutes } from './modules/moderation/moderation.routes';
import { profileRoutes } from './modules/profile/profile.routes';
import { registerSubscribers } from './bootstrap';

export function createApp() {
  registerSubscribers();
  const sse = createSseHub(deps.events, getLiveSnapshot);

  const app = express();
  // Requests arrive through the Next.js proxy on loopback; trust its X-Forwarded-For.
  app.set('trust proxy', 'loopback');
  app.disable('x-powered-by');
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.use(csrf);
  api.use(attachUser);

  /** Server time for client countdown offset (A4). */
  api.get('/time', async (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ now: (await dbNow(db)).toISOString() });
  });
  api.use('/auth', authRoutes);
  api.use('/auctions', auctionRoutes(sse));
  api.use('/me', meRoutes);
  api.use('/', reportRoutes);
  api.use('/', commentRoutes);
  api.use('/users', profileRoutes);
  api.use('/moderation', moderationRoutes);
  api.use('/admin', adminRoutes);
  api.use('/uploads', uploadRoutes);
  if (!config.isProd) api.get('/dev/mailbox', (_req, res) => res.json({ items: deps.mailbox }));
  api.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such endpoint.' } }));

  app.use('/api', api);
  app.use(errorHandler);
  return { app, sse };
}
