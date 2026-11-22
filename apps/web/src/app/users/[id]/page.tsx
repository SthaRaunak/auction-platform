import type { AuctionCard, RatingSummary, Review, UserProfile } from '@bidwell/contract';
import { ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Avatar } from '@/components/Avatar';
import { LotCard } from '@/components/LotCard';
import { Stars } from '@/components/Stars';
import { apiGet, getMe } from '@/lib/server';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Params = Promise<{ id: string }>;

const TABS = [
  { id: 'live', label: 'Live lots' },
  { id: 'ended', label: 'Past lots' },
  { id: 'reviews', label: 'Reviews' },
] as const;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return {};
  const p = await apiGet<UserProfile>(`/users/${id}`, { allow404: true }).catch(() => null);
  return p ? { title: p.displayName } : {};
}

export default async function ProfilePage({ params, searchParams }: { params: Params; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const requested = (await searchParams).tab;
  const tab = TABS.find((t) => t.id === requested)?.id ?? 'live';
  const [profile, me] = await Promise.all([apiGet<UserProfile>(`/users/${id}`), getMe()]);
  const reviewCount = profile.asSeller.count + profile.asBuyer.count;

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-8">
      <section className="card !flex-row !flex-wrap !items-center !gap-5 !p-6">
        <Avatar initials={profile.initials} size={64} />
        <div className="min-w-0 flex-1">
          <div className="k mb-1.5">Public profile</div>
          <h1 className="ttl text-[30px]">{profile.displayName}</h1>
          <p className="mut mt-1.5 flex flex-wrap items-center gap-2 text-[13px]">
            Member since {new Date(profile.memberSince).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
            {profile.isStaff && (
              <span className="tag tag-accent">
                <ShieldCheck size={12} aria-hidden /> Bidwell moderator
              </span>
            )}
            {me?.id === profile.id && (
              <Link href="/account" className="text-[13px]">
                This is you — manage your account
              </Link>
            )}
          </p>
        </div>
        <dl className="flex flex-wrap items-end gap-x-[18px] gap-y-3">
          <RatingStat label="As a seller" r={profile.asSeller} />
          <span className="h-[34px] w-px bg-divider" aria-hidden />
          <RatingStat label="As a buyer" r={profile.asBuyer} />
          <span className="h-[34px] w-px bg-divider" aria-hidden />
          <Count label="Lots listed" n={profile.lotsListed} />
          <span className="h-[34px] w-px bg-divider" aria-hidden />
          <Count label="Sold" n={profile.lotsSold} />
          <span className="h-[34px] w-px bg-divider" aria-hidden />
          <Count label="Won" n={profile.lotsWon} />
        </dl>
      </section>

      <div className="mt-6 flex flex-wrap gap-1.5 border-b border-divider" role="tablist">
        {TABS.map((t) => (
          <Link key={t.id} href={`/users/${id}?tab=${t.id}`} role="tab" aria-selected={tab === t.id} className="tab" scroll={false}>
            {t.label}
            {t.id === 'reviews' ? ` (${reviewCount})` : ''}
          </Link>
        ))}
      </div>

      <div className="pt-6">
        {tab === 'reviews' ? <Reviews userId={id} /> : <Listings userId={id} which={tab} signedIn={Boolean(me)} />}
      </div>
      <p className="mut mt-10 text-[12px]">
        Profiles show what a person has put up for auction and the reviews they’ve received. What anyone is bidding on stays private while auctions run; full bid logs are published on each lot after it ends.
      </p>
    </div>
  );
}

function RatingStat({ label, r }: { label: string; r: RatingSummary }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <dt className="mut text-[11px]">{label}</dt>
      <dd className="flex items-center gap-2">
        {r.average !== null ? (
          <>
            <Stars value={r.average} />
            <span className="num text-[22px]">{r.average.toFixed(1)}</span>
            <span className="mut text-[11.5px]">({r.count})</span>
          </>
        ) : (
          <span className="mut text-[13px]">No reviews yet</span>
        )}
      </dd>
    </div>
  );
}

function Count({ label, n }: { label: string; n: number }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <dt className="mut text-[11px]">{label}</dt>
      <dd className="num text-[22px]">{n}</dd>
    </div>
  );
}

async function Listings({ userId, which, signedIn }: { userId: string; which: 'live' | 'ended'; signedIn: boolean }) {
  const { items } = await apiGet<{ items: AuctionCard[] }>(`/users/${userId}/listings?status=${which}`);
  if (!items.length) return <p className="mut">{which === 'live' ? 'Nothing up for auction right now.' : 'No finished auctions yet.'}</p>;
  return (
    <div className="grid gap-[26px] sm:grid-cols-2 xl:grid-cols-3">
      {items.map((lot) => (
        <LotCard key={lot.id} lot={lot} signedIn={signedIn} />
      ))}
    </div>
  );
}

async function Reviews({ userId }: { userId: string }) {
  const { items } = await apiGet<{ items: Review[] }>(`/users/${userId}/reviews`);
  if (!items.length) return <p className="mut">No reviews yet. Reviews are left by the other party after a completed sale.</p>;
  return (
    <ul className="flex max-w-[820px] flex-col gap-3">
      {items.map((r) => (
        <li key={r.id} className="card !gap-2 !p-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Stars value={r.stars} size={15} />
            <span className="text-[13px] font-medium">{r.stars}.0</span>
            <span className="tag tag-neutral">{r.revieweeRole === 'seller' ? 'As seller' : 'As buyer'}</span>
            <span className="mut ml-auto text-[12px]">{new Date(r.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
          {r.comment && <p className="m-0 text-[14px] leading-[1.55]">“{r.comment}”</p>}
          <div className="mut flex flex-wrap items-center gap-2 text-[12.5px]">
            <Avatar initials={r.reviewer.initials} size={22} />
            <Link href={`/users/${r.reviewer.id}`}>{r.reviewer.displayName}</Link>
            <span>·</span>
            <Link href={`/lots/${r.auctionId}`}>
              {r.auctionTitle} <span className="mut">#{r.lotNo}</span>
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
