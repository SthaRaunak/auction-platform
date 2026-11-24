import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ImageCredit } from '@bidwell/contract';

// Demo stock photos for the dev seed, from the official Unsplash API
// (https://unsplash.com/documentation). Photos are hotlinked, as the API
// guidelines require, and every one carries photographer attribution.
// Results are cached in seed-photos.json so reseeding is stable and doesn't
// spend the free tier's 50 requests/hour.

const CACHE = path.resolve(import.meta.dirname, 'seed-photos.json');
const UTM = 'utm_source=bidwell_demo&utm_medium=referral';

export interface StockPhoto {
  url: string;
  credit: ImageCredit;
}

interface UnsplashResult {
  urls: { raw: string };
  links: { html: string };
  user: { name: string; links: { html: string } };
}

export async function stockPhotos() {
  const cache: Record<string, StockPhoto[]> = existsSync(CACHE) ? JSON.parse(await readFile(CACHE, 'utf8')) : {};
  const key = process.env.UNSPLASH_ACCESS_KEY;
  let changed = false;
  let failed = false;

  async function photosFor(query: string, count: number): Promise<StockPhoto[]> {
    if ((cache[query]?.length ?? 0) >= count || !key || failed) return (cache[query] ?? []).slice(0, count);

    const url = new URL('https://api.unsplash.com/search/photos');
    url.search = new URLSearchParams({ query, per_page: String(Math.max(count, 3)), orientation: 'landscape', content_filter: 'high' }).toString();
    const res = await fetch(url, { headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' } });
    if (!res.ok) {
      failed = true;
      console.warn(`  Unsplash API returned ${res.status} (${res.headers.get('x-ratelimit-remaining') ?? '?'} requests left) — remaining lots keep placeholders.`);
      return cache[query] ?? [];
    }
    const { results } = (await res.json()) as { results: UnsplashResult[] };
    cache[query] = results.map((r) => ({
      url: `${r.urls.raw}&w=1200&h=900&fit=crop&crop=entropy&q=75&auto=format`,
      credit: { author: r.user.name, authorUrl: `${r.user.links.html}?${UTM}`, sourceUrl: `${r.links.html}?${UTM}`, source: 'Unsplash' },
    }));
    changed = true;
    return cache[query].slice(0, count);
  }

  async function save() {
    if (changed) await writeFile(CACHE, `${JSON.stringify(cache, null, 2)}\n`);
  }

  return { photosFor, save, available: Boolean(key) || Object.keys(cache).length > 0 };
}
