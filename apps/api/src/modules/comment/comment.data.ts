import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Executor } from '@/db';
import { users } from '../auth/auth.schema';
import { auctionComments } from './comment.schema';

export type CommentRow = typeof auctionComments.$inferSelect;

export async function insertComment(ex: Executor, row: typeof auctionComments.$inferInsert) {
  const [created] = await ex.insert(auctionComments).values(row).returning();
  return created;
}

export function commentRows(ex: Executor, auctionId: string) {
  return ex
    .select({ comment: auctionComments, authorName: users.displayName, authorRole: users.role })
    .from(auctionComments)
    .innerJoin(users, eq(users.id, auctionComments.authorId))
    .where(eq(auctionComments.auctionId, auctionId))
    .orderBy(asc(auctionComments.createdAt))
    .limit(500);
}

export async function findComment(ex: Executor, id: string) {
  const [row] = await ex.select().from(auctionComments).where(eq(auctionComments.id, id));
  return row ?? null;
}

/** Only an un-removed comment can be removed, so a race can't overwrite who removed it. */
export async function markRemoved(ex: Executor, id: string, patch: { removedById: string; removalReason: string | null }) {
  const [row] = await ex
    .update(auctionComments)
    .set({ ...patch, removedAt: new Date() })
    .where(and(eq(auctionComments.id, id), isNull(auctionComments.removedAt)))
    .returning();
  return row ?? null;
}
