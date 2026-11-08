import type { ChainVerification } from '@bidwell/contract';
import { sha256 } from '@/infra/tokens';

// Per-auction hash chain over the bid ledger (E2). Each row commits to the
// previous row's hash, so editing, deleting or reordering any bid breaks every
// hash after it. Pure functions — verification needs nothing but the rows.

export interface ChainFields {
  auctionId: string;
  seq: number;
  bidderId: string;
  maxAmount: number;
  priceAfter: number;
  leaderAfterId: string;
  idempotencyKey: string;
  createdAt: Date;
}

export const genesisHash = (auctionId: string) => sha256(`bidwell:genesis:${auctionId}`);

export function hashBid(prevHash: string, f: ChainFields): string {
  return sha256(
    JSON.stringify([prevHash, f.auctionId, f.seq, f.bidderId, f.maxAmount, f.priceAfter, f.leaderAfterId, f.idempotencyKey, f.createdAt.toISOString()]),
  );
}

export function verifyChain(auctionId: string, rows: (ChainFields & { prevHash: string; hash: string })[]): ChainVerification {
  let prev = genesisHash(auctionId);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.seq !== i + 1 || r.prevHash !== prev || hashBid(prev, r) !== r.hash) {
      return { valid: false, checked: i, headHash: rows.at(-1)?.hash ?? null, brokenAtSeq: i + 1 };
    }
    prev = r.hash;
  }
  return { valid: true, checked: rows.length, headHash: rows.at(-1)?.hash ?? null, brokenAtSeq: null };
}
