'use client';

import { Star } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client';

export function useWatch(auctionId: string, initial: boolean, signedIn: boolean) {
  const router = useRouter();
  const [watched, setWatched] = useState(initial);
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    if (!signedIn) return router.push(`/login?next=${encodeURIComponent(`/lots/${auctionId}`)}`);
    const next = !watched;
    setWatched(next);
    setBusy(true);
    try {
      await api(next ? 'PUT' : 'DELETE', `/auctions/${auctionId}/watch`);
      router.refresh();
    } catch {
      setWatched(!next);
    } finally {
      setBusy(false);
    }
  };
  return { watched, busy, toggle };
}

/** Round star on the card photo (design 1a): toggles the watchlist. */
export function WatchStar({ auctionId, watched: initial, signedIn, title }: { auctionId: string; watched: boolean; signedIn: boolean; title: string }) {
  const { watched, busy, toggle } = useWatch(auctionId, initial, signedIn);
  return (
    <button
      type="button"
      className="btn btn-icon absolute right-2.5 top-2.5 !h-8 !w-8 !border-neutral-300 !bg-white"
      onClick={toggle}
      disabled={busy}
      aria-pressed={watched}
      aria-label={watched ? `Remove ${title} from watchlist` : `Watch ${title}`}
    >
      <Star size={15} strokeWidth={1.5} fill={watched ? 'var(--color-accent)' : 'none'} color={watched ? 'var(--color-accent)' : 'currentColor'} aria-hidden />
    </button>
  );
}
