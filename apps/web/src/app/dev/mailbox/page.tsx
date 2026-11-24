import type { MailItem } from '@bidwell/contract';
import { notFound } from 'next/navigation';
import { getI18n } from '@/i18n/server';
import { apiGet } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t('meta.mailbox') };
}

const linkify = (text: string) =>
  text.split(/(https?:\/\/\S+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part.replace(/^https?:\/\/[^/]+/, '')}>
        {part}
      </a>
    ) : (
      part
    ),
  );

/** Shows what the console EmailSender adapter "sent" — verification and reset links included. Never in production. */
export default async function Mailbox() {
  if (process.env.NODE_ENV === 'production') notFound();
  const [{ items }, { t, rich, fullStamp }] = await Promise.all([apiGet<{ items: MailItem[] }>('/dev/mailbox'), getI18n()]);
  return (
    <div className="mx-auto max-w-[860px] px-6 py-8">
      <h1 className="ttl text-[32px]">{t('mailbox.title')}</h1>
      <p className="mut mt-2 text-[14px]">{t('mailbox.lead')}</p>
      <ul className="mt-6 flex flex-col gap-3">
        {items.length === 0 && <li className="mut">{t('mailbox.empty')}</li>}
        {items.map((m, i) => (
          <li key={i} className="card !gap-1.5 !p-4">
            <div className="flex flex-wrap justify-between gap-2 text-[12px]">
              <span>{rich('mailbox.to', { b: (s) => <strong>{s}</strong> }, { to: m.to })}</span>
              <span className="mut">{fullStamp(m.at)}</span>
            </div>
            <div className="font-medium">{m.subject}</div>
            <pre className="whitespace-pre-wrap font-sans text-[13px] leading-[1.55]">{linkify(m.text)}</pre>
          </li>
        ))}
      </ul>
    </div>
  );
}
