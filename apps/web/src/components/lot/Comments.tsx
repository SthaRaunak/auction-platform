'use client';

import type { AuctionStatus, Comment, Me } from '@bidwell/contract';
import { MessageSquare, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useI18n } from '@/i18n/client';
import { ApiError, api } from '@/lib/client';
import { Avatar } from '../Avatar';
import { useNow } from '../Clock';

/** Public Q&A on a lot. The seller's answers are badged so every bidder can rely on them. */
export function Comments({ auctionId, initial, me, status }: { auctionId: string; initial: Comment[]; me: Me | null; status: AuctionStatus }) {
  const now = useNow();
  const { t, rich, error: errorText } = useI18n();
  const [items, setItems] = useState(initial);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reload = async () => setItems((await api<{ items: Comment[] }>('GET', `/auctions/${auctionId}/comments`)).items);

  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('POST', `/auctions/${auctionId}/comments`, { body });
      setBody('');
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? errorText(err) : t('comments.postFailed'));
    } finally {
      setBusy(false);
    }
  };

  const visible = items.filter((c) => !c.removed).length;
  return (
    <section id="comments" className="card !gap-0 !p-0 scroll-mt-24" aria-labelledby="comments-title">
      <div className="flex items-center justify-between border-b border-divider px-4 py-[13px]">
        <h2 id="comments-title" className="k row !gap-1.5">
          <MessageSquare size={13} aria-hidden /> {t('comments.title')}
        </h2>
        <span className="mut text-[11px]">{t('comments.count', { count: visible })}</span>
      </div>

      {items.length === 0 ? (
        <p className="mut px-4 py-5 text-[13px]">{t('comments.empty')}</p>
      ) : (
        <ol>
          {items.map((c) => (
            <CommentRow key={c.id} c={c} now={now} onRemoved={reload} />
          ))}
        </ol>
      )}

      <div className="border-t border-divider px-4 py-3.5">
        {status === 'voided' ? (
          <p className="mut text-[12.5px]">{t('comments.closed')}</p>
        ) : !me ? (
          <p className="mut text-[12.5px]">{rich('comments.signIn', { signin: (s) => <Link href={`/login?next=${encodeURIComponent(`/lots/${auctionId}#comments`)}`}>{s}</Link> })}</p>
        ) : !me.emailVerified ? (
          <p className="mut text-[12.5px]">{t('comments.verify')}</p>
        ) : (
          <form onSubmit={post} className="flex flex-col gap-2">
            <label htmlFor="comment-body" className="sr-only">
              {t('comments.yours')}
            </label>
            <textarea
              id="comment-body"
              className="input !min-h-[72px]"
              maxLength={1000}
              placeholder={t('comments.placeholder')}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            {error && (
              <p className="err" role="alert">
                {error}
              </p>
            )}
            <div className="flex items-center justify-between gap-3">
              <span className="mut text-[11.5px]">{t('comments.postingAs', { name: me.displayName })}</span>
              <button className="btn btn-primary" disabled={busy || !body.trim()}>
                {t(busy ? 'comments.posting' : 'comments.post')}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

function CommentRow({ c, now, onRemoved }: { c: Comment; now: number; onRemoved: () => Promise<void> }) {
  const { t, ago, error: errorText } = useI18n();
  const [removing, setRemoving] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const remove = async (withReason: boolean) => {
    setError(null);
    try {
      await api('POST', `/comments/${c.id}/remove`, withReason ? { reason } : {});
      await onRemoved();
    } catch (err) {
      // A moderator removing someone else's comment is asked for a reason first.
      if (err instanceof ApiError && err.code === 'REASON_REQUIRED') return setRemoving(true);
      setError(err instanceof ApiError ? errorText(err) : t('comments.removeFailed'));
    }
  };

  return (
    <li className="flex gap-3 px-4 py-3" style={{ borderBottom: '1px solid color-mix(in srgb, var(--color-text) 7%, transparent)' }}>
      <Avatar initials={c.author.initials} size={28} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          <Link href={`/users/${c.author.id}`} className="font-medium text-ink no-underline hover:text-accent-800">
            {c.author.displayName}
          </Link>
          {c.author.isSeller && <span className="tag tag-accent !py-0.5">{t('comments.seller')}</span>}
          {c.author.isStaff && (
            <span className="tag tag-neutral !py-0.5">
              <ShieldCheck size={11} aria-hidden /> {t('comments.moderator')}
            </span>
          )}
          <span className="mut text-[11.5px]" suppressHydrationWarning>
            {ago(c.at, now)}
          </span>
        </div>
        {c.removed ? (
          <p className="mut mt-1 text-[13px] italic">
            {c.removed.by === 'author' ? t('comments.removedByAuthor') : t('comments.removedByModerator', { reason: c.removed.reason ?? '' })}
          </p>
        ) : (
          <p className="mt-1 whitespace-pre-line break-words text-[13.5px] leading-[1.55]">{c.body}</p>
        )}
        {c.canRemove && !removing && (
          <button type="button" className="btn btn-ghost mt-1 !px-1 !py-0.5 !text-[12px]" onClick={() => remove(false)}>
            {t('comments.remove')}
          </button>
        )}
        {removing && (
          <div className="mt-2 flex flex-col gap-2">
            <input className="input" aria-label={t('comments.reasonAria')} placeholder={t('comments.reasonPlaceholder')} value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="flex gap-2">
              <button type="button" className="btn btn-danger !py-1.5 !text-[13px]" disabled={reason.trim().length < 5} onClick={() => remove(true)}>
                {t('comments.removeComment')}
              </button>
              <button type="button" className="btn btn-secondary !py-1.5 !text-[13px]" onClick={() => setRemoving(false)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}
        {error && <p className="err">{error}</p>}
      </div>
    </li>
  );
}
