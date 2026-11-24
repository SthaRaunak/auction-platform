import type { AuctionResult } from '@bidwell/contract';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Amendments } from '@/components/lot/Amendments';
import { getI18n } from '@/i18n/server';
import { ServerApiError, apiGet } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('meta.result') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** E4: the immutable public record of a finished auction, with the complete ledger (E3) and chain check (E2). */
export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { t, rich, money, num, digits, fullStamp, pick } = await getI18n();
  let r: AuctionResult;
  try {
    r = await apiGet<AuctionResult>(`/auctions/${id}/result`);
  } catch (e) {
    if (e instanceof ServerApiError && e.code === 'AUCTION_LIVE') {
      return (
        <div className="mx-auto max-w-[760px] px-6 py-14">
          <h1 className="ttl text-[32px]">{t('result.notYet')}</h1>
          <p className="mut mt-3">{t('result.notYetBody')}</p>
          <Link href={`/lots/${id}`} className="btn btn-primary mt-5">
            {t('common.backToLot')}
          </Link>
        </div>
      );
    }
    throw e;
  }

  return (
    <div className="mx-auto max-w-[1040px] px-6 py-8">
      <Link href={`/lots/${id}`} className="text-[12.5px]">
        {t('common.backToLot')}
      </Link>
      <div className="k mt-4">{t('result.heading', { lotNo: digits(r.lotNo) })}</div>
      <h1 className="ttl mt-2 text-[34px]">{pick(r.title, r.titleNe)}</h1>

      <dl className="card mt-5 grid !gap-5 !p-5 sm:grid-cols-4">
        <div>
          <dt className="mut text-[11.5px]">{t('result.outcome')}</dt>
          <dd className="mt-1 text-[15px] font-medium">{t(`result.outcomes.${r.outcome}`)}</dd>
        </div>
        <div>
          <dt className="mut text-[11.5px]">{t('result.winner')}</dt>
          <dd className="mt-1 text-[15px]">{r.winnerName ?? '—'}</dd>
        </div>
        <div>
          <dt className="mut text-[11.5px]">{t('result.finalPrice')}</dt>
          <dd className="num mt-1 text-[24px]">{r.finalPrice !== null ? money(r.finalPrice) : '—'}</dd>
        </div>
        <div>
          <dt className="mut text-[11.5px]">{t('result.bidsBidders')}</dt>
          <dd className="num mt-1 text-[24px]">
            {num(r.bidCount)} · {num(r.bidderCount)}
          </dd>
        </div>
        <div className="sm:col-span-4 grid gap-5 border-t border-divider pt-4 sm:grid-cols-3">
          <div>
            <dt className="mut text-[11.5px]">{t('result.opened')}</dt>
            <dd className="text-[13px]">{fullStamp(r.startsAt)}</dd>
          </div>
          <div>
            <dt className="mut text-[11.5px]">{t('result.scheduledEnd')}</dt>
            <dd className="text-[13px]">{fullStamp(r.originalEndsAt)}</dd>
          </div>
          <div>
            <dt className="mut text-[11.5px]">{t('result.actualEnd')}</dt>
            <dd className="text-[13px]">{r.endedAt ? fullStamp(r.endedAt) : '—'}</dd>
          </div>
        </div>
      </dl>

      {r.voidReason && (
        <p className="banner banner-danger mt-4">
          <AlertTriangle size={15} aria-hidden />
          <span>{rich('result.voided', { b: (s) => <strong>{s}</strong> }, { reason: r.voidReason })}</span>
        </p>
      )}

      <div className={`banner mt-4 ${r.chain.valid ? 'banner-accent' : 'banner-danger'}`}>
        {r.chain.valid ? <ShieldCheck size={15} aria-hidden /> : <AlertTriangle size={15} aria-hidden />}
        <span>
          {r.chain.valid ? t('result.verified', { count: r.chain.checked }) : t('result.broken', { seq: digits(r.chain.brokenAtSeq ?? '') })}
          {r.chain.headHash && (
            <>
              {' '}
              {t('result.headHash')} <code className="break-all text-[11.5px]">{r.chain.headHash}</code>
            </>
          )}
        </span>
      </div>

      {r.amendments.length > 0 && (
        <section className="mt-6">
          <h2 className="k">{t('result.amendments')}</h2>
          <Amendments items={r.amendments} />
        </section>
      )}

      <section className="mt-8" aria-labelledby="ledger">
        <h2 id="ledger" className="ttl text-[20px]">
          {t('result.ledger')}
        </h2>
        <p className="mut mt-1 text-[13px]">{t('result.ledgerNote')}</p>
        <div className="mt-4 overflow-x-auto">
          <table className="table min-w-[760px]">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">{t('result.colBidder')}</th>
                <th scope="col" className="!text-right">
                  {t('result.colMax')}
                </th>
                <th scope="col" className="!text-right">
                  {t('result.colPriceAfter')}
                </th>
                <th scope="col">{t('result.colLeaderAfter')}</th>
                <th scope="col">{t('result.colPlaced')}</th>
                <th scope="col">{t('result.colHash')}</th>
              </tr>
            </thead>
            <tbody>
              {r.ledger.length === 0 && (
                <tr>
                  <td colSpan={7} className="mut">
                    {t('result.noBids')}
                  </td>
                </tr>
              )}
              {r.ledger.map((b) => (
                <tr key={b.seq}>
                  <td className="num">{digits(b.seq)}</td>
                  <td>
                    <Link href={`/users/${b.userId}`}>{b.name}</Link> <span className="mut">(#{digits(b.bidderNo)})</span>
                  </td>
                  <td className="num !text-right">{money(b.maxAmount)}</td>
                  <td className="num !text-right">{money(b.priceAfter)}</td>
                  <td>{b.leaderAfterNo ? `#${digits(b.leaderAfterNo)}` : '—'}</td>
                  <td className="mut whitespace-nowrap">{fullStamp(b.at)}</td>
                  <td>
                    <code className="text-[11px]" title={`prev ${b.prevHash}\nthis ${b.hash}`}>
                      {b.hash.slice(0, 12)}…
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
