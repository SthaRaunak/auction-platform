import type { MailItem } from '@bidwell/contract';
import { notFound } from 'next/navigation';
import { fullStamp } from '@/lib/format';
import { apiGet } from '@/lib/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dev mailbox' };

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
  const { items } = await apiGet<{ items: MailItem[] }>('/dev/mailbox');
  return (
    <div className="mx-auto max-w-[860px] px-6 py-8">
      <h1 className="ttl text-[32px]">Dev mailbox</h1>
      <p className="mut mt-2 text-[14px]">The last 50 emails from the console EmailSender adapter (since the API last restarted).</p>
      <ul className="mt-6 flex flex-col gap-3">
        {items.length === 0 && <li className="mut">No mail yet.</li>}
        {items.map((m, i) => (
          <li key={i} className="card !gap-1.5 !p-4">
            <div className="flex flex-wrap justify-between gap-2 text-[12px]">
              <span>
                To <strong>{m.to}</strong>
              </span>
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
