import { config } from './config';
import { createConsoleEmailSender } from './infra/consoleEmail';
import { createMemoryPublisher } from './infra/memoryPublisher';
import { createStubPaymentGateway } from './infra/stubPaymentGateway';
import { systemClock, type Clock } from './ports/clock';
import type { EmailSender } from './ports/emailSender';
import type { EventPublisher } from './ports/eventPublisher';
import type { PaymentGateway } from './ports/paymentGateway';

const quiet = config.NODE_ENV === 'test';
const mail = createConsoleEmailSender({ quiet });

/** The four ports and their adapters. Tests overwrite fields directly. */
export const deps: {
  clock: Clock;
  events: EventPublisher;
  email: EmailSender;
  payments: PaymentGateway;
  /** Recent mail for the dev mailbox (console adapter only). */
  mailbox: typeof mail.outbox;
} = {
  clock: systemClock,
  events: createMemoryPublisher(),
  email: mail,
  payments: createStubPaymentGateway({ quiet }),
  mailbox: mail.outbox,
};
