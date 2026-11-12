import { desc } from 'drizzle-orm';
import type { Executor } from '@/db';
import { auditLog } from './audit.schema';

export type NewAuditEntry = typeof auditLog.$inferInsert;

export async function insertAuditEntry(ex: Executor, entry: NewAuditEntry) {
  const [row] = await ex.insert(auditLog).values(entry).returning();
  return row;
}

export function listAuditEntries(ex: Executor, limit: number) {
  return ex.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit);
}
