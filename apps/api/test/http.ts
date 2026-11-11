import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '@/app';

/** A tiny cookie-jar client that behaves like a same-origin browser going through the Next proxy. */
export class Client {
  cookies = new Map<string, string>();
  constructor(
    public base: string,
    public origin = 'http://localhost:3000',
  ) {}

  private store(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const [k, ...v] = pair.split('=');
      const value = v.join('=');
      if (/Expires=Thu, 01 Jan 1970/.test(c) || value === '') this.cookies.delete(k);
      else this.cookies.set(k, decodeURIComponent(value));
    }
  }

  get cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ');
  }

  async req(method: string, path: string, body?: unknown, opts: { csrf?: boolean; headers?: Record<string, string> } = {}) {
    if (!this.cookies.has('bw_csrf') && method !== 'GET') this.store(await fetch(`${this.base}/api/time`));
    const headers: Record<string, string> = { cookie: this.cookieHeader, origin: this.origin, ...opts.headers };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (opts.csrf !== false && this.cookies.has('bw_csrf')) headers['x-csrf-token'] = this.cookies.get('bw_csrf')!;
    const res = await fetch(`${this.base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    this.store(res);
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }
}

export async function startServer() {
  const { app } = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, close: () => new Promise<void>((r) => (server.closeAllConnections(), server.close(() => r()))) };
}

export interface SseMessage {
  id: string;
  event: string;
  data: any;
}

/** Opens an SSE stream and collects parsed messages until aborted. */
export function openStream(url: string, headers: Record<string, string> = {}) {
  const messages: SseMessage[] = [];
  const ctrl = new AbortController();
  const waiters: (() => void)[] = [];
  const done = (async () => {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    let buf = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const msg: Partial<SseMessage> = {};
          for (const line of chunk.split('\n')) {
            if (line.startsWith('id: ')) msg.id = line.slice(4);
            if (line.startsWith('event: ')) msg.event = line.slice(7);
            if (line.startsWith('data: ')) msg.data = JSON.parse(line.slice(6));
          }
          if (msg.event) {
            messages.push(msg as SseMessage);
            waiters.splice(0).forEach((w) => w());
          }
        }
      }
    } catch {
      /* aborted */
    }
  })();
  const waitFor = async (pred: (m: SseMessage[]) => boolean, timeoutMs = 5000) => {
    const deadline = Date.now() + timeoutMs;
    while (!pred(messages)) {
      if (Date.now() > deadline) throw new Error(`SSE wait timed out; got ${JSON.stringify(messages.map((m) => [m.event, m.id]))}`);
      await new Promise<void>((r) => {
        waiters.push(r);
        setTimeout(r, 100);
      });
    }
  };
  return { messages, waitFor, close: async () => (ctrl.abort(), await done) };
}
