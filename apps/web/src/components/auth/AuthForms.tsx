'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ApiError, api } from '@/lib/client';

const safeNext = (next?: string) => (next && next.startsWith('/') && !next.startsWith('//') ? next : '/');

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  };
  return { busy, error, run };
}

const GOOGLE_ERRORS: Record<string, string> = {
  google_unavailable: 'Google sign-in isn’t configured on this server — use your email and password.',
  google_state: 'The Google sign-in expired. Try again.',
  google_failed: 'Google sign-in failed. Try again.',
  google_email_unverified: 'Your Google account’s email isn’t verified, so we can’t use it to sign you in.',
};

export function GoogleButton({ next }: { next?: string }) {
  return (
    <a href={`/api/auth/google?next=${encodeURIComponent(safeNext(next))}`} className="btn btn-secondary w-full !bg-white !py-2.5">
      <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
        <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.9z" />
        <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.7-.4-3.9z" />
      </svg>
      Continue with Google
    </a>
  );
}

export function LoginForm({ next, error: initialError }: { next?: string; error?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useSubmit();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          await api('POST', '/auth/login', { email, password });
          router.push(safeNext(next));
          router.refresh();
        });
      }}
    >
      {initialError && <p className="banner banner-warn">{GOOGLE_ERRORS[initialError] ?? 'Sign-in failed. Try again.'}</p>}
      <GoogleButton next={next} />
      <div className="row mut !gap-3 text-[12px]">
        <hr className="hr flex-1 !my-0" /> or <hr className="hr flex-1 !my-0" />
      </div>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" type="password" autoComplete="current-password" required className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn-primary !py-2.5" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      <p className="text-[13px]">
        <Link href="/forgot-password">Forgot your password?</Link> · New here? <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Create an account</Link>
      </p>
    </form>
  );
}

export function RegisterForm({ next }: { next?: string }) {
  const [displayName, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useSubmit();
  if (sent) {
    return (
      <div className="banner banner-accent">
        <span>
          Check your inbox — we sent a link to <strong>{email}</strong>. Confirming your email lets you bid and sell.
          {process.env.NODE_ENV !== 'production' && (
            <>
              {' '}
              (Dev: open the <Link href="/dev/mailbox">dev mailbox</Link>.)
            </>
          )}
        </span>
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          await api('POST', '/auth/register', { displayName, email, password });
          setSent(true);
        });
      }}
    >
      <GoogleButton next={next} />
      <div className="row mut !gap-3 text-[12px]">
        <hr className="hr flex-1 !my-0" /> or <hr className="hr flex-1 !my-0" />
      </div>
      <div className="field">
        <label htmlFor="name">Your name</label>
        <input id="name" autoComplete="name" required minLength={2} maxLength={60} className="input" value={displayName} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" type="password" autoComplete="new-password" required minLength={10} className="input" value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="pw-hint" />
        <p id="pw-hint" className="hint">
          At least 10 characters. A short phrase works well.
        </p>
      </div>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn-primary !py-2.5" disabled={busy}>
        {busy ? 'Creating account…' : 'Create account'}
      </button>
      <p className="text-[13px]">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </form>
  );
}

export function VerifyEmail({ token }: { token?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(token ? null : 'This link is missing its token.');
  const started = useRef(false);
  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    api('POST', '/auth/verify-email', { token })
      .then(() => {
        router.push('/?verified=1');
        router.refresh();
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Verification failed.'));
  }, [token, router]);
  return error ? (
    <p className="banner banner-danger">
      {error} Sign in and use “Resend link” to get a fresh one.
    </p>
  ) : (
    <p className="mut">Confirming your email…</p>
  );
}

export function ForgotForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useSubmit();
  if (sent) return <p className="banner banner-accent">If that email has an account, a reset link is on its way. It works for 30 minutes.</p>;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          await api('POST', '/auth/forgot-password', { email });
          setSent(true);
        });
      }}
    >
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {error && <p className="err">{error}</p>}
      <button className="btn btn-primary" disabled={busy}>
        Send reset link
      </button>
    </form>
  );
}

export function ResetForm({ token }: { token?: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const { busy, error, run } = useSubmit();
  if (!token) return <p className="banner banner-danger">This link is missing its token.</p>;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          await api('POST', '/auth/reset-password', { token, password });
          router.push('/');
          router.refresh();
        });
      }}
    >
      <div className="field">
        <label htmlFor="password">New password</label>
        <input id="password" type="password" autoComplete="new-password" required minLength={10} className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
        <p className="hint">Resetting signs you out on every other device.</p>
      </div>
      {error && <p className="err">{error}</p>}
      <button className="btn btn-primary" disabled={busy}>
        Set password and sign in
      </button>
    </form>
  );
}
