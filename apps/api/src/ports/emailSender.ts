export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/** Console adapter in dev (C3); swap for Resend/SES without touching use-cases. */
export interface EmailSender {
  send(mail: Mail): Promise<void>;
}
