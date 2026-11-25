'use client';

import type { FeedEntry } from '@bidwell/contract';
import { useI18n } from '@/i18n/client';
import { useNow } from '../Clock';
import type { Connection } from './useLiveAuction';

export function BidFeed({ feed, freshKeys, viewerNo, connection, live, bidCount, masked, resultHref }: { feed: FeedEntry[]; freshKeys: string[]; viewerNo: number | null; connection: Connection; live: boolean; bidCount: number; masked: boolean; resultHref: string }) {
  const now = useNow();
  const { t, money, ago, digits } = useI18n();
  return (
    <section className="card !gap-0 !p-0" aria-labelledby="feed-title">
      <div className="flex items-center justify-between border-b border-divider px-4 py-[13px]">
        <h2 id="feed-title" className="k">
          {t('feed.title')}
          {live ? t('feed.live') : ''}
        </h2>
        {live && (
          <span className="row mut !gap-1.5 text-[12px]">
            <span className="block h-[7px] w-[7px] rounded-full" style={{ background: connection === 'live' ? 'var(--color-accent)' : 'var(--color-neutral-400)' }} aria-hidden />
            {t(connection === 'live' ? 'feed.updating' : connection === 'connecting' ? 'feed.connecting' : 'feed.reconnecting')}
          </span>
        )}
      </div>
      {feed.length === 0 ? (
        <p className="mut px-4 py-5 text-[13px]">{t('feed.empty')}</p>
      ) : (
        <ol>
          {feed.map((f, i) => {
            const mine = viewerNo !== null && f.bidderNo === viewerNo;
            const who = mine ? t('feed.you') : (f.name ?? t('feed.bidder', { no: digits(f.bidderNo) }));
            return (
              <li
                key={f.key}
                className={`flex items-center justify-between gap-2.5 px-4 py-2.5 ${freshKeys.includes(f.key) ? 'flash' : ''}`}
                style={{ borderBottom: '1px solid color-mix(in srgb, var(--color-text) 7%, transparent)', background: i === 0 && !freshKeys.includes(f.key) ? 'var(--color-accent-100)' : undefined }}
              >
                <span className="av h-[26px] w-[26px] text-[12px]" aria-hidden>
                  {mine ? t('feed.you') : f.name ? f.name.slice(0, 2).toUpperCase() : `#${digits(f.bidderNo)}`}
                </span>
                <div className="flex-1">
                  <div className="text-[13px]" style={{ fontWeight: i === 0 ? 600 : 400 }}>
                    {who}
                  </div>
                  <div className="mut text-[12px]" suppressHydrationWarning>
                    {t(f.kind === 'auto' ? 'feed.autoBid' : 'feed.bid')} · {ago(f.at, now)}
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
          <span className="mut">{t(masked ? 'feed.liveNote' : 'feed.liveNotePublic', { bids: t('common.bids', { count: bidCount }) })}</span>
        ) : (
          <a href={resultHref}>{t('feed.fullLog', { bids: t('common.bids', { count: bidCount }) })}</a>
        )}
      </div>
    </section>
  );
}
