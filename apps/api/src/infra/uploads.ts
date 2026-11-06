import { mkdirSync } from 'node:fs';
import path from 'node:path';
import express, { Router } from 'express';
import multer from 'multer';
import { config } from '../config';
import { badRequest } from '../errors';
import { rateLimit, requireUser } from '../http/middleware';
import { randomToken } from './tokens';
import { requireVerified } from '../modules/auth/auth.usecase';

const dir = path.resolve(config.UPLOAD_DIR);
mkdirSync(dir, { recursive: true });

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

const upload = multer({
  storage: multer.diskStorage({
    destination: dir,
    filename: (_req, file, cb) => cb(null, `${randomToken(12)}.${EXT[file.mimetype]}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 8 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype in EXT),
});

export const uploadRoutes = Router();

uploadRoutes.post(
  '/',
  rateLimit({ name: 'upload', windowMs: 60 * 60_000, max: 120 }),
  (req, _res, next) => {
    requireVerified(requireUser(req));
    next();
  },
  upload.array('photos', 8),
  (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw badRequest('NO_PHOTOS', 'Upload JPEG, PNG or WebP photos.');
    res.status(201).json({ urls: files.map((f) => `/api/uploads/${f.filename}`) });
  },
);

uploadRoutes.use('/', express.static(dir, { immutable: true, maxAge: '30d', index: false }));
