import { emailOnlyInput, loginInput, registerInput, resetPasswordInput, roleInput, tokenInput } from '@bidwell/contract';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '@/config';
import { DomainError } from '@/errors';
import { clearSessionCookie, meta, parse, rateLimit, requireUser, setSessionCookie } from '@/http/middleware';
import { finishGoogleAuth, startGoogleAuth } from '@/infra/googleOauth';
import { watchCount } from '../auction/auction.usecase';
import * as auth from './auth.usecase';

const OAUTH_COOKIE = 'bw_oauth';

// Login throttling (C5): per IP and per target account, on top of the lockout in the use-case.
const loginByIp = rateLimit({ name: 'login-ip', windowMs: 60_000, max: 20 });
const loginByAccount = rateLimit({ name: 'login-acct', windowMs: 15 * 60_000, max: 30, key: (req) => String(req.body?.email ?? '').toLowerCase() });
const emailSends = rateLimit({ name: 'email-send', windowMs: 60 * 60_000, max: 10 });

export const authRoutes = Router();

authRoutes.get('/me', async (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: await auth.toMe(req.user, await watchCount(req.user.id)) });
});

authRoutes.post('/register', emailSends, async (req, res) => {
  await auth.register(parse(registerInput, req.body));
  res.status(202).json({ ok: true, message: 'Check your inbox for a link to confirm your email.' });
});

authRoutes.post('/verify-email', async (req, res) => {
  const { token } = parse(tokenInput, req.body);
  setSessionCookie(res, await auth.verifyEmail(token, meta(req)));
  res.json({ ok: true });
});

authRoutes.post('/resend-verification', emailSends, async (req, res) => {
  await auth.resendVerification(requireUser(req).id);
  res.json({ ok: true });
});

authRoutes.post('/login', loginByIp, loginByAccount, async (req, res) => {
  setSessionCookie(res, await auth.login(parse(loginInput, req.body), meta(req)));
  res.json({ ok: true });
});

authRoutes.post('/logout', async (req, res) => {
  if (req.sessionToken) await auth.logout(req.sessionToken);
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRoutes.post('/logout-all', async (req, res) => {
  await auth.logoutEverywhere(requireUser(req).id);
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRoutes.post('/forgot-password', emailSends, async (req, res) => {
  await auth.requestPasswordReset(parse(emailOnlyInput, req.body).email);
  res.status(202).json({ ok: true, message: 'If that email has an account, a reset link is on its way.' });
});

authRoutes.post('/reset-password', async (req, res) => {
  const { token, password } = parse(resetPasswordInput, req.body);
  setSessionCookie(res, await auth.resetPassword(token, password, meta(req)));
  res.json({ ok: true });
});

const safeNext = (v: unknown) => (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') ? v : '/');

authRoutes.get('/google', (req, res) => {
  if (!config.googleEnabled) return res.redirect('/login?error=google_unavailable');
  const { url, state, verifier } = startGoogleAuth();
  res.cookie(OAUTH_COOKIE, JSON.stringify({ state, verifier, next: safeNext(req.query.next) }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: 10 * 60_000,
    path: '/api/auth/google',
  });
  res.redirect(url);
});

authRoutes.get('/google/callback', async (req, res) => {
  const stored = (() => {
    try {
      return JSON.parse(req.cookies?.[OAUTH_COOKIE] ?? '') as { state: string; verifier: string; next: string };
    } catch {
      return null;
    }
  })();
  res.clearCookie(OAUTH_COOKIE, { path: '/api/auth/google' });
  if (!stored || req.query.state !== stored.state || typeof req.query.code !== 'string') {
    return res.redirect('/login?error=google_state');
  }
  try {
    const profile = await finishGoogleAuth(req.query.code, stored.verifier);
    setSessionCookie(res, await auth.loginWithGoogle(profile, meta(req)));
    res.redirect(stored.next);
  } catch (err) {
    const code = err instanceof DomainError ? err.code.toLowerCase() : 'google_failed';
    if (!(err instanceof DomainError)) console.error(err);
    res.redirect(`/login?error=${code}`);
  }
});

export const adminRoutes = Router();

adminRoutes.post('/users/:id/role', async (req, res) => {
  const { role } = parse(roleInput, req.body);
  const { reason } = parse(z.object({ reason: z.string().trim().min(5).max(500) }), req.body);
  await auth.setRole(requireUser(req), parse(z.uuid(), req.params.id), role, reason);
  res.json({ ok: true });
});
