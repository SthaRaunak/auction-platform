'use client';

import type { AuctionStatus, Comment, Me } from '@bidwell/contract';
import { MessageSquare, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ApiError, api } from '@/lib/client';
import { ago } from '@/lib/format';
import { Avatar } from '../Avatar';
import { useNow } from '../Clock';

/** Public Q&A on a lot. The seller's answers are badged so every bidder can rely on them. */
export function Comments({ auctionId, initial, me, status }: { auctionId: string; initial: Comment[]; me: Me | null; status: AuctionStatus }) {
  const now = useNow();
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
      setError(err instanceof ApiError ? err.message : 'Couldn’t post your comment.');
    } finally {
      setBusy(false);
    }
  };

  const visible = items.filter((c) => !c.removed).length;
  return (
    <section id="comments" className="card !gap-0 !p-0 scroll-mt-24" aria-labelledby="comments-title">
      <div className="flex items-center justify-between border-b border-divider px-4 py-[13px]">
        <h2 id="comments-title" className="k row !gap-1.5">
          <MessageSquare size={13} aria-hidden /> Questions &amp; comments
        </h2>
        <span className="mut text-[11px]">{visible === 1 ? '1 comment' : `${visible} comments`}</span>
      </div>

      {items.length === 0 ? (
        <p className="mut px-4 py-5 text-[13px]">No questions yet. Ask the seller anything about the lot — the answer is public, so every bidder sees it.</p>
      ) : (
        <ol>
          {items.map((c) => (
            <CommentRow key={c.id} c={c} now={now} onRemoved={reload} />
          ))}
        </ol>
      )}

      <div className="border-t border-divider px-4 py-3.5">
        {status === 'voided' ? (
          <p className="mut text-[12.5px]">Comments are closed on a voided auction.</p>
        ) : !me ? (
          <p className="mut text-[12.5px]">
            <Link href={`/login?next=${encodeURIComponent(`/lots/${auctionId}#comments`)}`}>Sign in</Link> to ask a question or comment.
          </p>
        ) : !me.emailVerified ? (
          <p className="mut text-[12.5px]">Confirm your email address to comment.</p>
        ) : (
          <form onSubmit={post} className="flex flex-col gap-2">
            <label htmlFor="comment-body" className="sr-only">
              Your comment
            </label>
            <textarea
              id="comment-body"
              className="input !min-h-[72px]"
              maxLength={1000}
              placeholder="Ask about the lot’s condition, paperwork or collection…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            {error && (
              <p className="err" role="alert">
                {error}
              </p>
            )}
            <div className="flex items-center justify-between gap-3">
              <span className="mut text-[11.5px]">Posting as {me.displayName}. Comments are public and moderated.</span>
              <button className="btn btn-primary" disabled={busy || !body.trim()}>
                {busy ? 'Posting…' : 'Post'}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

function CommentRow({ c, now, onRemoved }: { c: Comment; now: number; onRemoved: () => Promise<void> }) {
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
      setError(err instanceof ApiError ? err.message : 'Couldn’t remove the comment.');
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
          {c.author.isSeller && <span className="tag tag-accent !py-0.5">Seller</span>}
          {c.author.isStaff && (
            <span className="tag tag-neutral !py-0.5">
              <ShieldCheck size={11} aria-hidden /> Moderator
            </span>
          )}
          <span className="mut text-[11.5px]" suppressHydrationWarning>
            {ago(c.at, now)}
          </span>
        </div>
        {c.removed ? (
          <p className="mut mt-1 text-[13px] italic">
            {c.removed.by === 'author' ? 'Removed by the author.' : `Removed by a moderator: ${c.removed.reason}`}
          </p>
        ) : (
          <p className="mt-1 whitespace-pre-line break-words text-[13.5px] leading-[1.55]">{c.body}</p>
        )}
        {c.canRemove && !removing && (
          <button type="button" className="btn btn-ghost mt-1 !px-1 !py-0.5 !text-[12px]" onClick={() => remove(false)}>
            Remove
          </button>
        )}
        {removing && (
          <div className="mt-2 flex flex-col gap-2">
            <input className="input" aria-label="Reason for removal" placeholder="Reason (shown in the thread and audited)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="flex gap-2">
              <button type="button" className="btn btn-danger !py-1.5 !text-[13px]" disabled={reason.trim().length < 5} onClick={() => remove(true)}>
                Remove comment
              </button>
              <button type="button" className="btn btn-secondary !py-1.5 !text-[13px]" onClick={() => setRemoving(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {error && <p className="err">{error}</p>}
      </div>
    </li>
  );
}
