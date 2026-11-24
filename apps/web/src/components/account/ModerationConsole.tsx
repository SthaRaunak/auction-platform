'use client';

import type { AppealRow, ReportRow } from '@bidwell/contract';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useI18n } from '@/i18n/client';
import { ApiError, api } from '@/lib/client';

function useRun() {
  const router = useRouter();
  const { t, error: errorText } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? errorText(e) : t('moderation.actionFailed'));
    } finally {
      setBusy(false);
    }
  };
  return { error, busy, run };
}

export function ReportCard({ r }: { r: ReportRow }) {
  const [reason, setReason] = useState('');
  const i18n = useI18n();
  const { t, fullStamp, digits } = i18n;
  const { error, busy, run } = useRun();
  const act = (action: 'hide' | 'void' | 'restore') => run(() => api('POST', `/moderation/auctions/${r.auctionId}/actions`, { action, reason, reportId: r.id }));
  return (
    <li className="card !gap-3 !p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link href={`/lots/${r.auctionId}`} className="font-medium">
          {r.auctionTitle} <span className="mut">#{digits(r.lotNo)}</span>
        </Link>
        <span className="mut text-[12px]">{t('moderation.reportedBy', { when: fullStamp(r.createdAt), name: r.reporterName })}</span>
      </div>
      <div className="text-[13px]">
        <span className="tag tag-warn mr-2">{i18n.reportReason(r.reason)}</span>
        {r.details || <span className="mut">{t('moderation.noDetails')}</span>}
        {r.auctionHidden && <span className="tag tag-neutral ml-2">{t('moderation.currentlyHidden')}</span>}
        {r.auctionStatus !== 'live' && <span className="tag tag-neutral ml-2">{t(`account.statuses.${r.auctionStatus}`)}</span>}
      </div>
      {r.status === 'open' && (
        <>
          <textarea className="input !min-h-[70px]" aria-label={t('moderation.decisionAria')} placeholder={t('moderation.decisionPlaceholder')} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {r.auctionStatus === 'live' && !r.auctionHidden && (
              <button type="button" className="btn btn-primary" disabled={busy || reason.trim().length < 10} onClick={() => act('hide')}>
                {t('moderation.hide')}
              </button>
            )}
            {r.auctionStatus !== 'voided' && (
              <button type="button" className="btn btn-danger" disabled={busy || reason.trim().length < 10} onClick={() => act('void')}>
                {t('moderation.void')}
              </button>
            )}
            <button type="button" className="btn btn-secondary" disabled={busy || reason.trim().length < 5} onClick={() => run(() => api('POST', `/moderation/reports/${r.id}/dismiss`, { reason }))}>
              {t('moderation.dismiss')}
            </button>
          </div>
          <p className="hint">{t('moderation.reportHint')}</p>
        </>
      )}
      {error && <p className="err">{error}</p>}
    </li>
  );
}

export function AppealCard({ a }: { a: AppealRow }) {
  const [note, setNote] = useState('');
  const { t, fullStamp } = useI18n();
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
        <strong>{t('moderation.original', { action: t(a.action === 'auction.voided' ? 'moderation.originalVoid' : 'moderation.originalHide') })}</strong> {a.actionReason}
      </p>
      <p className="text-[13px]">
        <strong>{t('moderation.sellerAppeal')}</strong> {a.text}
      </p>
      {a.status === 'open' ? (
        <>
          <textarea className="input !min-h-[70px]" aria-label={t('moderation.noteAria')} placeholder={t('moderation.notePlaceholder')} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary" disabled={busy || note.trim().length < 5} onClick={() => decide('upheld')}>
              {t('moderation.uphold')}
            </button>
            <button type="button" className="btn btn-primary" disabled={busy || note.trim().length < 5} onClick={() => decide('overturned')}>
              {t(a.action === 'auction.hidden' ? 'moderation.overturnRestore' : 'moderation.overturn')}
            </button>
          </div>
          <p className="hint">{t('moderation.appealHint')}</p>
        </>
      ) : (
        <p className="text-[13px]">
          <span className="tag tag-neutral mr-2">{t(`moderation.appealStatuses.${a.status}`)}</span>
          {a.resolutionNote}
        </p>
      )}
      {error && <p className="err">{error}</p>}
    </li>
  );
}
