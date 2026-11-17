'use client';

import type { FeedEntry } from '@bidwell/contract';
import { useNow } from '../Clock';
import { ago, money } from '@/lib/format';
import type { Connection } from './useLiveAuction';

export function whoIs(f: Pick<FeedEntry, 'bidderNo' | 'name'>, viewerNo: number | null) {
  if (viewerNo !== null && f.bidderNo === viewerNo) return 'You';
  return f.name ?? `Bidder #${f.bidderNo}`;
}

export function BidFeed({ feed, freshKeys, viewerNo, connection, live, bidCount, resultHref }: { feed: FeedEntry[]; freshKeys: string[]; viewerNo: number | null; connection: Connection; live: boolean; bidCount: number; resultHref: string }) {
  const now = useNow();
  return (
    <section className="card !gap-0 !p-0" aria-labelledby="feed-title">
      <div className="flex items-center justify-between border-b border-divider px-4 py-[13px]">
        <h2 id="feed-title" className="k">
          Bid history{live ? ' · live' : ''}
        </h2>
        {live && (
          <span className="row mut !gap-1.5 text-[11px]">
            <span className="block h-[7px] w-[7px] rounded-full" style={{ background: connection === 'live' ? 'var(--color-accent)' : 'var(--color-neutral-400)' }} aria-hidden />
            {connection === 'live' ? 'updating' : connection === 'connecting' ? 'connecting' : 'reconnecting…'}
          </span>
        )}
      </div>
      {feed.length === 0 ? (
        <p className="mut px-4 py-5 text-[13px]">No bids yet — the first bid opens at the starting price.</p>
      ) : (
        <ol>
          {feed.map((f, i) => {
            const who = whoIs(f, viewerNo);
            return (
              <li
                key={f.key}
                className={`flex items-center justify-between gap-2.5 px-4 py-2.5 ${freshKeys.includes(f.key) ? 'flash' : ''}`}
                style={{ borderBottom: '1px solid color-mix(in srgb, var(--color-text) 7%, transparent)', background: i === 0 && !freshKeys.includes(f.key) ? 'var(--color-accent-100)' : undefined }}
              >
                <span className="av h-[26px] w-[26px] text-[10px]" aria-hidden>
                  {who === 'You' ? 'You' : f.name ? f.name.slice(0, 2).toUpperCase() : `#${f.bidderNo}`}
                </span>
                <div className="flex-1">
                  <div className="text-[13px]" style={{ fontWeight: i === 0 ? 600 : 400 }}>
                    {who}
                  </div>
                  <div className="mut text-[11px]" suppressHydrationWarning>
                    {f.kind === 'auto' ? 'Auto bid' : 'Bid'} · {ago(f.at, now)}
                  </div>
                </div>
                <span className="num text-[17px]">{money(f.amount)}</span>
              </li>
            );
          })}
        </ol>
      )}
      <div className="px-4 py-[11px] text-[12px]">
        {live ? (
          <span className="mut">
            {bidCount} {bidCount === 1 ? 'bid' : 'bids'} so far. Bidders are numbered, and maximums stay sealed until the auction ends — then the full log is published.
          </span>
        ) : (
          <a href={resultHref}>See the full published bid log ({bidCount} bids)</a>
        )}
      </div>
    </section>
  );
}
