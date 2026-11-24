'use client';

import type { MyModerationAction } from '@bidwell/contract';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useI18n } from '@/i18n/client';
import { ApiError, api } from '@/lib/client';

export function SignOutButtons() {
  const router = useRouter();
  const { t } = useI18n();
  const out = async (path: string) => {
    await api('POST', path);
    router.push('/');
    router.refresh();
  };
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn btn-secondary" onClick={() => out('/auth/logout')}>
        {t('account.signOut')}
      </button>
      <button type="button" className="btn btn-secondary" onClick={() => out('/auth/logout-all')}>
        {t('account.signOutAll')}
      </button>
    </div>
  );
}

const ACTION_LABEL = { 'auction.hidden': 'account.actionHidden', 'auction.voided': 'account.actionVoided' } as const;

export function ModerationActions({ items }: { items: MyModerationAction[] }) {
  const { t, rich, fullStamp } = useI18n();
  if (!items.length) return <p className="mut text-[14px]">{t('account.noActions')}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {items.map((a) => (
        <li key={a.id} className="card !gap-2 !p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <a href={`/lots/${a.auctionId}`} className="font-medium">
              {a.auctionTitle}
            </a>
            <span className="mut text-[12px]">{fullStamp(a.at)}</span>
          </div>
          <div className="text-[13px]">
            <span className="tag tag-warn mr-2">{a.action in ACTION_LABEL ? t(ACTION_LABEL[a.action as keyof typeof ACTION_LABEL]) : a.action}</span>
            {a.reason}
          </div>
          {a.appeal ? (
            <p className="text-[13px]">
              {rich('account.appeal', { b: (s) => <strong>{s}</strong> }, { status: t(a.appeal.status === 'open' ? 'account.appealOpen' : a.appeal.status === 'overturned' ? 'account.appealOverturned' : 'account.appealUpheld') })}
              {a.appeal.resolutionNote ? ` — ${a.appeal.resolutionNote}` : ''}
            </p>
          ) : (
            <AppealForm actionId={a.id} />
          )}
        </li>
      ))}
    </ul>
  );
}

function AppealForm({ actionId }: { actionId: string }) {
  const router = useRouter();
  const { t, error: errorText } = useI18n();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!open)
    return (
      <button type="button" className="btn btn-ghost self-start" onClick={() => setOpen(true)}>
        {t('account.appealButton')}
      </button>
    );
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api('POST', '/appeals', { actionId, text });
          router.refresh();
        } catch (err) {
          setError(err instanceof ApiError ? errorText(err) : t('account.appealFailed'));
        }
      }}
    >
      <label htmlFor={`appeal-${actionId}`} className="label">
        {t('account.appealLabel')}
      </label>
      <textarea id={`appeal-${actionId}`} className="input" required minLength={10} value={text} onChange={(e) => setText(e.target.value)} />
      {error && <p className="err">{error}</p>}
      <button className="btn btn-primary self-start">{t('account.fileAppeal')}</button>
    </form>
  );
}
