'use client';

import { categoryLabel, conditionLabel, deliveryLabel, type AuctionCard } from '@bidwell/contract';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { money } from '@/lib/format';
import { Avatar } from './Avatar';
import { CountdownChip } from './Countdown';
import { Photo } from './Photo';
import { WatchStar } from './WatchButton';

export function shipLabel(lot: Pick<AuctionCard, 'delivery' | 'shippingCost'>) {
  if (lot.delivery === 'paid_shipping' && lot.shippingCost) return `Delivery ${money(lot.shippingCost)}`;
  return deliveryLabel(lot.delivery);
}

export function bidLabel(lot: Pick<AuctionCard, 'bidCount' | 'viewerIsLeader' | 'status'>) {
  if (lot.status !== 'live') return lot.bidCount ? 'Final bid' : 'No bids';
  if (lot.viewerIsLeader) return 'Your bid is on top';
  return lot.bidCount ? 'Current bid' : 'Starting bid';
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
  const href = `/lots/${lot.id}`;
  return (
    <article className={`card !gap-0 !p-0 ${flash ? 'flash' : ''}`}>
      <div className="relative">
        <Link href={href} tabIndex={-1} aria-hidden>
          <Photo src={lot.image} alt={lot.title} label={`Photo · #${lot.lotNo}`} />
        </Link>
        <WatchStar auctionId={lot.id} watched={lot.watched} signedIn={signedIn} title={lot.title} />
        <CountdownChip endsAt={lot.endsAt} status={lot.status} />
        <span className="absolute bottom-2.5 left-2.5 rounded-full border border-neutral-300 bg-white px-2.5 py-1 text-[11px]">{categoryLabel(lot.category)}</span>
      </div>
      <div className="flex flex-1 flex-col gap-[9px] px-[15px] pb-[15px] pt-3.5">
        <h3 className="ttl text-[18px]">
          <Link href={href} className="text-ink no-underline hover:text-accent-800">
            {lot.title}
          </Link>
        </h3>
        <div className="mut text-[12.5px] leading-[1.45]">{[conditionLabel(lot.condition), lot.brand, lot.location].filter(Boolean).join(' · ')}</div>
        <div className="row !gap-2">
          <Avatar initials={lot.seller.initials} />
          <Link href={`/users/${lot.seller.id}`} className="min-w-0 truncate text-[12px] text-ink no-underline hover:text-accent-800" title={lot.seller.displayName}>
            {lot.seller.displayName}
          </Link>
          <span className="mut flex-none whitespace-nowrap text-[12px]">{lot.seller.rating ? `★ ${lot.seller.rating.toFixed(1)}` : 'Unrated'}</span>
        </div>
        <div className="mt-auto flex items-end justify-between gap-3 border-t border-divider pt-[11px]">
          <div aria-live="polite">
            <div className="mut mb-[5px] text-[11px]">{bidLabel(lot)}</div>
            <div className="num text-[26px]">{money(lot.price)}</div>
            <div className="mut mt-[5px] text-[11.5px]">
              {lot.bidCount} {lot.bidCount === 1 ? 'bid' : 'bids'} · {shipLabel(lot)}
            </div>
          </div>
          <Link href={href} className="btn btn-primary flex-none !px-[18px] !py-2.5">
            Bid now
          </Link>
        </div>
      </div>
    </article>
  );
}
