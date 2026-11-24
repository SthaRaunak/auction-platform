'use client';

import { REPORT_REASONS, type ReviewRole } from '@bidwell/contract';
import { Flag, Gavel } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useI18n } from '@/i18n/client';
import { ApiError, api } from '@/lib/client';

function useAction() {
  const { t, error: errorText } = useI18n();
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
      setError(e instanceof ApiError ? errorText(e) : t('common.somethingWrong'));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, done, run };
}

export function ReportLot({ auctionId }: { auctionId: string }) {
  const i18n = useI18n();
  const { t } = i18n;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0].value);
  const [details, setDetails] = useState('');
  const { busy, error, done, run } = useAction();
  if (done) return <p className="mut text-[12.5px]">{done}</p>;
  if (!open) {
    return (
      <button type="button" className="btn btn-ghost self-start !text-[12.5px]" onClick={() => setOpen(true)}>
        <Flag size={14} aria-hidden /> {t('report.open')}
      </button>
    );
  }
  return (
    <form
      className="card !gap-3 !p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => api('POST', `/auctions/${auctionId}/reports`, { reason, details }), t('report.thanks'));
      }}
    >
      <h2 className="k">{t('report.title')}</h2>
      <div className="field">
        <label htmlFor="report-reason">{t('report.reason')}</label>
        <select id="report-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
          {REPORT_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {i18n.reportReason(r.value)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="report-details">{t('report.details')}</label>
        <textarea id="report-details" className="input" maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
      </div>
      {error && <p className="err">{error}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={busy}>
          {t('report.send')}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}

/** Staff-only. Every action needs a reason, is audited, and is shown publicly on the lot (C6, E6). */
export function ModeratorTools({ auctionId, hidden, status }: { auctionId: string; hidden: boolean; status: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [action, setAction] = useState<'hide' | 'restore' | 'void'>(hidden ? 'restore' : 'hide');
  const [reason, setReason] = useState('');
  const [confirmVoid, setConfirmVoid] = useState(false);
  const { busy, error, done, run } = useAction();
  if (status === 'voided') return null;
  const options = [
    ...(status === 'live' && !hidden ? [{ v: 'hide', l: t('modTools.hideOption') }] : []),
    ...(hidden ? [{ v: 'restore', l: t('modTools.restoreOption') }] : []),
    { v: 'void', l: t('modTools.voidOption') },
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
        }, t('modTools.done'));
      }}
    >
      <h2 className="k row !gap-1.5">
        <Gavel size={13} aria-hidden /> {t('modTools.title')}
      </h2>
      <div className="field">
        <label htmlFor="mod-action">{t('modTools.action')}</label>
        <select id="mod-action" className="input" value={action} onChange={(e) => setAction(e.target.value as typeof action)}>
          {options.map((o) => (
            <option key={o.v} value={o.v}>
              {o.l}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="mod-reason">{t('modTools.reason')}</label>
        <textarea id="mod-reason" className="input" required minLength={10} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      {action === 'void' && (
        <label className="chk">
          <input type="checkbox" checked={confirmVoid} onChange={(e) => setConfirmVoid(e.target.checked)} />
          <i />
          <span>{t('modTools.confirmVoid')}</span>
        </label>
      )}
      {error && <p className="err">{error}</p>}
      {done && <p className="text-[12.5px] text-accent-700">{done}</p>}
      <button className={`btn self-start ${action === 'void' ? 'btn-danger' : 'btn-primary'}`} disabled={busy || reason.trim().length < 10 || (action === 'void' && !confirmVoid)}>
        {t(action === 'hide' ? 'modTools.hide' : action === 'restore' ? 'modTools.restore' : 'modTools.void')}
      </button>
    </form>
  );
}

export function ReviewForm({ auctionId, revieweeName, revieweeRole }: { auctionId: string; revieweeName: string; revieweeRole: ReviewRole }) {
  const router = useRouter();
  const { t } = useI18n();
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
        }, t('review.thanks', { name: revieweeName }));
      }}
    >
      <h2 className="k">{t(revieweeRole === 'seller' ? 'review.titleSeller' : 'review.titleBuyer', { name: revieweeName })}</h2>
      <fieldset className="seg self-start">
        <legend className="sr-only">{t('review.stars')}</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="seg-opt" title={t('review.starsTitle', { count: n })}>
            <input type="radio" name="stars" checked={stars === n} onChange={() => setStars(n)} />
            <span aria-hidden>{'★'.repeat(n)}</span>
            <span className="sr-only">{t('review.starsTitle', { count: n })}</span>
          </label>
        ))}
      </fieldset>
      <textarea
        className="input"
        aria-label={t('review.aria')}
        placeholder={t(revieweeRole === 'seller' ? 'review.sellerPlaceholder' : 'review.buyerPlaceholder')}
        maxLength={500}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      {error && <p className="err">{error}</p>}
      <button className="btn btn-primary self-start" disabled={busy}>
        {t('review.submit')}
      </button>
    </form>
  );
}
