'use client';

import { CATEGORIES, CONDITIONS, ENDING_WINDOWS, SORTS, parseMajorInput, toMajor, type AuctionList, type BrandFacet, type MarketStats } from '@bidwell/contract';
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { CategoryRail } from './CategoryRail';
import { LotCard } from './LotCard';

type Params = Record<string, string>;

const PAGE_SIZE = 12;
const POLL_MS = 5000;
const DELIVERY_FILTERS = ['free_shipping', 'local_pickup'];

const csv = (v?: string) => (v ? v.split(',').filter(Boolean) : []);

function buildHref(params: Params, patch: Record<string, string | undefined>, keepPage = false) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...patch })) {
    if (!keepPage && (k === 'cursor' || k === 'page') && !(k in patch)) continue;
    if (v) q.set(k, v);
  }
  const s = q.toString();
  return s ? `/?${s}` : '/';
}

export function ListingView({ params, initial, brands, stats: initialStats, signedIn }: { params: Params; initial: AuctionList; brands: BrandFacet[]; stats: MarketStats; signedIn: boolean }) {
  const router = useRouter();
  const i18n = useI18n();
  const { t, money, num } = i18n;
  const [list, setList] = useState(initial);
  const [stats, setStats] = useState(initialStats);
  const [allBrands, setAllBrands] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [minPrice, setMinPrice] = useState(params.minPrice ? String(toMajor(Number(params.minPrice))) : '');
  const [maxPrice, setMaxPrice] = useState(params.maxPrice ? String(toMajor(Number(params.maxPrice))) : '');

  // B3: the list polls; only the detail page gets a push channel. Countdowns tick locally off one clock.
  useEffect(() => {
    const qs = new URLSearchParams(params);
    qs.delete('page');
    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const [l, s] = await Promise.all([
          fetch(`/api/auctions?${qs}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
          fetch('/api/auctions/stats', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
        ]);
        if (l) setList(l);
        if (s) setStats(s);
      } catch {
        /* next tick */
      }
    };
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [params]);

  const go = (patch: Record<string, string | undefined>) => router.push(buildHref(params, patch), { scroll: false });
  const toggleIn = (key: string, value: string) => {
    const cur = csv(params[key]);
    go({ [key]: (cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]).join(',') || undefined });
  };

  const chips: { label: string; href: string }[] = [];
  if (params.q) chips.push({ label: `“${params.q}”`, href: buildHref(params, { q: undefined }) });
  if (params.category) chips.push({ label: i18n.category(params.category), href: buildHref(params, { category: undefined, brand: undefined }) });
  for (const b of csv(params.brand)) chips.push({ label: b, href: buildHref(params, { brand: csv(params.brand).filter((x) => x !== b).join(',') || undefined }) });
  for (const c of csv(params.condition)) chips.push({ label: i18n.condition(c), href: buildHref(params, { condition: csv(params.condition).filter((x) => x !== c).join(',') || undefined }) });
  for (const d of csv(params.delivery)) chips.push({ label: i18n.delivery(d), href: buildHref(params, { delivery: csv(params.delivery).filter((x) => x !== d).join(',') || undefined }) });
  if (params.ending) chips.push({ label: t('listing.endingChip', { window: i18n.ending(params.ending).toLowerCase() }), href: buildHref(params, { ending: undefined }) });
  if (params.minPrice || params.maxPrice) {
    const lo = money(Number(params.minPrice ?? 0));
    const hi = params.maxPrice ? money(Number(params.maxPrice)) : t('listing.anyPrice');
    chips.push({ label: `${lo} – ${hi}`, href: buildHref(params, { minPrice: undefined, maxPrice: undefined }) });
  }
  if (params.minRating) chips.push({ label: t('listing.sellerRatingChip', { rating: i18n.digits(params.minRating) }), href: buildHref(params, { minRating: undefined }) });

  const categoryHrefs = Object.fromEntries(CATEGORIES.map((c) => [c.slug, buildHref(params, { category: params.category === c.slug ? undefined : c.slug, brand: undefined })]));
  const page = Number(params.page ?? 1);
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const shownBrands = allBrands ? brands : brands.slice(0, 4);
  const title = params.q ? t('listing.resultsFor', { q: params.q }) : params.category ? i18n.category(params.category) : t('listing.allAuctions');

  const applyPrice = () => {
    const lo = parseMajorInput(minPrice);
    const hi = parseMajorInput(maxPrice);
    go({ minPrice: lo === null ? undefined : String(lo), maxPrice: hi === null ? undefined : String(hi) });
  };

  return (
    <>
      <div className="mx-auto max-w-[1240px] px-6 pt-[22px]">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <nav aria-label="Breadcrumb" className="row !gap-[7px] text-[12px]" style={{ color: 'color-mix(in srgb, var(--color-text) 55%, transparent)' }}>
              <Link href="/" className="text-inherit" style={{ color: 'inherit' }}>
                {t('common.home')}
              </Link>
              <span aria-hidden>/</span>
              <span>{params.category ? i18n.category(params.category) : t('listing.allAuctions')}</span>
            </nav>
            <h1 className="ttl mt-[7px] text-[34px] tracking-[-0.015em] sm:text-[44px]">{title}</h1>
          </div>
          <dl className="row !items-end !gap-[18px]">
            <Stat label={t('listing.openLots')} value={num(stats.openLots)} />
            <span className="h-[34px] w-px bg-divider" aria-hidden />
            <Stat label={t('listing.endingHour')} value={num(stats.endingWithinHour)} accent />
            <span className="h-[34px] w-px bg-divider" aria-hidden />
            <Stat label={t('listing.bidsPerMin')} value={num(stats.bidsPerMinute)} />
          </dl>
        </div>

        <CategoryRail selected={params.category} hrefFor={categoryHrefs} />

        {chips.length > 0 && (
          <div className="mt-[18px] flex flex-wrap items-center gap-[9px]">
            <span className="mut text-[12px]">{t('listing.filtersOn', { count: chips.length })}</span>
            {chips.map((c) => (
              <Link key={c.label} href={c.href} scroll={false} className="pill on" aria-label={t('listing.removeFilter', { label: c.label })}>
                {c.label}
                <X size={12} strokeWidth={2} aria-hidden />
              </Link>
            ))}
            <Link href="/" className="text-[12px]">
              {t('listing.clearAll')}
            </Link>
          </div>
        )}
      </div>

      <div className="mx-auto mt-5 grid max-w-[1240px] border-t border-divider lg:grid-cols-[258px_1fr]">
        <aside className="border-divider px-5 pb-6 pt-5 lg:border-r lg:pb-10" aria-label={t('listing.filters')}>
          <button type="button" className="btn btn-secondary btn-pill lg:!hidden" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((o) => !o)}>
            <SlidersHorizontal size={15} strokeWidth={1.5} aria-hidden /> {t('listing.filters')}
            {chips.length ? ` · ${num(chips.length)}` : ''}
          </button>
          <div className={`${filtersOpen ? 'block' : 'hidden'} mt-4 lg:mt-0 lg:block`}>
            <div className="mb-3.5 flex items-baseline justify-between">
              <span className="k">{t('listing.filtersHeading', { count: chips.length })}</span>
              <Link href={params.category ? `/?category=${params.category}` : '/'} className="text-[12px]">
                {t('listing.clear')}
              </Link>
            </div>

            <fieldset>
              <legend className="mb-[7px] text-[12px] font-medium uppercase tracking-[.09em] text-accent-700">{t('listing.brand')}</legend>
              {brands.length === 0 && <p className="mut text-[12.5px]">{t('listing.noBrands')}</p>}
              {shownBrands.map((b) => (
                <label key={b.brand} className="chk">
                  <input type="checkbox" checked={csv(params.brand).includes(b.brand)} onChange={() => toggleIn('brand', b.brand)} />
                  <i />
                  <span className="flex-1">{b.brand}</span>
                  <span className="mut text-[12px]">{num(b.count)}</span>
                </label>
              ))}
              {brands.length > 4 && (
                <button type="button" className="mt-1.5 inline-block cursor-pointer border-0 bg-transparent p-0 text-[12px] text-accent-700 underline underline-offset-[3px]" onClick={() => setAllBrands((v) => !v)}>
                  {allBrands ? t('listing.showFewer') : t('listing.showMore', { count: brands.length - 4 })}
                </button>
              )}
            </fieldset>
            <hr className="hr" />
            <CheckGroup legend={t('listing.condition')} options={CONDITIONS.map((c) => ({ value: c.value, label: i18n.condition(c.value) }))} selected={csv(params.condition)} onToggle={(v) => toggleIn('condition', v)} />
            <hr className="hr" />
            <CheckGroup legend={t('listing.delivery')} options={DELIVERY_FILTERS.map((d) => ({ value: d, label: i18n.delivery(d) }))} selected={csv(params.delivery)} onToggle={(v) => toggleIn('delivery', v)} />
            <hr className="hr" />
            <CheckGroup legend={t('listing.ending')} options={ENDING_WINDOWS.map((e) => ({ value: e.value, label: i18n.ending(e.value) }))} selected={params.ending ? [params.ending] : []} onToggle={(v) => go({ ending: params.ending === v ? undefined : v })} />
            <hr className="hr" />
            <fieldset>
              <legend className="mb-[9px] text-[12px] font-medium uppercase tracking-[.09em] text-accent-700">{t('listing.priceRange')}</legend>
              <div className="row !gap-2">
                <input className="input" inputMode="numeric" placeholder={t('listing.min')} aria-label={t('listing.minAria')} value={minPrice} onChange={(e) => setMinPrice(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyPrice()} />
                <span className="mut" aria-hidden>
                  —
                </span>
                <input className="input" inputMode="numeric" placeholder={t('listing.max')} aria-label={t('listing.maxAria')} value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyPrice()} />
              </div>
            </fieldset>
            <hr className="hr" />
            <fieldset>
              <legend className="mb-[9px] text-[12px] font-medium uppercase tracking-[.09em] text-accent-700">{t('listing.sellerRating')}</legend>
              <span className="seg w-full">
                {[
                  { v: '', l: t('listing.any') },
                  { v: '4', l: `${i18n.digits('4.0')}+` },
                  { v: '4.5', l: `${i18n.digits('4.5')}+` },
                ].map((o) => (
                  <label key={o.l} className="seg-opt flex-1">
                    <input type="radio" name="rating" checked={(params.minRating ?? '') === o.v} onChange={() => go({ minRating: o.v || undefined })} />
                    <span>{o.l}</span>
                  </label>
                ))}
              </span>
            </fieldset>
            <button type="button" className="btn btn-primary btn-block mt-[18px]" onClick={applyPrice}>
              {t('listing.showResults')}
            </button>
          </div>
        </aside>

        <section className="px-6 pb-[34px] pt-[18px]" aria-label={t('listing.lotsLabel')}>
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-divider pb-3.5">
            <span className="text-[13px]" aria-live="polite">
              <strong>{t('common.lots', { count: list.total })}</strong> <span className="mut">· {t('listing.endingNextHour', { count: list.endingWithinHour })}</span>
            </span>
            <span className="row !gap-2">
              <label htmlFor="sort" className="mut text-[12.5px]">
                {t('listing.sortBy')}
              </label>
              <span className="relative inline-flex items-center">
                <select
                  id="sort"
                  value={params.sort ?? 'ending_soonest'}
                  onChange={(e) => go({ sort: e.target.value === 'ending_soonest' ? undefined : e.target.value })}
                  className="cursor-pointer appearance-none rounded-[9px] border border-neutral-300 bg-white py-[9px] pl-3 pr-8 text-[13px] font-medium leading-none text-ink"
                >
                  {SORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {i18n.sort(s.value)}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} strokeWidth={1.6} className="pointer-events-none absolute right-2.5 opacity-60" aria-hidden />
              </span>
            </span>
          </div>

          {list.items.length === 0 ? (
            <div className="mut py-16 text-center text-[14px]">
              {t('listing.empty')} <Link href="/">{t('listing.clearFilters')}</Link>
            </div>
          ) : (
            <div className="mt-[26px] grid gap-[26px] sm:grid-cols-2 xl:grid-cols-3">
              {list.items.map((lot) => (
                <LotCard key={lot.id} lot={lot} signedIn={signedIn} />
              ))}
            </div>
          )}

          {(page > 1 || list.nextCursor) && (
            <nav aria-label={t('listing.pagination')} className="row mt-[30px] !justify-center !gap-2">
              <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => router.back()}>
                {t('listing.previous')}
              </button>
              <span className="btn btn-primary min-w-[38px]" aria-current="page">
                {num(page)}
              </span>
              <span className="mut px-1.5 text-[12.5px]">{t('listing.ofPages', { count: pages })}</span>
              {list.nextCursor ? (
                <Link className="btn btn-secondary" href={buildHref(params, { cursor: list.nextCursor, page: String(page + 1) }, true)}>
                  {t('listing.next')}
                </Link>
              ) : (
                <button type="button" className="btn btn-secondary" disabled>
                  {t('listing.next')}
                </button>
              )}
            </nav>
          )}
        </section>
      </div>
    </>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <dt className="mut text-[12px]">{label}</dt>
      <dd className="num text-[22px]" style={accent ? { color: 'var(--color-accent-800)' } : undefined}>
        {value}
      </dd>
    </div>
  );
}

function CheckGroup({ legend, options, selected, onToggle }: { legend: string; options: readonly { value: string; label: string }[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <fieldset>
      <legend className="mb-[7px] text-[12px] font-medium uppercase tracking-[.09em] text-accent-700">{legend}</legend>
      {options.map((o) => (
        <label key={o.value} className="chk">
          <input type="checkbox" checked={selected.includes(o.value)} onChange={() => onToggle(o.value)} />
          <i />
          <span className="flex-1">{o.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
