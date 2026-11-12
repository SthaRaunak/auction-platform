import type { Executor } from '@/db';
import { insertAuditEntry, listAuditEntries, type NewAuditEntry } from './audit.data';

/** Record a privileged action. Call inside the same transaction as the action itself. */
export function recordAudit(ex: Executor, entry: NewAuditEntry) {
  return insertAuditEntry(ex, entry);
}

export function recentAudit(ex: Executor, limit = 100) {
  return listAuditEntries(ex, limit);
}
