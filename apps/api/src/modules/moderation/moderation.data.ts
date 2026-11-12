import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Executor } from '@/db';
import { auctions } from '../auction/auction.schema';
import { auditLog } from '../audit/audit.schema';
import { users } from '../auth/auth.schema';
import { appeals, reports } from './moderation.schema';

// audit_log.target_id is text (targets aren't all uuids), so compare as text.
const auditTargetsAuction = sql`${auctions.id}::text = ${auditLog.targetId}`;
const seller = alias(users, 'seller');

export async function insertReport(ex: Executor, row: typeof reports.$inferInsert) {
  const [created] = await ex.insert(reports).values(row).returning();
  return created;
}

export async function findOpenReport(ex: Executor, auctionId: string, reporterId: string) {
  const [row] = await ex
    .select()
    .from(reports)
    .where(and(eq(reports.auctionId, auctionId), eq(reports.reporterId, reporterId), eq(reports.status, 'open')));
  return row ?? null;
}

export async function findReport(ex: Executor, id: string) {
  const [row] = await ex.select().from(reports).where(eq(reports.id, id));
  return row ?? null;
}

export function reportRows(ex: Executor, status: 'open' | 'actioned' | 'dismissed') {
  return ex
    .select({ report: reports, auction: { title: auctions.title, lotNo: auctions.lotNo, status: auctions.status, hidden: auctions.hidden }, reporterName: users.displayName })
    .from(reports)
    .innerJoin(auctions, eq(auctions.id, reports.auctionId))
    .innerJoin(users, eq(users.id, reports.reporterId))
    .where(eq(reports.status, status))
    .orderBy(desc(reports.createdAt))
    .limit(200);
}

export async function resolveOpenReports(ex: Executor, auctionId: string, status: 'actioned' | 'dismissed', resolvedById: string, onlyId?: string) {
  await ex
    .update(reports)
    .set({ status, resolvedById, resolvedAt: new Date() })
    .where(and(eq(reports.auctionId, auctionId), eq(reports.status, 'open'), onlyId ? eq(reports.id, onlyId) : undefined));
}

export function auditRowsWithActor(ex: Executor, limit: number) {
  return ex
    .select({ entry: auditLog, actorName: users.displayName })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

export async function findAuditEntry(ex: Executor, id: string) {
  const [row] = await ex.select().from(auditLog).where(eq(auditLog.id, id));
  return row ?? null;
}

export async function latestAuditFor(ex: Executor, targetId: string, action: string) {
  const [row] = await ex
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.targetType, 'auction'), eq(auditLog.targetId, targetId), eq(auditLog.action, action)))
    .orderBy(desc(auditLog.createdAt))
    .limit(1);
  return row ?? null;
}

/** Moderation actions taken against a seller's lots, with any appeal. */
export function actionsAgainstSeller(ex: Executor, sellerId: string) {
  return ex
    .select({ entry: auditLog, auctionTitle: auctions.title, appeal: appeals })
    .from(auditLog)
    .innerJoin(auctions, auditTargetsAuction)
    .leftJoin(appeals, eq(appeals.auditId, auditLog.id))
    .where(and(eq(auditLog.targetType, 'auction'), eq(auctions.sellerId, sellerId), inArray(auditLog.action, ['auction.hidden', 'auction.voided'])))
    .orderBy(desc(auditLog.createdAt));
}

export async function insertAppeal(ex: Executor, row: typeof appeals.$inferInsert) {
  const [created] = await ex.insert(appeals).values(row).onConflictDoNothing().returning();
  return created ?? null;
}

export async function findAppeal(ex: Executor, id: string) {
  const [row] = await ex.select().from(appeals).where(eq(appeals.id, id));
  return row ?? null;
}

export async function resolveAppealRow(ex: Executor, id: string, patch: Pick<typeof appeals.$inferInsert, 'status' | 'resolvedById' | 'resolutionNote'>) {
  const [row] = await ex
    .update(appeals)
    .set({ ...patch, resolvedAt: new Date() })
    .where(and(eq(appeals.id, id), eq(appeals.status, 'open')))
    .returning();
  return row ?? null;
}


export function appealRows(ex: Executor, status: 'open' | 'upheld' | 'overturned') {
  return ex
    .select({ appeal: appeals, entry: auditLog, auctionTitle: auctions.title, auctionId: auctions.id, sellerName: seller.displayName })
    .from(appeals)
    .innerJoin(auditLog, eq(auditLog.id, appeals.auditId))
    .innerJoin(auctions, auditTargetsAuction)
    .innerJoin(seller, eq(seller.id, appeals.appellantId))
    .where(eq(appeals.status, status))
    .orderBy(desc(appeals.createdAt));
}
