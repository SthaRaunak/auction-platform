import type { AppealRow, AuditRow, ModerationActionInput, MyModerationAction, ReportInput, ReportRow } from '@bidwell/contract';
import { db, dbNow, type Tx } from '@/db';
import { conflict, forbidden, notFound } from '@/errors';
import { recordAudit } from '../audit/audit.usecase';
import { getAuction, lockAuctionForUpdate, saveAuctionState, type AuctionRow } from '../auction/auction.usecase';
import { requireVerified, type UserRow } from '../auth/auth.usecase';
import { biddersOf, enqueueStateEvent, setModerationNoticeProvider } from '../bid/bid.usecase';
import { kickDrainer } from '../outbox/outbox.drainer';
import { enqueueEvents } from '../outbox/outbox.usecase';
import {
  actionsAgainstSeller,
  appealRows,
  auditRowsWithActor,
  findAppeal,
  findAuditEntry,
  findOpenReport,
  findReport,
  insertAppeal,
  insertReport,
  latestAuditFor,
  reportRows,
  resolveAppealRow,
  resolveOpenReports,
} from './moderation.data';

/** Bidders lose time while a lot is paused; restoring guarantees at least this much is left. */
const RESTORE_MIN_REMAINING_MS = 10 * 60_000;

export function requireStaff(user: UserRow | null | undefined): asserts user is UserRow {
  if (!user || (user.role !== 'moderator' && user.role !== 'admin')) throw forbidden('STAFF_ONLY', 'Moderators only.');
}

// ── reports ─────────────────────────────────────────────────────────────────
export async function reportAuction(user: UserRow, auctionId: string, input: ReportInput) {
  requireVerified(user);
  const auction = await getAuction(auctionId);
  if (auction.sellerId === user.id) throw conflict('OWN_LOT', 'You can’t report your own lot.');
  if (await findOpenReport(db, auctionId, user.id)) throw conflict('ALREADY_REPORTED', 'You’ve already reported this lot — a moderator will look at it.');
  return insertReport(db, { auctionId, reporterId: user.id, reason: input.reason, details: input.details });
}

export async function listReports(staff: UserRow, status: ReportRow['status'] = 'open'): Promise<ReportRow[]> {
  requireStaff(staff);
  const rows = await reportRows(db, status);
  return rows.map(({ report, auction, reporterName }) => ({
    id: report.id,
    auctionId: report.auctionId,
    auctionTitle: auction.title,
    lotNo: auction.lotNo,
    auctionStatus: auction.status,
    auctionHidden: auction.hidden,
    reason: report.reason,
    details: report.details,
    reporterName,
    status: report.status,
    createdAt: report.createdAt.toISOString(),
  }));
}

export async function dismissReport(staff: UserRow, reportId: string, reason: string) {
  requireStaff(staff);
  const report = await findReport(db, reportId);
  if (!report) throw notFound('Report');
  if (report.status !== 'open') throw conflict('REPORT_CLOSED', 'This report has already been handled.');
  await db.transaction(async (tx) => {
    await resolveOpenReports(tx, report.auctionId, 'dismissed', staff.id, report.id);
    await recordAudit(tx, { actorId: staff.id, action: 'report.dismissed', targetType: 'report', targetId: report.id, reason, meta: { auctionId: report.auctionId } });
  });
}

// ── actions ─────────────────────────────────────────────────────────────────
async function restore(tx: Tx, staff: UserRow, a: AuctionRow, reason: string, via: Record<string, unknown> = {}) {
  if (!a.hidden) throw conflict('NOT_HIDDEN', 'This lot isn’t hidden.');
  const now = await dbNow(tx);
  const endsAt = a.status === 'live' && a.endsAt.getTime() - now.getTime() < RESTORE_MIN_REMAINING_MS ? new Date(now.getTime() + RESTORE_MIN_REMAINING_MS) : a.endsAt;
  const updated = await saveAuctionState(tx, a.id, { hidden: false, endsAt, version: a.version + 1 });
  await recordAudit(tx, {
    actorId: staff.id,
    action: 'auction.restored',
    targetType: 'auction',
    targetId: a.id,
    reason,
    meta: { endsAtBefore: a.endsAt.toISOString(), endsAtAfter: endsAt.toISOString(), ...via },
  });
  await enqueueStateEvent(tx, updated, [{ topic: 'auction.restored', aggregateId: a.id, payload: { sellerId: a.sellerId, title: a.title, reason } }]);
  return updated;
}

