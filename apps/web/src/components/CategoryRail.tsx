'use client';

import { CATEGORIES } from '@bidwell/contract';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRef } from 'react';
import { useI18n } from '@/i18n/client';
import { CategoryIcon } from './CategoryIcon';

export function CategoryRail({ selected, hrefFor }: { selected?: string; hrefFor: Record<string, string> }) {
  const rail = useRef<HTMLDivElement>(null);
  const i18n = useI18n();
  const scroll = (dx: number) => rail.current?.scrollBy({ left: dx, behavior: 'smooth' });
  return (
    <nav aria-label={i18n.t('listing.categories')} className="mt-5 flex overflow-hidden rounded-[13px] border border-neutral-300 bg-white">
      <button type="button" className="cat-arrow border-r border-divider" aria-label={i18n.t('listing.prevCategories')} onClick={() => scroll(-336)}>
        <ChevronLeft size={17} strokeWidth={1.6} aria-hidden />
      </button>
      <div className="cat-rail" ref={rail}>
        {CATEGORIES.map((c) => (
          <Link key={c.slug} href={hrefFor[c.slug]} className="cat-tile" data-on={selected === c.slug ? '' : undefined} aria-current={selected === c.slug ? 'page' : undefined} scroll={false}>
            <CategoryIcon slug={c.slug} />
            <span>{i18n.category(c.slug)}</span>
          </Link>
        ))}
      </div>
      <button type="button" className="cat-arrow border-l border-divider" aria-label={i18n.t('listing.moreCategories')} onClick={() => scroll(336)}>
        <ChevronRight size={17} strokeWidth={1.6} aria-hidden />
      </button>
    </nav>
  );
}
