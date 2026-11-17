'use client';

import type { ImageCredit } from '@bidwell/contract';
import { useState } from 'react';
import { Photo } from '../Photo';

/** Main image + filmstrip (design 1c). Thumbnails switch the main view. */
export function Gallery({ images, credits, title, lotNo }: { images: string[]; credits: Record<string, ImageCredit>; title: string; lotNo: number }) {
  const [active, setActive] = useState(0);
  const count = images.length;
  const credit = credits[images[active]];
  return (
    <div>
      <div className="card !p-0">
        <Photo src={images[active]} alt={`${title} — photo ${active + 1}`} label={count ? `Photo ${active + 1} · main view` : `Lot #${lotNo} · no photos yet`} />
      </div>
      <div className="mt-[11px] flex items-center justify-between">
        <span className="mut text-[11.5px]">
          {count ? `Photo ${active + 1} of ${count}` : 'The seller hasn’t added photos'}
          {credit && (
            <>
              {' '}
              · Illustrative stock photo by{' '}
              <a href={credit.authorUrl} target="_blank" rel="noreferrer">
                {credit.author}
              </a>{' '}
              on{' '}
              <a href={credit.sourceUrl} target="_blank" rel="noreferrer">
                {credit.source}
              </a>
            </>
          )}
        </span>
        {count > 0 && (
          <a href={images[active]} target="_blank" rel="noreferrer" className="text-[11.5px]">
            Open full screen
          </a>
        )}
      </div>
      {count > 1 && (
        <div className="mt-[11px] grid grid-cols-5 gap-2.5" role="group" aria-label="Photos">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Show photo ${i + 1}`}
              aria-pressed={i === active}
              className="cursor-pointer overflow-hidden rounded-[11px] bg-transparent p-0"
              style={{ border: `1.5px solid ${i === active ? 'var(--color-accent)' : 'var(--color-neutral-300)'}`, opacity: i === active ? 1 : 0.7 }}
            >
              <Photo src={src} alt="" label={String(i + 1)} ratio="1 / 1" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