/**
 * Takedown (E6). `hide` freezes a live lot pending review. `void` is final:
 * the auction is voided, every bid stays in the ledger untouched (void is a
 * property of the auction, not an edit to bids), deposits are refunded, all
 * bidders and the seller are told why, and the reason is published.
 */
export async function moderateAuction(staff: UserRow, auctionId: string, input: ModerationActionInput) {
  requireStaff(staff);
  const updated = await db.transaction(async (tx) => {
    const a = await lockAuctionForUpdate(tx, auctionId);
    if (!a) throw notFound('Auction');
    if (input.reportId) {
      const report = await findReport(tx, input.reportId);
      if (!report || report.auctionId !== auctionId) throw notFound('Report');
    }

    let result: AuctionRow;
    if (input.action === 'hide') {
      if (a.status !== 'live') throw conflict('AUCTION_ENDED', 'Only live lots can be hidden.');
      if (a.hidden) throw conflict('ALREADY_HIDDEN', 'This lot is already hidden.');
      result = await saveAuctionState(tx, a.id, { hidden: true, version: a.version + 1 });
      await recordAudit(tx, { actorId: staff.id, action: 'auction.hidden', targetType: 'auction', targetId: a.id, reason: input.reason, meta: { reportId: input.reportId ?? null } });
      await enqueueStateEvent(tx, result, [{ topic: 'auction.hidden', aggregateId: a.id, payload: { sellerId: a.sellerId, title: a.title, reason: input.reason } }]);
    } else if (input.action === 'restore') {
      result = await restore(tx, staff, a, input.reason);
    } else {
      if (a.status === 'voided') throw conflict('ALREADY_VOIDED', 'This auction is already void.');
      const now = await dbNow(tx);
      result = await saveAuctionState(tx, a.id, {
        status: 'voided',
        hidden: false,
        voidedAt: now,
        voidReason: input.reason,
        winnerId: null,
        finalPrice: null,
        version: a.version + 1,
      });
      const bidderIds = await biddersOf(tx, a.id);
      await recordAudit(tx, {
        actorId: staff.id,
        action: 'auction.voided',
        targetType: 'auction',
        targetId: a.id,
        reason: input.reason,
        meta: { previousStatus: a.status, previousWinnerId: a.winnerId, bidCount: a.bidCount, reportId: input.reportId ?? null },
      });
      await enqueueStateEvent(tx, result, [
        { topic: 'auction.voided', aggregateId: a.id, payload: { sellerId: a.sellerId, title: a.title, reason: input.reason, bidderIds } },
      ]);
    }
    if (input.action !== 'restore') await resolveOpenReports(tx, a.id, 'actioned', staff.id);
    return result;
  });
  kickDrainer();
  return updated;
}

// ── audit & appeals ─────────────────────────────────────────────────────────
export async function listAudit(staff: UserRow): Promise<AuditRow[]> {
  requireStaff(staff);
  const rows = await auditRowsWithActor(db, 200);
  return rows.map(({ entry, actorName }) => ({
    id: entry.id,
    actorName: actorName ?? 'System',
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    reason: entry.reason,
    meta: entry.meta,
    at: entry.createdAt.toISOString(),
  }));
}

export async function myModerationActions(user: UserRow): Promise<MyModerationAction[]> {
  const rows = await actionsAgainstSeller(db, user.id);
  return rows.map(({ entry, auctionTitle, appeal }) => ({
    id: entry.id,
    auctionId: entry.targetId,
    auctionTitle,
    action: entry.action,
    reason: entry.reason,
    at: entry.createdAt.toISOString(),
    appeal: appeal ? { status: appeal.status, resolutionNote: appeal.resolutionNote } : null,
  }));
}

