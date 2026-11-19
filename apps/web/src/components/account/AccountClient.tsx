'use client';

import type { MyModerationAction } from '@bidwell/contract';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, api } from '@/lib/client';
import { fullStamp } from '@/lib/format';

export function SignOutButtons() {
  const router = useRouter();
  const out = async (path: string) => {
    await api('POST', path);
    router.push('/');
    router.refresh();
  };
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn btn-secondary" onClick={() => out('/auth/logout')}>
        Sign out
      </button>
      <button type="button" className="btn btn-secondary" onClick={() => out('/auth/logout-all')}>
        Sign out everywhere
      </button>
    </div>
  );
}

const ACTION_LABEL: Record<string, string> = { 'auction.hidden': 'Hidden for review', 'auction.voided': 'Voided' };

export function ModerationActions({ items }: { items: MyModerationAction[] }) {
  if (!items.length) return <p className="mut text-[14px]">No moderation actions have been taken on your lots.</p>;
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
            <span className="tag tag-warn mr-2">{ACTION_LABEL[a.action] ?? a.action}</span>
            {a.reason}
          </div>
          {a.appeal ? (
            <p className="text-[13px]">
              Appeal: <strong>{a.appeal.status === 'open' ? 'under review' : a.appeal.status === 'overturned' ? 'decision overturned' : 'decision upheld'}</strong>
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
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!open)
    return (
      <button type="button" className="btn btn-ghost self-start" onClick={() => setOpen(true)}>
        Appeal this decision
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
          setError(err instanceof ApiError ? err.message : 'Couldn’t file the appeal.');
        }
      }}
    >
      <label htmlFor={`appeal-${actionId}`} className="label">
        Why should this be reconsidered? A different moderator will review it.
      </label>
      <textarea id={`appeal-${actionId}`} className="input" required minLength={10} value={text} onChange={(e) => setText(e.target.value)} />
      {error && <p className="err">{error}</p>}
      <button className="btn btn-primary self-start">File appeal</button>
    </form>
  );
}
