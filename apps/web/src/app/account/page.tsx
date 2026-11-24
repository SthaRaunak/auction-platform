import type { AuctionCard, MyModerationAction } from '@bidwell/contract';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ModerationActions, SignOutButtons } from '@/components/account/AccountClient';
import { CountdownText } from '@/components/Countdown';
import { LotCard } from '@/components/LotCard';
import { ResendVerification } from '@/components/ResendVerification';
import { getI18n } from '@/i18n/server';
import { apiGet, getMe } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('meta.account') };
}

const TABS = [
  { id: 'watching', label: 'account.tabWatching' },
  { id: 'bidding', label: 'account.tabBidding' },
  { id: 'selling', label: 'account.tabSelling' },
  { id: 'moderation', label: 'account.tabModeration' },
  { id: 'security', label: 'account.tabSecurity' },
] as const;

type MyBid = AuctionCard & { yourMax: number };

function bidStatus(b: MyBid) {
  if (b.status === 'voided') return { label: 'account.statusVoided', cls: 'tag-danger' } as const;
  if (b.status === 'closed') return b.viewerIsLeader ? ({ label: 'account.statusWon', cls: 'tag-accent' } as const) : ({ label: 'account.statusLost', cls: 'tag-neutral' } as const);
  return b.viewerIsLeader ? ({ label: 'account.statusLeading', cls: 'tag-accent' } as const) : ({ label: 'account.statusOutbid', cls: 'tag-warn' } as const);
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login?next=/account');
  const requested = (await searchParams).tab;
  const tab = TABS.find((x) => x.id === requested)?.id ?? 'watching';
  const { t, rich } = await getI18n();

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="ttl text-[34px]">{t('account.hi', { name: me.displayName.split(' ')[0] })}</h1>
        <Link href={`/users/${me.id}`} className="text-[13px]">
          {t('account.viewProfile')}
        </Link>
      </div>
      <div className="mt-5 flex flex-wrap gap-1.5 border-b border-divider" role="tablist">
        {TABS.map((x) => (
          <Link key={x.id} href={`/account?tab=${x.id}`} role="tab" aria-selected={tab === x.id} className="tab">
            {t(x.label)}
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
                <dt className="mut text-[12px]">{t('common.email')}</dt>
                <dd>
                  {me.email} {me.emailVerified ? <span className="tag tag-accent ml-1">{t('account.verified')}</span> : <span className="tag tag-warn ml-1">{t('account.unverified')}</span>}
                </dd>
                {!me.emailVerified && <ResendVerification />}
              </div>
              <div>
                <dt className="mut text-[12px]">{t('account.methods')}</dt>
                <dd>{[me.hasPassword && t('common.password'), me.googleLinked && 'Google'].filter(Boolean).join(' · ') || '—'}</dd>
              </div>
              <div>
                <dt className="mut text-[12px]">{t('account.role')}</dt>
                <dd>{t(`account.roles.${me.role}`)}</dd>
              </div>
            </dl>
            {!me.hasPassword && (
              <p className="mut">{rich('account.noPassword', { link: (s) => <Link href="/forgot-password">{s}</Link> })}</p>
            )}
            <SignOutButtons />
          </div>
        )}
      </div>
    </div>
  );
}

async function Watching({ signedIn }: { signedIn: boolean }) {
  const [{ items }, { t }] = await Promise.all([apiGet<{ items: AuctionCard[] }>('/me/watchlist'), getI18n()]);
  if (!items.length) return <p className="mut">{t('account.watchingEmpty')}</p>;
  return (
    <div className="grid gap-[26px] sm:grid-cols-2 xl:grid-cols-4">
      {items.map((lot) => (
        <LotCard key={lot.id} lot={lot} signedIn={signedIn} />
      ))}
    </div>
  );
}

async function Bidding() {
  const [{ items }, { t, money, pick }] = await Promise.all([apiGet<{ items: MyBid[] }>('/me/bids'), getI18n()]);
  if (!items.length) return <p className="mut">{t('account.biddingEmpty')}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="table min-w-[680px]">
        <thead>
          <tr>
            <th scope="col">{t('account.colLot')}</th>
            <th scope="col">{t('account.colStatus')}</th>
            <th scope="col" className="!text-right">{t('account.colYourMax')}</th>
            <th scope="col" className="!text-right">{t('account.colCurrent')}</th>
            <th scope="col">{t('account.colEnds')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((b) => {
            const s = bidStatus(b);
            return (
              <tr key={b.id}>
                <td>
                  <Link href={`/lots/${b.id}`}>{pick(b.title, b.titleNe)}</Link>
                </td>
                <td>
                  <span className={`tag ${s.cls}`}>{t(s.label)}</span>
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
  const [{ items }, { t, rich, money, num, digits, pick }] = await Promise.all([apiGet<{ items: AuctionCard[] }>('/me/listings'), getI18n()]);
  if (!items.length) return <p className="mut">{rich('account.sellingEmpty', { link: (s) => <Link href="/sell">{s}</Link> })}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="table min-w-[720px]">
        <thead>
          <tr>
            <th scope="col">{t('account.colLot')}</th>
            <th scope="col" className="!text-right">{t('account.colPrice')}</th>
            <th scope="col" className="!text-right">{t('account.colBids')}</th>
            <th scope="col">{t('account.colStatus')}</th>
            <th scope="col">{t('account.colEnds')}</th>
            <th scope="col" />
          </tr>
        </thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.id}>
              <td>
                <Link href={`/lots/${a.id}`}>{pick(a.title, a.titleNe)}</Link> <span className="mut">#{digits(a.lotNo)}</span>
              </td>
              <td className="num !text-right">{money(a.price)}</td>
              <td className="num !text-right">{num(a.bidCount)}</td>
              <td>
                <span className={`tag ${a.status === 'voided' ? 'tag-danger' : a.hidden ? 'tag-warn' : 'tag-neutral'}`}>{t(a.hidden ? 'account.statusHidden' : `account.statuses.${a.status}`)}</span>
              </td>
              <td className="mut">
                <CountdownText endsAt={a.endsAt} status={a.status} />
              </td>
              <td className="!text-right">
                {a.status === 'live' ? <Link href={`/lots/${a.id}/edit`}>{t('common.edit')}</Link> : <Link href={`/lots/${a.id}/result`}>{t('common.result')}</Link>}
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