export async function fileAppeal(user: UserRow, input: { actionId: string; text: string }) {
  const entry = await findAuditEntry(db, input.actionId);
  if (!entry || entry.targetType !== 'auction' || !['auction.hidden', 'auction.voided'].includes(entry.action)) throw notFound('Moderation action');
  const auction = await getAuction(entry.targetId);
  if (auction.sellerId !== user.id) throw forbidden('NOT_SELLER', 'Only the seller can appeal this decision.');
  const appeal = await insertAppeal(db, { auditId: entry.id, appellantId: user.id, text: input.text });
  if (!appeal) throw conflict('ALREADY_APPEALED', 'You’ve already appealed this decision.');
  return appeal;
}

export async function listAppeals(staff: UserRow, status: AppealRow['status'] = 'open'): Promise<AppealRow[]> {
  requireStaff(staff);
  const rows = await appealRows(db, status);
  return rows.map(({ appeal, entry, auctionTitle, auctionId, sellerName }) => ({
    id: appeal.id,
    actionId: entry.id,
    auctionId,
    auctionTitle,
    action: entry.action,
    actionReason: entry.reason,
    sellerName,
    text: appeal.text,
    status: appeal.status,
    resolutionNote: appeal.resolutionNote,
    createdAt: appeal.createdAt.toISOString(),
  }));
}

/**
 * Four-eyes rule: the moderator who took the action can't rule on its appeal.
 * Overturning a hide restores the lot. A void can't be undone — bidders were
 * already released — so an overturned void is recorded and the seller relists.
 */
export async function resolveAppeal(staff: UserRow, appealId: string, input: { decision: 'upheld' | 'overturned'; note: string }) {
  requireStaff(staff);
  const appeal = await findAppeal(db, appealId);
  if (!appeal) throw notFound('Appeal');
  const entry = (await findAuditEntry(db, appeal.auditId))!;
  if (entry.actorId === staff.id) throw forbidden('SAME_MODERATOR', 'A different moderator must review an appeal of your own decision.');

  await db.transaction(async (tx) => {
    const resolved = await resolveAppealRow(tx, appealId, { status: input.decision, resolvedById: staff.id, resolutionNote: input.note });
    if (!resolved) throw conflict('APPEAL_CLOSED', 'This appeal has already been decided.');
    await recordAudit(tx, {
      actorId: staff.id,
      action: `appeal.${input.decision}`,
      targetType: 'appeal',
      targetId: appealId,
      reason: input.note,
      meta: { auditId: entry.id, auctionId: entry.targetId, originalAction: entry.action },
    });
    if (input.decision === 'overturned' && entry.action === 'auction.hidden') {
      const a = await lockAuctionForUpdate(tx, entry.targetId);
      if (a?.hidden) await restore(tx, staff, a, `Decision overturned on appeal: ${input.note}`, { appealId });
    }
    const a = await getAuction(entry.targetId, tx);
    await enqueueEvents(tx, [
      { topic: 'appeal.resolved', aggregateId: a.id, payload: { sellerId: a.sellerId, title: a.title, decision: input.decision, note: input.note } },
    ]);
  });
  kickDrainer();
}

/** Public notice shown on a hidden or voided lot. */
async function moderationNotice(a: AuctionRow) {
  if (a.status === 'voided') return { kind: 'voided' as const, reason: a.voidReason ?? '', at: (a.voidedAt ?? a.updatedAt).toISOString() };
  if (a.hidden) {
    const entry = await latestAuditFor(db, a.id, 'auction.hidden');
    return { kind: 'hidden' as const, reason: entry?.reason ?? 'Under review', at: (entry?.createdAt ?? a.updatedAt).toISOString() };
  }
  return null;
}

export function registerModeration() {
  setModerationNoticeProvider(moderationNotice);
}
