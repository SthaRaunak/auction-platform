import { BUYER_PREMIUM_BPS } from '@bidwell/contract';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('meta.help') };
}

// Section ids double as URL anchors (#transparency is linked from the footer).
const SECTIONS = [
  { id: 'proxy', key: 'proxy', paragraphs: ['p1', 'p2', 'p3'] },
  { id: 'increments', key: 'increments', paragraphs: ['p1'] },
  { id: 'soft-close', key: 'softClose', paragraphs: ['p1', 'p2'] },
  { id: 'transparency', key: 'transparency', paragraphs: ['p1', 'p2'] },
  { id: 'edits', key: 'edits', paragraphs: ['p1'] },
  { id: 'deposits', key: 'deposits', paragraphs: ['p1', 'p2'] },
  { id: 'moderation', key: 'moderation', paragraphs: ['p1', 'p2'] },
  { id: 'language', key: 'language', paragraphs: ['p1'] },
] as const;

type SectionKey = (typeof SECTIONS)[number]['key'];
type Paragraph<K extends SectionKey> = Extract<(typeof SECTIONS)[number], { key: K }>['paragraphs'][number];

export default async function HowBiddingWorks() {
  const { t, num } = await getI18n();
  const text = <K extends SectionKey>(key: K, part: 'short' | 'title' | Paragraph<K>) =>
    t(`help.sections.${key}.${part}` as Parameters<typeof t>[0], { fee: num(BUYER_PREMIUM_BPS / 100) });
  return (
    <div className="mx-auto max-w-[760px] px-6 py-10">
      <div className="k">{t('help.kicker')}</div>
      <h1 className="ttl mt-2 text-[40px]">{t('help.title')}</h1>
      <p className="mut mt-3 text-[15px]">{t('help.lead')}</p>
      <nav aria-label={t('help.onThisPage')} className="mt-6 flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="pill">
            {text(s.key, 'short')}
          </a>
        ))}
      </nav>
      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} className="mt-9 scroll-mt-24">
          <h2 className="ttl text-[22px]">{text(s.key, 'title')}</h2>
          {s.paragraphs.map((p) => (
            <p key={p} className="mt-3 text-[14.5px] leading-[1.65]">
              {text(s.key, p)}
            </p>
          ))}
        </section>
      ))}
      <Link href="/" className="btn btn-primary mt-10">
        {t('common.browseLive')}
      </Link>
    </div>
  );
}
