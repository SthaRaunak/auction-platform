import type { AuctionCard, AuctionList, BrandFacet, MarketStats } from '@bidwell/contract';
import { ListingView } from '@/components/ListingView';
import { Marquee } from '@/components/Marquee';
import { apiGet, getMe, toQuery } from '@/lib/server';

// Prices move every second; nothing here may come from a cache (B6).
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ListingPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const params = Object.fromEntries(toQuery(sp).entries());
  const qs = toQuery(sp, ['page']).toString();
  const facetQs = toQuery(sp, ['page', 'cursor', 'sort']).toString();

  const [list, facets, stats, ticker, me] = await Promise.all([
    apiGet<AuctionList>(`/auctions?${qs}`),
    apiGet<{ brands: BrandFacet[] }>(`/auctions/facets?${facetQs}`),
    apiGet<MarketStats>('/auctions/stats'),
    apiGet<{ items: AuctionCard[] }>('/auctions/ending-soon?limit=12'),
    getMe(),
  ]);

  return (
    <>
      <Marquee items={ticker.items} />
      <ListingView key={qs} params={params} initial={list} brands={facets.brands} stats={stats} signedIn={Boolean(me)} />
    </>
  );
}
