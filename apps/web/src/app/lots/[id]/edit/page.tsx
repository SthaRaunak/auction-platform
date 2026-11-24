import type { AuctionDetail } from '@bidwell/contract';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AuctionForm } from '@/components/AuctionForm';
import { getI18n } from '@/i18n/server';
import { apiGet, getMe } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('meta.edit') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const me = await getMe();
  if (!me) redirect(`/login?next=/lots/${id}/edit`);
  const detail = await apiGet<AuctionDetail>(`/auctions/${id}`);
  if (!detail.viewer.isSeller) notFound();
  const { t, digits } = await getI18n();
  return (
    <div className="mx-auto max-w-[860px] px-6 py-8">
      <Link href={`/lots/${id}`} className="text-[12.5px]">
        {t('common.backToLot')}
      </Link>
      <h1 className="ttl mt-3 text-[34px]">{t('sell.editTitle')}</h1>
      <p className="mut mb-6 mt-2 text-[14px]">{t('sell.editLead', { lotNo: digits(detail.lotNo) })}</p>
      {detail.status === 'live' ? <AuctionForm existing={detail} /> : <p className="banner banner-neutral">{t('sell.ended')}</p>}
    </div>
  );
}
