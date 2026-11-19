import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuctionForm } from '@/components/AuctionForm';
import { getMe } from '@/lib/server';

export const metadata: Metadata = { title: 'Sell an item' };

export default async function SellPage() {
  const me = await getMe();
  if (!me) redirect('/login?next=/sell');
  return (
    <div className="mx-auto max-w-[860px] px-6 py-8">
      <h1 className="ttl text-[34px]">Sell an item</h1>
      <p className="mut mt-2 max-w-[62ch] text-[14px]">
        Set a fair starting price and let bidders do the rest. Once the first bid lands the key details lock, so get them right now. <Link href="/how-bidding-works">How bidding works</Link>
      </p>
      <div className="mt-6">
        {me.emailVerified ? (
          <AuctionForm />
        ) : (
          <p className="banner banner-warn">Confirm your email address before listing — use the link we sent to {me.email}.</p>
        )}
      </div>
    </div>
  );
}
