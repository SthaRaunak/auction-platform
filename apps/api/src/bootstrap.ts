import { registerModeration } from './modules/moderation/moderation.usecase';
import { registerNotifications } from './modules/notification/notification.usecase';
import { registerPaymentSubscribers } from './modules/payment/payment.usecase';

let done = false;

/** Wires the outbox consumers (notifications, deposit settlement) and the moderation notice provider. Idempotent. */
export function registerSubscribers() {
  if (done) return;
  done = true;
  registerModeration();
  registerNotifications();
  registerPaymentSubscribers();
}
