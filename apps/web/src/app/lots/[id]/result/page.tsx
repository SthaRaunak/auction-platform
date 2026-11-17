import type { AuctionResult } from '@bidwell/contract';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Amendments } from '@/components/lot/Amendments';
import { fullStamp, money } from '@/lib/format';
import { ServerApiError, apiGet } from '@/lib/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Published result' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OUTCOME = { sold: 'Sold', reserve_not_met: 'Unsold — reserve not met', no_bids: 'Unsold — no bids', voided: 'Voided by moderator' } as const;

/** E4: the immutable public record of a finished auction, with the complete ledger (E3) and chain check (E2). */
export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  let r: AuctionResult;
  try {
    r = await apiGet<AuctionResult>(`/auctions/${id}/result`);
  } catch (e) {
    if (e instanceof ServerApiError && e.code === 'AUCTION_LIVE') {
      return (
        <div className="mx-auto max-w-[760px] px-6 py-14">
          <h1 className="ttl text-[32px]">Not published yet</h1>
          <p className="mut mt-3">This auction is still running. Maximum bids stay sealed until it ends; then the full bid log is published here.</p>
          <Link href={`/lots/${id}`} className="btn btn-primary mt-5">
            Back to the lot
          </Link>
        </div>
      );
    }
    throw e;
  }

  return (
    <div className="mx-auto max-w-[1040px] px-6 py-8">
      <Link href={`/lots/${id}`} className="text-[12.5px]">
        ← Back to the lot
      </Link>
      <div className="k mt-4">Published result · Lot #{r.lotNo}</div>
      <h1 className="ttl mt-2 text-[34px]">{r.title}</h1>

      <dl className="card mt-5 grid !gap-5 !p-5 sm:grid-cols-4">
        <div>
          <dt className="mut text-[11.5px]">Outcome</dt>
          <dd className="mt-1 text-[15px] font-medium">{OUTCOME[r.outcome]}</dd>
        </div>
        <div>
          <dt className="mut text-[11.5px]">Winner</dt>
          <dd className="mt-1 text-[15px]">{r.winnerName ?? '—'}</dd>
        </div>
        <div>
          <dt className="mut text-[11.5px]">Final price</dt>
          <dd className="num mt-1 text-[24px]">{r.finalPrice !== null ? money(r.finalPrice) : '—'}</dd>
        </div>
        <div>
          <dt className="mut text-[11.5px]">Bids · bidders</dt>
          <dd className="num mt-1 text-[24px]">
            {r.bidCount} · {r.bidderCount}
          </dd>
        </div>
        <div className="sm:col-span-4 grid gap-5 border-t border-divider pt-4 sm:grid-cols-3">
          <div>
            <dt className="mut text-[11.5px]">Opened</dt>
            <dd className="text-[13px]">{fullStamp(r.startsAt)}</dd>
          </div>
          <div>
            <dt className="mut text-[11.5px]">Scheduled end</dt>
            <dd className="text-[13px]">{fullStamp(r.originalEndsAt)}</dd>
          </div>
          <div>
            <dt className="mut text-[11.5px]">Actually ended</dt>
            <dd className="text-[13px]">{r.endedAt ? fullStamp(r.endedAt) : '—'}</dd>
          </div>
        </div>
      </dl>

      {r.voidReason && (
        <p className="banner banner-danger mt-4">
          <AlertTriangle size={15} aria-hidden />
          <span>
            <strong>Voided.</strong> {r.voidReason} Every bid below is retained in the ledger and void; deposits were refunded.
          </span>
        </p>
      )}

      <div className={`banner mt-4 ${r.chain.valid ? 'banner-accent' : 'banner-danger'}`}>
        {r.chain.valid ? <ShieldCheck size={15} aria-hidden /> : <AlertTriangle size={15} aria-hidden />}
        <span>
          {r.chain.valid
            ? `Ledger verified: all ${r.chain.checked} bids hash-chain correctly.`
            : `Ledger integrity check FAILED at bid #${r.chain.brokenAtSeq}. The record below has been altered since it was written.`}
          {r.chain.headHash && (
            <>
              {' '}
              Head hash <code className="break-all text-[11.5px]">{r.chain.headHash}</code>
            </>
          )}
        </span>
      </div>

      {r.amendments.length > 0 && (
        <section className="mt-6">
          <h2 className="k">Amendments</h2>
          <Amendments items={r.amendments} />
        </section>
      )}

      <section className="mt-8" aria-labelledby="ledger">
        <h2 id="ledger" className="ttl text-[20px]">
          Full bid ledger
        </h2>
        <p className="mut mt-1 text-[13px]">Every bid as recorded, including each bidder’s secret maximum — sealed while the auction ran, published now. Times are server time.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="table min-w-[760px]">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Bidder</th>
                <th scope="col" className="!text-right">
                  Maximum
                </th>
                <th scope="col" className="!text-right">
                  Price after
                </th>
                <th scope="col">Leader after</th>
                <th scope="col">Placed</th>
                <th scope="col">Hash</th>
              </tr>
            </thead>
            <tbody>
              {r.ledger.length === 0 && (
                <tr>
                  <td colSpan={7} className="mut">
                    No bids were placed.
                  </td>
                </tr>
              )}
              {r.ledger.map((b) => (
                <tr key={b.seq}>
                  <td className="num">{b.seq}</td>
                  <td>
                    <Link href={`/users/${b.userId}`}>{b.name}</Link> <span className="mut">(#{b.bidderNo})</span>
                  </td>
                  <td className="num !text-right">{money(b.maxAmount)}</td>
                  <td className="num !text-right">{money(b.priceAfter)}</td>
                  <td>{b.leaderAfterNo ? `#${b.leaderAfterNo}` : '—'}</td>
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
