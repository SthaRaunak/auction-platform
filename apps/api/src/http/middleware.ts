import type { NextFunction, Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { config } from '@/config';
import { deps } from '@/deps';
import { DomainError, unauthorized } from '@/errors';
import { randomToken } from '@/infra/tokens';
import { getSessionUser, type RequestMeta, type UserRow } from '@/modules/auth/auth.usecase';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user: UserRow | null;
      sessionToken?: string;
    }
  }
}

export const SESSION_COOKIE = 'bw_session';
export const CSRF_COOKIE = 'bw_csrf';

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  return schema.parse(data);
}

export const meta = (req: Request): RequestMeta => ({ ip: req.ip, userAgent: req.get('user-agent') });

export function requireUser(req: Request): UserRow {
  if (!req.user) throw unauthorized();
  return req.user;
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    // Same-origin through the Next proxy (C2), so Lax suffices and blocks cross-site POSTs.
    sameSite: 'lax',
    secure: config.isProd,
    path: '/',
    maxAge: config.SESSION_TTL_DAYS * 86_400_000,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  const found = await getSessionUser(token);
  req.user = found?.user ?? null;
  req.sessionToken = found ? token : undefined;
  next();
}

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF (C4): SameSite=Lax session cookie, an Origin check, and a double-submit
 * token — the `bw_csrf` cookie must be echoed in the `x-csrf-token` header,
 * which a cross-site page can neither read nor set.
 */
export function csrf(req: Request, res: Response, next: NextFunction) {
  let token = req.cookies?.[CSRF_COOKIE] as string | undefined;
  if (!token) {
    token = randomToken(24);
    res.cookie(CSRF_COOKIE, token, { sameSite: 'lax', secure: config.isProd, path: '/', httpOnly: false });
  }
  if (SAFE.has(req.method)) return next();
  const origin = req.get('origin');
  if (origin && origin !== config.APP_ORIGIN) return next(new DomainError(403, 'BAD_ORIGIN', 'Cross-origin request refused.'));
  if (!req.cookies?.[CSRF_COOKIE] || req.get('x-csrf-token') !== req.cookies[CSRF_COOKIE]) {
    return next(new DomainError(403, 'CSRF', 'Your session token is missing or stale — refresh the page and try again.'));
  }
  next();
}

/** Fixed-window, in-memory. Per-instance only — documented as a limitation. */
export function rateLimit(opts: { name: string; windowMs: number; max: number; key?: (req: Request) => string }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = deps.clock.now().getTime();
    const key = `${opts.name}:${opts.key ? opts.key(req) : req.ip}`;
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + opts.windowMs };
      hits.set(key, entry);
      if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }
    entry.count++;
    if (entry.count > opts.max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return next(new DomainError(429, 'RATE_LIMITED', 'Too many requests — slow down and try again shortly.'));
    }
    next();
  };
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof DomainError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: err.issues[0]?.message ?? 'Invalid input', details: z.flattenError(err) } });
  }
  if ((err as { type?: string }).type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'TOO_LARGE', message: 'Request too large.' } });
  }
  if ((err as { code?: string }).code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: { code: 'TOO_LARGE', message: 'Photos must be under 5 MB.' } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side.' } });
}
