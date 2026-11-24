import type { AuctionCard, RatingSummary, Review, UserProfile } from '@bidwell/contract';
import { ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Avatar } from '@/components/Avatar';
import { LotCard } from '@/components/LotCard';
import { Stars } from '@/components/Stars';
import { getI18n } from '@/i18n/server';
import { apiGet, getMe } from '@/lib/server';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Params = Promise<{ id: string }>;

const TABS = [
  { id: 'live', label: 'profile.tabLive' },
  { id: 'ended', label: 'profile.tabEnded' },
  { id: 'reviews', label: 'profile.tabReviews' },
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
  const [profile, me, { t, num, monthYear }] = await Promise.all([apiGet<UserProfile>(`/users/${id}`), getMe(), getI18n()]);
  const reviewCount = profile.asSeller.count + profile.asBuyer.count;

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-8">
      <section className="card !flex-row !flex-wrap !items-center !gap-5 !p-6">
        <Avatar initials={profile.initials} size={64} />
        <div className="min-w-0 flex-1">
          <div className="k mb-1.5">{t('profile.public')}</div>
          <h1 className="ttl text-[30px]">{profile.displayName}</h1>
          <p className="mut mt-1.5 flex flex-wrap items-center gap-2 text-[13px]">
            {t('common.memberSince', { date: monthYear(profile.memberSince) })}
            {profile.isStaff && (
              <span className="tag tag-accent">
                <ShieldCheck size={12} aria-hidden /> {t('profile.moderator')}
              </span>
            )}
            {me?.id === profile.id && (
              <Link href="/account" className="text-[13px]">
                {t('profile.thisIsYou')}
              </Link>
            )}
          </p>
        </div>
        <dl className="flex flex-wrap items-end gap-x-[18px] gap-y-3">
          <RatingStat label={t('profile.asSeller')} r={profile.asSeller} />
          <span className="h-[34px] w-px bg-divider" aria-hidden />
          <RatingStat label={t('profile.asBuyer')} r={profile.asBuyer} />
          <span className="h-[34px] w-px bg-divider" aria-hidden />
          <Count label={t('profile.listed')} n={num(profile.lotsListed)} />
          <span className="h-[34px] w-px bg-divider" aria-hidden />
          <Count label={t('profile.sold')} n={num(profile.lotsSold)} />
          <span className="h-[34px] w-px bg-divider" aria-hidden />
          <Count label={t('profile.won')} n={num(profile.lotsWon)} />
        </dl>
      </section>

      <div className="mt-6 flex flex-wrap gap-1.5 border-b border-divider" role="tablist">
        {TABS.map((tab_) => (
          <Link key={tab_.id} href={`/users/${id}?tab=${tab_.id}`} role="tab" aria-selected={tab === tab_.id} className="tab" scroll={false}>
            {t(tab_.label)}
            {tab_.id === 'reviews' ? ` (${num(reviewCount)})` : ''}
          </Link>
        ))}
      </div>

      <div className="pt-6">
        {tab === 'reviews' ? <Reviews userId={id} /> : <Listings userId={id} which={tab} signedIn={Boolean(me)} />}
      </div>
      <p className="mut mt-10 text-[12px]">{t('profile.privacy')}</p>
    </div>
  );
}

async function RatingStat({ label, r }: { label: string; r: RatingSummary }) {
  const { t, num } = await getI18n();
  return (
    <div className="flex flex-col items-end gap-1">
      <dt className="mut text-[11px]">{label}</dt>
      <dd className="flex items-center gap-2">
        {r.average !== null ? (
          <>
            <Stars value={r.average} />
            <span className="num text-[22px]">{num(r.average, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
            <span className="mut text-[11.5px]">({num(r.count)})</span>
          </>
        ) : (
          <span className="mut text-[13px]">{t('common.noReviewsYet')}</span>
        )}
      </dd>
    </div>
  );
}

function Count({ label, n }: { label: string; n: string }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <dt className="mut text-[11px]">{label}</dt>
      <dd className="num text-[22px]">{n}</dd>
    </div>
  );
}

async function Listings({ userId, which, signedIn }: { userId: string; which: 'live' | 'ended'; signedIn: boolean }) {
  const [{ items }, { t }] = await Promise.all([apiGet<{ items: AuctionCard[] }>(`/users/${userId}/listings?status=${which}`), getI18n()]);
  if (!items.length) return <p className="mut">{t(which === 'live' ? 'profile.noLive' : 'profile.noEnded')}</p>;
  return (
    <div className="grid gap-[26px] sm:grid-cols-2 xl:grid-cols-3">
      {items.map((lot) => (
        <LotCard key={lot.id} lot={lot} signedIn={signedIn} />
      ))}
    </div>
  );
}

async function Reviews({ userId }: { userId: string }) {
  const [{ items }, { t, num, day, digits, pick }] = await Promise.all([apiGet<{ items: Review[] }>(`/users/${userId}/reviews`), getI18n()]);
  if (!items.length) return <p className="mut">{t('profile.noReviews')}</p>;
  return (
    <ul className="flex max-w-[820px] flex-col gap-3">
      {items.map((r) => (
        <li key={r.id} className="card !gap-2 !p-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Stars value={r.stars} size={15} />
            <span className="text-[13px] font-medium">{num(r.stars, { minimumFractionDigits: 1 })}</span>
            <span className="tag tag-neutral">{t(r.revieweeRole === 'seller' ? 'profile.roleSeller' : 'profile.roleBuyer')}</span>
            <span className="mut ml-auto text-[12px]">{day(r.at)}</span>
          </div>
          {r.comment && <p className="m-0 text-[14px] leading-[1.55]">“{r.comment}”</p>}
          <div className="mut flex flex-wrap items-center gap-2 text-[12.5px]">
            <Avatar initials={r.reviewer.initials} size={22} />
            <Link href={`/users/${r.reviewer.id}`}>{r.reviewer.displayName}</Link>
            <span>·</span>
            <Link href={`/lots/${r.auctionId}`}>
              {pick(r.auctionTitle, r.auctionTitleNe)} <span className="mut">#{digits(r.lotNo)}</span>
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
