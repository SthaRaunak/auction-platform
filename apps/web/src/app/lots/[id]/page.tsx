import type { AuctionCard, AuctionDetail, Comment } from '@bidwell/contract';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LotView } from '@/components/lot/LotView';
import { apiGet, getMe } from '@/lib/server';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return {};
  const detail = await apiGet<AuctionDetail>(`/auctions/${id}`, { allow404: true }).catch(() => null);
  return detail ? { title: `${detail.title} · Lot #${detail.lotNo}` } : {};
}

export default async function LotPage({ params }: { params: Params }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [detail, similar, comments, me] = await Promise.all([
    apiGet<AuctionDetail>(`/auctions/${id}`),
    apiGet<{ items: AuctionCard[] }>(`/auctions/${id}/similar`),
    apiGet<{ items: Comment[] }>(`/auctions/${id}/comments`),
    getMe(),
  ]);
  return <LotView detail={detail} similar={similar.items} comments={comments.items} me={me} />;
}
