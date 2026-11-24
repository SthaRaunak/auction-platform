'use client';

import type { AuctionCard } from '@bidwell/contract';
import { Clock } from 'lucide-react';
import Link from 'next/link';
import { useI18n } from '@/i18n/client';
import { useCountdown } from './Countdown';

function TickerItem({ lot, hidden }: { lot: AuctionCard; hidden?: boolean }) {
  const { label, urgent } = useCountdown(lot.endsAt, lot.status);
  const { money, pick } = useI18n();
  return (
    <Link
      href={`/lots/${lot.id}`}
      tabIndex={hidden ? -1 : undefined}
      aria-hidden={hidden}
      className="flex flex-none items-center gap-[11px] border-r px-[22px] py-3.5 text-bg no-underline hover:text-bg"
      style={{ borderColor: 'color-mix(in srgb, var(--color-bg) 14%, transparent)' }}
    >
      <span className="num text-[16px]" style={{ color: urgent ? 'var(--color-accent-200)' : 'color-mix(in srgb, var(--color-bg) 62%, transparent)' }} suppressHydrationWarning>
        {label}
      </span>
      <span className="whitespace-nowrap text-[13.5px]">{pick(lot.title, lot.titleNe)}</span>
      <span className="num text-[15px] opacity-[.72]">{money(lot.price)}</span>
    </Link>
  );
}

/** Ending-soon marquee (design 1a): scrolls right→left, pauses on hover, stops for reduced motion. */
export function Marquee({ items }: { items: AuctionCard[] }) {
  const { t } = useI18n();
  if (!items.length) return null;
  return (
    <section aria-label={t('listing.endingSoon')} className="flex items-stretch overflow-hidden bg-accent-900 text-bg">
      <span className="flex flex-none items-center gap-2 border-r px-[18px] text-[10px] font-semibold uppercase tracking-[.13em]" style={{ borderColor: 'color-mix(in srgb, var(--color-bg) 22%, transparent)' }}>
        <Clock size={13} strokeWidth={1.5} aria-hidden />
        {t('listing.endingSoon')}
      </span>
      <div className="mq-mask mq-scroll min-w-0 flex-1 overflow-hidden">
        <div className="mq-track">
          {items.map((lot) => (
            <TickerItem key={lot.id} lot={lot} />
          ))}
          {items.map((lot) => (
            <TickerItem key={`${lot.id}-dup`} lot={lot} hidden />
          ))}
        </div>
      </div>
    </section>
  );
}
