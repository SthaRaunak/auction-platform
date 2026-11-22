import { commentInput, removeCommentInput } from '@bidwell/contract';
import { Router } from 'express';
import { z } from 'zod';
import { parse, rateLimit, requireUser } from '@/http/middleware';
import * as comments from './comment.usecase';

const uuid = (raw: unknown) => parse(z.uuid(), raw);

export const commentRoutes = Router();

commentRoutes.get('/auctions/:id/comments', async (req, res) => {
  res.json({ items: await comments.listComments(uuid(req.params.id), req.user) });
});

commentRoutes.post(
  '/auctions/:id/comments',
  rateLimit({ name: 'comment', windowMs: 60_000, max: 6, key: (req) => req.user?.id ?? req.ip ?? '' }),
  async (req, res) => {
    const c = await comments.postComment(requireUser(req), uuid(req.params.id), parse(commentInput, req.body).body);
    res.status(201).json({ id: c.id });
  },
);

commentRoutes.post('/comments/:id/remove', async (req, res) => {
  await comments.removeComment(requireUser(req), uuid(req.params.id), parse(removeCommentInput, req.body).reason);
  res.json({ ok: true });
});
