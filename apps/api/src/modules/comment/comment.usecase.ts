import type { Comment } from '@bidwell/contract';
import { db } from '@/db';
import { badRequest, conflict, forbidden, notFound } from '@/errors';
import { recordAudit } from '../audit/audit.usecase';
import { getAuction } from '../auction/auction.usecase';
import { initialsOf, requireVerified, type UserRow } from '../auth/auth.usecase';
import { kickDrainer } from '../outbox/outbox.drainer';
import { enqueueEvents } from '../outbox/outbox.usecase';
import { commentRows, findComment, insertComment, markRemoved } from './comment.data';

const isStaff = (u: Pick<UserRow, 'role'> | null) => u?.role === 'moderator' || u?.role === 'admin';

export async function listComments(auctionId: string, viewer: UserRow | null): Promise<Comment[]> {
  const a = await getAuction(auctionId);
  const rows = await commentRows(db, auctionId);
  return rows.map(({ comment: c, authorName, authorRole }) => ({
    id: c.id,
    author: { id: c.authorId, displayName: authorName, initials: initialsOf(authorName), isSeller: c.authorId === a.sellerId, isStaff: isStaff({ role: authorRole }) },
    body: c.removedAt ? '' : c.body,
    at: c.createdAt.toISOString(),
    removed: c.removedAt
      ? { by: c.removedById === c.authorId ? 'author' : 'moderator', reason: c.removedById === c.authorId ? null : c.removalReason, at: c.removedAt.toISOString() }
      : null,
    canRemove: !c.removedAt && viewer !== null && (viewer.id === c.authorId || isStaff(viewer)),
  }));
}

/** Verified users only. Open while the lot is live or closed; a voided lot's thread is closed. */
export async function postComment(user: UserRow, auctionId: string, body: string) {
  requireVerified(user);
  const a = await getAuction(auctionId);
  if (a.status === 'voided') throw conflict('COMMENTS_CLOSED', 'Comments are closed on a voided auction.');
  const created = await db.transaction(async (tx) => {
    const c = await insertComment(tx, { auctionId, authorId: user.id, body });
    if (user.id !== a.sellerId) {
      await enqueueEvents(tx, [{ topic: 'auction.commented', aggregateId: auctionId, payload: { sellerId: a.sellerId, title: a.title, authorName: user.displayName } }]);
    }
    return c;
  });
  kickDrainer();
  return created;
}

/** Authors can withdraw their own comment. A moderator removing someone else's must give a reason, which is audited and shown. */
export async function removeComment(user: UserRow, commentId: string, reason: string | undefined) {
  const c = await findComment(db, commentId);
  if (!c) throw notFound('Comment');
  if (c.removedAt) throw conflict('ALREADY_REMOVED', 'This comment has already been removed.');
  const own = c.authorId === user.id;
  if (!own && !isStaff(user)) throw forbidden('NOT_AUTHOR', 'You can only remove your own comments.');
  if (!own && (!reason || reason.length < 5)) throw badRequest('REASON_REQUIRED', 'Give a reason for removing this comment.');

  await db.transaction(async (tx) => {
    const removed = await markRemoved(tx, c.id, { removedById: user.id, removalReason: own ? null : reason! });
    if (!removed) throw conflict('ALREADY_REMOVED', 'This comment has already been removed.');
    if (!own) {
      await recordAudit(tx, { actorId: user.id, action: 'comment.removed', targetType: 'comment', targetId: c.id, reason: reason!, meta: { auctionId: c.auctionId, authorId: c.authorId } });
    }
  });
}
