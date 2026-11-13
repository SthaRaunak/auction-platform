import { randomUUID } from 'node:crypto';
import type { PaymentGateway } from '../ports/paymentGateway';

export function createStubPaymentGateway(opts: { quiet?: boolean } = {}): PaymentGateway {
  const log = (msg: string) => !opts.quiet && console.log(`[payments:stub] ${msg}`);
  return {
    async hold({ userId, amount, currency, reference }) {
      const gatewayRef = `stub_${randomUUID()}`;
      log(`hold ${amount} ${currency} for ${userId} (${reference}) → ${gatewayRef}`);
      return { gatewayRef };
    },
    async refund(ref) {
      log(`refund ${ref}`);
    },
    async capture(ref) {
      log(`capture ${ref}`);
    },
  };
}
