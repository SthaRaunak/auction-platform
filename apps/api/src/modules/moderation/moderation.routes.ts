import { appealInput, moderationActionInput, reportInput, resolveAppealInput } from '@bidwell/contract';
import { Router } from 'express';
import { z } from 'zod';
import { parse, rateLimit, requireUser } from '@/http/middleware';
import { forfeitDeposit } from '../payment/payment.usecase';
import * as mod from './moderation.usecase';

const uuid = (raw: unknown) => parse(z.uuid(), raw);
const reasonBody = z.object({ reason: z.string().trim().min(5).max(1000) });

export const reportRoutes = Router();

reportRoutes.post('/auctions/:id/reports', rateLimit({ name: 'report', windowMs: 60 * 60_000, max: 20 }), async (req, res) => {
  const report = await mod.reportAuction(requireUser(req), uuid(req.params.id), parse(reportInput, req.body));
  res.status(201).json({ id: report.id });
});

reportRoutes.get('/me/moderation', async (req, res) => {
  res.json({ items: await mod.myModerationActions(requireUser(req)) });
});

reportRoutes.post('/appeals', async (req, res) => {
  const appeal = await mod.fileAppeal(requireUser(req), parse(appealInput, req.body));
  res.status(201).json({ id: appeal.id });
});

export const moderationRoutes = Router();

const reportStatus = z.enum(['open', 'actioned', 'dismissed']).default('open');
const appealStatus = z.enum(['open', 'upheld', 'overturned']).default('open');

moderationRoutes.get('/reports', async (req, res) => {
  res.json({ items: await mod.listReports(requireUser(req), parse(reportStatus, req.query.status)) });
});

moderationRoutes.post('/reports/:id/dismiss', async (req, res) => {
  await mod.dismissReport(requireUser(req), uuid(req.params.id), parse(reasonBody, req.body).reason);
  res.json({ ok: true });
});

moderationRoutes.post('/auctions/:id/actions', async (req, res) => {
  await mod.moderateAuction(requireUser(req), uuid(req.params.id), parse(moderationActionInput, req.body));
  res.json({ ok: true });
});

moderationRoutes.get('/audit', async (req, res) => {
  res.json({ items: await mod.listAudit(requireUser(req)) });
});

moderationRoutes.get('/appeals', async (req, res) => {
  res.json({ items: await mod.listAppeals(requireUser(req), parse(appealStatus, req.query.status)) });
});

moderationRoutes.post('/appeals/:id/resolve', async (req, res) => {
  await mod.resolveAppeal(requireUser(req), uuid(req.params.id), parse(resolveAppealInput, req.body));
  res.json({ ok: true });
});

moderationRoutes.post('/deposits/:id/forfeit', async (req, res) => {
  await forfeitDeposit(requireUser(req), uuid(req.params.id), parse(reasonBody, req.body).reason);
  res.json({ ok: true });
});
