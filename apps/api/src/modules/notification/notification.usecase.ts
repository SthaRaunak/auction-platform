import { formatMoney } from '@bidwell/contract';
import { config } from '@/config';
import { db } from '@/db';
import { deps } from '@/deps';
import type { DomainEvent } from '@/ports/eventPublisher';
import { watchersOf } from '../auction/auction.usecase';
import { getUserNames } from '../auth/auth.usecase';
import { biddersOf } from '../bid/bid.usecase';

// Turns committed domain events into email (via the EmailSender port). Runs
// off the outbox, so a rolled-back bid never sends an "outbid" email.

const lotUrl = (id: string) => `${config.APP_ORIGIN}/lots/${id}`;

async function mail(userIds: string[], subject: string, text: string) {
  const users = await getUserNames(userIds);
  for (const u of users.values()) await deps.email.send({ to: u.email, subject, text: `Hi ${u.displayName},\n\n${text}` });
}

async function handle(e: DomainEvent) {
  const p = e.payload as Record<string, any>;
  const url = lotUrl(e.aggregateId);
  switch (e.topic) {
    case 'auction.outbid':
      return mail([p.userId], `You've been outbid on ${p.title}`, `Someone's maximum beat yours. The current bid is ${formatMoney(p.price)}.\n${url}`);
    case 'auction.closed': {
      const losers = (p.bidderIds as string[]).filter((id) => id !== p.winnerId);
      if (p.winnerId) {
        await mail([p.winnerId], `You won ${p.title}`, `Congratulations — you won at ${formatMoney(p.finalPrice)}. Payment is due within 48 hours.\n${url}`);
        await mail([p.sellerId], `${p.title} sold for ${formatMoney(p.finalPrice)}`, `Your lot sold. The full result and bid log are published here:\n${url}`);
      } else {
        const why = p.bidderIds.length ? 'the reserve price wasn’t met' : 'there were no bids';
        await mail([p.sellerId], `${p.title} ended unsold`, `Your auction ended unsold because ${why}.\n${url}`);
      }
      return mail(losers, `${p.title} has ended`, `This auction has ended and you didn't win. Any deposit you paid is being refunded.\n${url}`);
    }
    case 'auction.voided':
      return mail(
        [...new Set([p.sellerId, ...p.bidderIds])],
        `${p.title} was voided`,
        `A moderator voided this auction. All bids are void and deposits are refunded.\nReason: ${p.reason}\n${url}`,
      );
    case 'auction.hidden':
      return mail([p.sellerId], `${p.title} is paused for review`, `A moderator paused your lot.\nReason: ${p.reason}\nYou can appeal from your account page.\n${url}`);
    case 'auction.restored':
      return mail([p.sellerId], `${p.title} is live again`, `Your lot has been restored.\nNote: ${p.reason}\n${url}`);
    case 'auction.commented':
      return mail([p.sellerId], `New comment on ${p.title}`, `${p.authorName} commented on your lot. Reply on the lot page so every bidder sees the answer:\n${url}#comments`);
    case 'appeal.resolved':
      return mail([p.sellerId], `Your appeal on ${p.title} was ${p.decision === 'overturned' ? 'successful' : 'not upheld'}`, `${p.note}\n${url}`);
    case 'auction.amended': {
      if (!p.afterBids) return;
      const people = new Set([...(await watchersOf(db, e.aggregateId)), ...(await biddersOf(db, e.aggregateId))]);
      return mail([...people], `${p.title} was amended`, `The seller updated: ${(p.fields as string[]).join(', ')}. See the amendment log:\n${url}`);
    }
  }
}

export function registerNotifications() {
  return deps.events.subscribe(handle);
}
