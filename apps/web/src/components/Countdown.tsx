'use client';

import type { AuctionStatus } from '@bidwell/contract';
import { Clock } from 'lucide-react';
import { countdown, isUrgent, secondsUntil } from '@/lib/format';
import { useNow } from './Clock';

export function useCountdown(endsAt: string, status: AuctionStatus = 'live') {
  const now = useNow();
  const left = secondsUntil(endsAt, now);
  const ended = status !== 'live';
  return {
    left,
    urgent: !ended && isUrgent(left),
    label: status === 'voided' ? 'Voided' : ended ? 'Ended' : left <= 0 ? 'Closing…' : countdown(left),
  };
}

/** Photo-overlay chip: white normally, accent-900 under the urgency threshold. */
export function CountdownChip({ endsAt, status }: { endsAt: string; status: AuctionStatus }) {
  const { urgent, label } = useCountdown(endsAt, status);
  return (
    <span
      className="row absolute left-2.5 top-2.5 !gap-1.5 rounded-full border px-[11px] py-[5px] text-[12px] tabular-nums"
      style={
        urgent
          ? { background: 'var(--color-accent-900)', borderColor: 'var(--color-accent-900)', color: 'var(--color-bg)' }
          : { background: '#fff', borderColor: 'var(--color-neutral-300)', color: 'color-mix(in srgb, var(--color-text) 70%, transparent)' }
      }
    >
      <Clock size={13} strokeWidth={1.5} aria-hidden />
      <span suppressHydrationWarning>{label}</span>
      {urgent && <span className="sr-only">(ending soon)</span>}
    </span>
  );
}

export function CountdownText({ endsAt, status, className = '', style }: { endsAt: string; status: AuctionStatus; className?: string; style?: React.CSSProperties }) {
  const { label, urgent } = useCountdown(endsAt, status);
  return (
    <span className={className} style={{ ...style, color: urgent ? 'var(--color-accent-800)' : style?.color }} suppressHydrationWarning>
      {label}
    </span>
  );
}
