import type { MailItem } from '@bidwell/contract';
import type { EmailSender } from '../ports/emailSender';

/** Prints mail to stdout and keeps the last 50 for the dev mailbox page. */
export function createConsoleEmailSender(opts: { quiet?: boolean } = {}): EmailSender & { outbox: MailItem[] } {
  const outbox: MailItem[] = [];
  return {
    outbox,
    async send(mail) {
      outbox.unshift({ ...mail, at: new Date().toISOString() });
      outbox.length = Math.min(outbox.length, 50);
      if (!opts.quiet) console.log(`\n✉️  To: ${mail.to}\n   Subject: ${mail.subject}\n   ${mail.text.replace(/\n/g, '\n   ')}\n`);
    },
  };
}
