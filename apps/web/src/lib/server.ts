import 'server-only';
import type { ApiErrorBody, Me } from '@bidwell/contract';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

const API = process.env.API_ORIGIN ?? 'http://localhost:4000';

export class ServerApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Server-component reads from Express. Always `no-store` (B6): an auction page
 * rendered from a cached fetch would show a stale price. The viewer's cookie is
 * forwarded so responses are personalised.
 */
export async function apiGet<T>(path: string, opts: { allow404?: boolean } = {}): Promise<T> {
  const jar = await cookies();
  const res = await fetch(`${API}/api${path}`, { headers: { cookie: jar.toString() }, cache: 'no-store' });
  if (res.status === 404 && !opts.allow404) notFound();
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ServerApiError(res.status, body?.error.code ?? 'HTTP', body?.error.message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function getMe(): Promise<Me | null> {
  try {
    return (await apiGet<{ user: Me | null }>('/auth/me')).user;
  } catch {
    return null;
  }
}

export function toQuery(params: Record<string, string | string[] | undefined>, drop: string[] = []) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (drop.includes(k) || v === undefined || v === '') continue;
    q.set(k, Array.isArray(v) ? v.join(',') : v);
  }
  return q;
}
