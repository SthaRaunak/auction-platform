import { db, type Executor } from '@/db';
import { deps } from '@/deps';
import { badRequest, conflict, forbidden, notFound } from '@/errors';
import type { DomainEvent } from '@/ports/eventPublisher';
import { recordAudit } from '../audit/audit.usecase';
import { getAuction } from '../auction/auction.usecase';
import { requireVerified, type UserRow } from '../auth/auth.usecase';
import { depositsForAuction, findDeposit, findDepositById, insertDeposit, transitionDeposit } from './payment.data';

// EMD lifecycle (E9, docs/payments.md): held → applied (winner) | refunded (others,
// or everyone on void) ; applied → forfeited if the winner defaults.

export async function hasHeldDeposit(ex: Executor, auctionId: string, userId: string) {
  const d = await findDeposit(ex, auctionId, userId);
  return d?.status === 'held';
}

export async function payDeposit(user: UserRow, auctionId: string) {
  requireVerified(user);
  const auction = await getAuction(auctionId);
  if (!auction.emdAmount) throw badRequest('NO_DEPOSIT_REQUIRED', 'This auction doesn’t require a deposit.');
  if (auction.status !== 'live') throw conflict('AUCTION_ENDED', 'This auction has ended.');
  if (auction.sellerId === user.id) throw forbidden('SELLER_CANNOT_BID', 'Sellers cannot bid on their own lots.');

  const existing = await findDeposit(db, auctionId, user.id);
  if (existing) return existing;

  const { gatewayRef } = await deps.payments.hold({ userId: user.id, amount: auction.emdAmount, currency: auction.currency, reference: `emd:${auctionId}` });
  const created = await insertDeposit(db, { auctionId, userId: user.id, amount: auction.emdAmount, currency: auction.currency, gatewayRef });
  if (!created) {
    // Lost a race with a concurrent request for the same deposit: release our hold.
    await deps.payments.refund(gatewayRef);
    return (await findDeposit(db, auctionId, user.id))!;
  }
  return created;
}

async function settle(auctionId: string, winnerId: string | null) {
  for (const d of await depositsForAuction(db, auctionId)) {
    if (d.status !== 'held') continue;
    if (d.userId === winnerId) {
      await transitionDeposit(db, d.id, 'held', 'applied');
    } else if (await transitionDeposit(db, d.id, 'held', 'refunded')) {
      await deps.payments.refund(d.gatewayRef);
    }
  }
}

/** Winner defaulted on payment: their deposit is forfeited. Admin-only and audited. */
export async function forfeitDeposit(actor: UserRow, depositId: string, reason: string) {
  if (actor.role !== 'admin') throw forbidden('ADMIN_ONLY', 'Only admins can forfeit deposits.');
  const d = await findDepositById(db, depositId);
  if (!d) throw notFound('Deposit');
  await db.transaction(async (tx) => {
    if (!(await transitionDeposit(tx, d.id, 'applied', 'forfeited'))) {
      throw conflict('DEPOSIT_NOT_APPLIED', 'Only a winner’s applied deposit can be forfeited.');
    }
    await recordAudit(tx, { actorId: actor.id, action: 'deposit.forfeited', targetType: 'deposit', targetId: d.id, reason, meta: { auctionId: d.auctionId, amount: d.amount } });
  });
  await deps.payments.capture(d.gatewayRef);
}

/** Settlement is driven by committed outbox events, so it can't run for a close that rolled back. */
export function registerPaymentSubscribers() {
  return deps.events.subscribe(async (e: DomainEvent) => {
    if (e.topic === 'auction.closed') await settle(e.aggregateId, (e.payload.winnerId as string | null) ?? null);
    if (e.topic === 'auction.voided') await settle(e.aggregateId, null);
  });
}
