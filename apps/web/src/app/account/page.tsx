import type { AuctionCard, MyModerationAction } from '@bidwell/contract';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ModerationActions, SignOutButtons } from '@/components/account/AccountClient';
import { CountdownText } from '@/components/Countdown';
import { LotCard } from '@/components/LotCard';
import { ResendVerification } from '@/components/ResendVerification';
import { money } from '@/lib/format';
import { apiGet, getMe } from '@/lib/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your account' };

const TABS = [
  { id: 'watching', label: 'Watching' },
  { id: 'bidding', label: 'Bidding' },
  { id: 'selling', label: 'Selling' },
  { id: 'moderation', label: 'Decisions & appeals' },
  { id: 'security', label: 'Account & security' },
] as const;

type MyBid = AuctionCard & { yourMax: number };

function bidStatus(b: MyBid) {
  if (b.status === 'voided') return { label: 'Voided', cls: 'tag-danger' };
  if (b.status === 'closed') return b.viewerIsLeader ? { label: 'Won', cls: 'tag-accent' } : { label: 'Didn’t win', cls: 'tag-neutral' };
  return b.viewerIsLeader ? { label: 'Leading', cls: 'tag-accent' } : { label: 'Outbid', cls: 'tag-warn' };
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login?next=/account');
  const requested = (await searchParams).tab;
  const tab = TABS.find((t) => t.id === requested)?.id ?? 'watching';

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="ttl text-[34px]">Hi, {me.displayName.split(' ')[0]}</h1>
        <Link href={`/users/${me.id}`} className="text-[13px]">
          View your public profile →
        </Link>
      </div>
      <div className="mt-5 flex flex-wrap gap-1.5 border-b border-divider" role="tablist">
        {TABS.map((t) => (
          <Link key={t.id} href={`/account?tab=${t.id}`} role="tab" aria-selected={tab === t.id} className="tab">
            {t.label}
          </Link>
        ))}
      </div>
      <div className="pt-6">
        {tab === 'watching' && <Watching signedIn />}
        {tab === 'bidding' && <Bidding />}
        {tab === 'selling' && <Selling />}
        {tab === 'moderation' && <Decisions />}
        {tab === 'security' && (
          <div className="flex max-w-[560px] flex-col gap-5 text-[14px]">
            <dl className="card !gap-3 !p-5">
              <div>
                <dt className="mut text-[12px]">Email</dt>
                <dd>
                  {me.email} {me.emailVerified ? <span className="tag tag-accent ml-1">Verified</span> : <span className="tag tag-warn ml-1">Unverified</span>}
                </dd>
                {!me.emailVerified && <ResendVerification />}
              </div>
              <div>
                <dt className="mut text-[12px]">Sign-in methods</dt>
                <dd>{[me.hasPassword && 'Password', me.googleLinked && 'Google'].filter(Boolean).join(' · ') || '—'}</dd>
              </div>
              <div>
                <dt className="mut text-[12px]">Role</dt>
                <dd className="capitalize">{me.role}</dd>
              </div>
            </dl>
            {!me.hasPassword && (
              <p className="mut">
                No password is set on this account. <Link href="/forgot-password">Set one by email</Link>.
              </p>
            )}
            <SignOutButtons />
          </div>
        )}
      </div>
    </div>
  );
}

async function Watching({ signedIn }: { signedIn: boolean }) {
  const { items } = await apiGet<{ items: AuctionCard[] }>('/me/watchlist');
  if (!items.length) return <p className="mut">Nothing on your watchlist yet — tap the star on any lot.</p>;
  return (
    <div className="grid gap-[26px] sm:grid-cols-2 xl:grid-cols-4">
      {items.map((lot) => (
        <LotCard key={lot.id} lot={lot} signedIn={signedIn} />
      ))}
    </div>
  );
}

async function Bidding() {
  const { items } = await apiGet<{ items: MyBid[] }>('/me/bids');
  if (!items.length) return <p className="mut">You haven’t bid on anything yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="table min-w-[680px]">
        <thead>
          <tr>
            <th scope="col">Lot</th>
            <th scope="col">Status</th>
            <th scope="col" className="!text-right">Your max</th>
            <th scope="col" className="!text-right">Current</th>
            <th scope="col">Ends</th>
          </tr>
        </thead>
        <tbody>
          {items.map((b) => {
            const s = bidStatus(b);
            return (
              <tr key={b.id}>
                <td>
                  <Link href={`/lots/${b.id}`}>{b.title}</Link>
                </td>
                <td>
                  <span className={`tag ${s.cls}`}>{s.label}</span>
                </td>
                <td className="num !text-right">{money(b.yourMax)}</td>
                <td className="num !text-right">{money(b.price)}</td>
                <td className="mut">
                  <CountdownText endsAt={b.endsAt} status={b.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

async function Selling() {
  const { items } = await apiGet<{ items: AuctionCard[] }>('/me/listings');
  if (!items.length)
    return (
      <p className="mut">
        You haven’t listed anything. <Link href="/sell">Sell an item</Link>
      </p>
    );
  return (
    <div className="overflow-x-auto">
      <table className="table min-w-[720px]">
        <thead>
          <tr>
            <th scope="col">Lot</th>
            <th scope="col" className="!text-right">Price</th>
            <th scope="col" className="!text-right">Bids</th>
            <th scope="col">Status</th>
            <th scope="col">Ends</th>
            <th scope="col" />
          </tr>
        </thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.id}>
              <td>
                <Link href={`/lots/${a.id}`}>{a.title}</Link> <span className="mut">#{a.lotNo}</span>
              </td>
              <td className="num !text-right">{money(a.price)}</td>
              <td className="num !text-right">{a.bidCount}</td>
              <td>
                <span className={`tag ${a.status === 'voided' ? 'tag-danger' : a.hidden ? 'tag-warn' : 'tag-neutral'}`}>{a.hidden ? 'Hidden' : a.status}</span>
              </td>
              <td className="mut">
                <CountdownText endsAt={a.endsAt} status={a.status} />
              </td>
              <td className="!text-right">
                {a.status === 'live' ? <Link href={`/lots/${a.id}/edit`}>Edit</Link> : <Link href={`/lots/${a.id}/result`}>Result</Link>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function Decisions() {
  const { items } = await apiGet<{ items: MyModerationAction[] }>('/me/moderation');
  return <ModerationActions items={items} />;
}
