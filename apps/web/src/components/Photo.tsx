'use client';

import { useI18n } from '@/i18n/client';

/** A lot photo, or the design's diagonal-cross placeholder when the seller uploaded none. */
export function Photo({ src, alt, label, ratio = '4 / 3', className = '' }: { src: string | null | undefined; alt: string; label: string; ratio?: string; className?: string }) {
  const { t } = useI18n();
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- uploads are served by the API; no optimiser in the loop
    return <img src={src} alt={alt} className={`block w-full object-cover ${className}`} style={{ aspectRatio: ratio }} />;
  }
  return (
    <div className={`ph ${className}`} style={{ aspectRatio: ratio }} role="img" aria-label={t('card.noPhoto', { alt })}>
      <span>{label}</span>
    </div>
  );
}
