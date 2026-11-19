'use client';

import { REPORT_REASONS, type AppealRow, type ReportRow } from '@bidwell/contract';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, api } from '@/lib/client';
import { fullStamp } from '@/lib/format';

const reasonLabel = (r: string) => REPORT_REASONS.find((x) => x.value === r)?.label ?? r;

function useRun() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  };
  return { error, busy, run };
}

export function ReportCard({ r }: { r: ReportRow }) {
  const [reason, setReason] = useState('');
  const { error, busy, run } = useRun();
  const act = (action: 'hide' | 'void' | 'restore') => run(() => api('POST', `/moderation/auctions/${r.auctionId}/actions`, { action, reason, reportId: r.id }));
  return (
    <li className="card !gap-3 !p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link href={`/lots/${r.auctionId}`} className="font-medium">
          {r.auctionTitle} <span className="mut">#{r.lotNo}</span>
        </Link>
        <span className="mut text-[12px]">
          {fullStamp(r.createdAt)} · reported by {r.reporterName}
        </span>
      </div>
      <div className="text-[13px]">
        <span className="tag tag-warn mr-2">{reasonLabel(r.reason)}</span>
        {r.details || <span className="mut">No details given.</span>}
        {r.auctionHidden && <span className="tag tag-neutral ml-2">Currently hidden</span>}
        {r.auctionStatus !== 'live' && <span className="tag tag-neutral ml-2">{r.auctionStatus}</span>}
      </div>
      {r.status === 'open' && (
        <>
          <textarea className="input !min-h-[70px]" aria-label="Reason for your decision" placeholder="Reason for your decision (published with the action)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {r.auctionStatus === 'live' && !r.auctionHidden && (
              <button type="button" className="btn btn-primary" disabled={busy || reason.trim().length < 10} onClick={() => act('hide')}>
                Hide lot
              </button>
            )}
            {r.auctionStatus !== 'voided' && (
              <button type="button" className="btn btn-danger" disabled={busy || reason.trim().length < 10} onClick={() => act('void')}>
                Void auction
              </button>
            )}
            <button type="button" className="btn btn-secondary" disabled={busy || reason.trim().length < 5} onClick={() => run(() => api('POST', `/moderation/reports/${r.id}/dismiss`, { reason }))}>
              Dismiss report
            </button>
          </div>
          <p className="hint">Hide pauses bidding pending review. Void is final: bids stay in the ledger but are void, deposits are refunded, everyone is notified.</p>
        </>
      )}
      {error && <p className="err">{error}</p>}
    </li>
  );
}

export function AppealCard({ a }: { a: AppealRow }) {
  const [note, setNote] = useState('');
  const { error, busy, run } = useRun();
  const decide = (decision: 'upheld' | 'overturned') => run(() => api('POST', `/moderation/appeals/${a.id}/resolve`, { decision, note }));
  return (
    <li className="card !gap-3 !p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link href={`/lots/${a.auctionId}`} className="font-medium">
          {a.auctionTitle}
        </Link>
        <span className="mut text-[12px]">
          {fullStamp(a.createdAt)} · {a.sellerName}
        </span>
      </div>
      <p className="text-[13px]">
        <strong>Original decision ({a.action === 'auction.voided' ? 'void' : 'hide'}):</strong> {a.actionReason}
      </p>
      <p className="text-[13px]">
        <strong>Seller’s appeal:</strong> {a.text}
      </p>
      {a.status === 'open' ? (
        <>
          <textarea className="input !min-h-[70px]" aria-label="Resolution note" placeholder="Your reasoning (sent to the seller)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary" disabled={busy || note.trim().length < 5} onClick={() => decide('upheld')}>
              Uphold decision
            </button>
            <button type="button" className="btn btn-primary" disabled={busy || note.trim().length < 5} onClick={() => decide('overturned')}>
              Overturn{a.action === 'auction.hidden' ? ' and restore' : ''}
            </button>
          </div>
          <p className="hint">You can’t rule on an appeal of your own decision. Overturning a void records the outcome; the auction itself stays void and the seller relists.</p>
        </>
      ) : (
        <p className="text-[13px]">
          <span className="tag tag-neutral mr-2">{a.status}</span>
          {a.resolutionNote}
        </p>
      )}
      {error && <p className="err">{error}</p>}
    </li>
  );
}
