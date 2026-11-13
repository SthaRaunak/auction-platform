import { and, eq } from 'drizzle-orm';
import type { Executor } from '@/db';
import { deposits } from './payment.schema';

export type DepositRow = typeof deposits.$inferSelect;
type DepositStatus = DepositRow['status'];

export async function findDeposit(ex: Executor, auctionId: string, userId: string) {
  const [row] = await ex.select().from(deposits).where(and(eq(deposits.auctionId, auctionId), eq(deposits.userId, userId)));
  return row ?? null;
}

export async function findDepositById(ex: Executor, id: string) {
  const [row] = await ex.select().from(deposits).where(eq(deposits.id, id));
  return row ?? null;
}

export async function insertDeposit(ex: Executor, row: typeof deposits.$inferInsert) {
  const [created] = await ex.insert(deposits).values(row).onConflictDoNothing().returning();
  return created ?? null;
}

/** Transition only from `from` — concurrent settlements can't double-refund. */
export async function transitionDeposit(ex: Executor, id: string, from: DepositStatus, to: DepositStatus) {
  const [row] = await ex
    .update(deposits)
    .set({ status: to, updatedAt: new Date() })
    .where(and(eq(deposits.id, id), eq(deposits.status, from)))
    .returning();
  return row ?? null;
}

export function depositsForAuction(ex: Executor, auctionId: string) {
  return ex.select().from(deposits).where(eq(deposits.auctionId, auctionId));
}
