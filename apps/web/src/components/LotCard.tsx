'use client';

import type { AuctionCard } from '@bidwell/contract';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/client';
import type { I18n } from '@/i18n/translator';
import { Avatar } from './Avatar';
import { CountdownChip } from './Countdown';
import { Photo } from './Photo';
import { WatchStar } from './WatchButton';

export function shipLabel(i18n: I18n, lot: Pick<AuctionCard, 'delivery' | 'shippingCost'>) {
  if (lot.delivery === 'paid_shipping' && lot.shippingCost) return i18n.t('card.deliveryCost', { amount: i18n.money(lot.shippingCost) });
  return i18n.delivery(lot.delivery);
}

export function bidLabel(i18n: I18n, lot: Pick<AuctionCard, 'bidCount' | 'viewerIsLeader' | 'status'>) {
  if (lot.status !== 'live') return i18n.t(lot.bidCount ? 'card.finalBid' : 'card.noBids');
  if (lot.viewerIsLeader) return i18n.t('card.yourBidOnTop');
  return i18n.t(lot.bidCount ? 'card.currentBid' : 'card.startingBid');
}

/** True for a moment after the value changes (a live price move) — drives the accent-100 flash. */
export function useFlash(value: unknown) {
  const [flash, setFlash] = useState(false);
  const previous = useRef(value);
  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1200);
    return () => clearTimeout(t);
  }, [value]);
  return flash;
}

export function LotCard({ lot, signedIn }: { lot: AuctionCard; signedIn: boolean }) {
  const flash = useFlash(lot.price);
  const i18n = useI18n();
  const { t, money } = i18n;
  const title = i18n.pick(lot.title, lot.titleNe);
  const href = `/lots/${lot.id}`;
  return (
    <article className={`card group !gap-0 !p-0 ${flash ? 'flash' : ''}`}>
      <div className="relative">
        {/* The photo eases in slightly on hover or keyboard focus; the overlays stay put. Skipped for reduced motion. */}
        <Link href={href} tabIndex={-1} aria-hidden className="block overflow-hidden">
          <Photo
            src={lot.image}
            alt={title}
            label={t('card.photoLabel', { lotNo: i18n.digits(lot.lotNo) })}
            className="transition-transform duration-500 ease-out motion-safe:group-hover:scale-105 motion-safe:group-focus-within:scale-105"
          />
        </Link>
        <WatchStar auctionId={lot.id} watched={lot.watched} signedIn={signedIn} title={title} />
        <CountdownChip endsAt={lot.endsAt} status={lot.status} />
        <span className="absolute bottom-2.5 left-2.5 rounded-full border border-neutral-300 bg-white px-2.5 py-1 text-[12px]">{i18n.category(lot.category)}</span>
      </div>
      <div className="flex flex-1 flex-col gap-[9px] px-[15px] pb-[15px] pt-3.5">
        <h3 className="ttl text-[18px]">
          <Link href={href} className="text-ink no-underline hover:text-accent-800">
            {title}
          </Link>
        </h3>
        <div className="mut text-[12.5px] leading-[1.45]">{[i18n.condition(lot.condition), lot.brand, lot.location].filter(Boolean).join(' · ')}</div>
        <div className="row !gap-2">
          <Avatar initials={lot.seller.initials} />
          <Link href={`/users/${lot.seller.id}`} className="min-w-0 truncate text-[12px] text-ink no-underline hover:text-accent-800" title={lot.seller.displayName}>
            {lot.seller.displayName}
          </Link>
          <span className="mut flex-none whitespace-nowrap text-[12px]">{lot.seller.rating ? `★ ${i18n.num(lot.seller.rating, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}` : t('card.unrated')}</span>
        </div>
        <div className="mt-auto flex items-end justify-between gap-3 border-t border-divider pt-[11px]">
          <div aria-live="polite">
            <div className="mut mb-[5px] text-[12px]">{bidLabel(i18n, lot)}</div>
            <div className="num text-[26px]">{money(lot.price)}</div>
            <div className="mut mt-[5px] text-[12px]">
              {t('common.bids', { count: lot.bidCount })} · {shipLabel(i18n, lot)}
            </div>
          </div>
          <Link href={href} className="btn btn-primary flex-none !px-[18px] !py-2.5">
            {t('card.bidNow')}
          </Link>
        </div>
      </div>
    </article>
  );
}
