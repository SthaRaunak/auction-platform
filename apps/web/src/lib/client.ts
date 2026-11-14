import type { ApiErrorBody } from '@bidwell/contract';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

function readCookie(name: string) {
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

/** Double-submit CSRF (C4): echo the bw_csrf cookie in a header. Fetches one if we don't have it yet. */
async function csrfToken() {
  let token = readCookie('bw_csrf');
  if (!token) {
    await fetch('/api/time', { cache: 'no-store' });
    token = readCookie('bw_csrf');
  }
  return token ? decodeURIComponent(token) : '';
}

export async function api<T = unknown>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (method !== 'GET') headers['x-csrf-token'] = await csrfToken();
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, err?.code ?? 'HTTP', err?.message ?? 'Something went wrong. Try again.', err?.details);
  }
  return data as T;
}

export async function uploadPhoto(file: File): Promise<string> {
  const form = new FormData();
  form.append('photos', file);
  const res = await fetch('/api/uploads', { method: 'POST', headers: { 'x-csrf-token': await csrfToken() }, body: form });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? 'HTTP', data?.error?.message ?? 'Upload failed.');
  return (data as { urls: string[] }).urls[0];
}
