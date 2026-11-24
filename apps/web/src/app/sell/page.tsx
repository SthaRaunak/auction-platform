import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuctionForm } from '@/components/AuctionForm';
import { getI18n } from '@/i18n/server';
import { getMe } from '@/lib/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('meta.sell') };
}

export default async function SellPage() {
  const me = await getMe();
  if (!me) redirect('/login?next=/sell');
  const { t, rich } = await getI18n();
  return (
    <div className="mx-auto max-w-[860px] px-6 py-8">
      <h1 className="ttl text-[34px]">{t('sell.title')}</h1>
      <p className="mut mt-2 max-w-[62ch] text-[14px]">{rich('sell.lead', { link: (s) => <Link href="/how-bidding-works">{s}</Link> })}</p>
      <div className="mt-6">{me.emailVerified ? <AuctionForm /> : <p className="banner banner-warn">{t('sell.verifyFirst', { email: me.email })}</p>}</div>
    </div>
  );
}
