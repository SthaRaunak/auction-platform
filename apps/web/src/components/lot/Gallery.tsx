'use client';

import type { ImageCredit } from '@bidwell/contract';
import { useState } from 'react';
import { useI18n } from '@/i18n/client';
import { Photo } from '../Photo';

/** Main image + filmstrip (design 1c). Thumbnails switch the main view. */
export function Gallery({ images, credits, title, lotNo }: { images: string[]; credits: Record<string, ImageCredit>; title: string; lotNo: number }) {
  const { t, rich, num, digits } = useI18n();
  const [active, setActive] = useState(0);
  const count = images.length;
  const credit = credits[images[active]];
  return (
    <div>
      <div className="card !p-0">
        <Photo src={images[active]} alt={t('gallery.photoAlt', { title, n: active + 1 })} label={count ? t('gallery.mainView', { n: active + 1 }) : t('gallery.noPhotosLabel', { lotNo: digits(lotNo) })} />
      </div>
      <div className="mt-[11px] flex items-center justify-between">
        <span className="mut text-[12px]">
          {count ? t('gallery.photoOf', { n: active + 1, count }) : t('gallery.noPhotos')}
          {credit && (
            <>
              {' · '}
              {rich(
                'gallery.credit',
                {
                  author: (s) => (
                    <a href={credit.authorUrl} target="_blank" rel="noreferrer">
                      {s}
                    </a>
                  ),
                  source: (s) => (
                    <a href={credit.sourceUrl} target="_blank" rel="noreferrer">
                      {s}
                    </a>
                  ),
                },
                { author: credit.author, source: credit.source },
              )}
            </>
          )}
        </span>
        {count > 0 && (
          <a href={images[active]} target="_blank" rel="noreferrer" className="text-[12px]">
            {t('gallery.fullScreen')}
          </a>
        )}
      </div>
      {count > 1 && (
        <div className="mt-[11px] grid grid-cols-5 gap-2.5" role="group" aria-label={t('gallery.photos')}>
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setActive(i)}
              aria-label={t('gallery.show', { n: i + 1 })}
              aria-pressed={i === active}
              className="cursor-pointer overflow-hidden rounded-[11px] bg-transparent p-0"
              style={{ border: `1.5px solid ${i === active ? 'var(--color-accent)' : 'var(--color-neutral-300)'}`, opacity: i === active ? 1 : 0.7 }}
            >
              <Photo src={src} alt="" label={num(i + 1)} ratio="1 / 1" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
