'use client';

import { REPORT_REASONS, type ReviewRole } from '@bidwell/contract';
import { Flag, Gavel } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, api } from '@/lib/client';

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setDone(ok);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, done, run };
}

export function ReportLot({ auctionId }: { auctionId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0].value);
  const [details, setDetails] = useState('');
  const { busy, error, done, run } = useAction();
  if (done) return <p className="mut text-[12.5px]">{done}</p>;
  if (!open) {
    return (
      <button type="button" className="btn btn-ghost self-start !text-[12.5px]" onClick={() => setOpen(true)}>
        <Flag size={14} aria-hidden /> Report this lot
      </button>
    );
  }
  return (
    <form
      className="card !gap-3 !p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => api('POST', `/auctions/${auctionId}/reports`, { reason, details }), 'Thanks — a moderator will review this lot. Reports are confidential.');
      }}
    >
      <h2 className="k">Report this lot</h2>
      <div className="field">
        <label htmlFor="report-reason">Reason</label>
        <select id="report-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
          {REPORT_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="report-details">What should the moderator look at? (optional)</label>
        <textarea id="report-details" className="input" maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
      </div>
      {error && <p className="err">{error}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={busy}>
          Send report
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Staff-only. Every action needs a reason, is audited, and is shown publicly on the lot (C6, E6). */
export function ModeratorTools({ auctionId, hidden, status }: { auctionId: string; hidden: boolean; status: string }) {
  const router = useRouter();
  const [action, setAction] = useState<'hide' | 'restore' | 'void'>(hidden ? 'restore' : 'hide');
  const [reason, setReason] = useState('');
  const [confirmVoid, setConfirmVoid] = useState(false);
  const { busy, error, done, run } = useAction();
  if (status === 'voided') return null;
  const options = [
    ...(status === 'live' && !hidden ? [{ v: 'hide', l: 'Hide — pause bidding pending review' }] : []),
    ...(hidden ? [{ v: 'restore', l: 'Restore — resume bidding' }] : []),
    { v: 'void', l: 'Void — take down, all bids void (final)' },
  ];
  return (
    <form
      className="card !gap-3 !border-accent-300 !p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          await api('POST', `/moderation/auctions/${auctionId}/actions`, { action, reason });
          setReason('');
          router.refresh();
        }, 'Done — the action is recorded in the audit log.');
      }}
    >
      <h2 className="k row !gap-1.5">
        <Gavel size={13} aria-hidden /> Moderator tools
      </h2>
      <div className="field">
        <label htmlFor="mod-action">Action</label>
        <select id="mod-action" className="input" value={action} onChange={(e) => setAction(e.target.value as typeof action)}>
          {options.map((o) => (
            <option key={o.v} value={o.v}>
              {o.l}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="mod-reason">Reason (shown to the seller and bidders, and published on the lot)</label>
        <textarea id="mod-reason" className="input" required minLength={10} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      {action === 'void' && (
        <label className="chk">
          <input type="checkbox" checked={confirmVoid} onChange={(e) => setConfirmVoid(e.target.checked)} />
          <i />
          <span>I understand voiding is final: bids stay in the ledger but are void, deposits are refunded and every bidder is notified.</span>
        </label>
      )}
      {error && <p className="err">{error}</p>}
      {done && <p className="text-[12.5px] text-accent-700">{done}</p>}
      <button className={`btn self-start ${action === 'void' ? 'btn-danger' : 'btn-primary'}`} disabled={busy || reason.trim().length < 10 || (action === 'void' && !confirmVoid)}>
        {action === 'hide' ? 'Hide lot' : action === 'restore' ? 'Restore lot' : 'Void auction'}
      </button>
    </form>
  );
}

export function ReviewForm({ auctionId, revieweeName, revieweeRole }: { auctionId: string; revieweeName: string; revieweeRole: ReviewRole }) {
  const router = useRouter();
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState('');
  const { busy, error, done, run } = useAction();
  if (done) return <p className="banner banner-accent">{done}</p>;
  return (
    <form
      className="card !gap-3 !p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          await api('POST', `/auctions/${auctionId}/review`, { stars, comment });
          router.refresh();
        }, `Thanks — your review of ${revieweeName} is on their profile.`);
      }}
    >
      <h2 className="k">
        Review the {revieweeRole === 'seller' ? 'seller' : 'buyer'}: {revieweeName}
      </h2>
      <fieldset className="seg self-start">
        <legend className="sr-only">Stars</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="seg-opt" title={`${n} star${n === 1 ? '' : 's'}`}>
            <input type="radio" name="stars" checked={stars === n} onChange={() => setStars(n)} />
            <span aria-hidden>{'★'.repeat(n)}</span>
            <span className="sr-only">{n} stars</span>
          </label>
        ))}
      </fieldset>
      <textarea
        className="input"
        aria-label="Review (optional)"
        placeholder={revieweeRole === 'seller' ? 'Was the lot as described? How was handover?' : 'Did they pay and collect on time?'}
        maxLength={500}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      {error && <p className="err">{error}</p>}
      <button className="btn btn-primary self-start" disabled={busy}>
        Submit review
      </button>
    </form>
  );
}
