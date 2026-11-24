import type { AppealRow, AuditRow, ReportRow } from '@bidwell/contract';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppealCard, ReportCard } from '@/components/account/ModerationConsole';
import { getI18n } from '@/i18n/server';
import { apiGet, getMe } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('meta.moderation') };
}

const TABS = [
  { id: 'reports', label: 'moderation.tabReports' },
  { id: 'handled', label: 'moderation.tabHandled' },
  { id: 'appeals', label: 'moderation.tabAppeals' },
  { id: 'audit', label: 'moderation.tabAudit' },
] as const;

export default async function ModerationPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login?next=/moderation');
  if (me.role !== 'moderator' && me.role !== 'admin') notFound();
  const requested = (await searchParams).tab;
  const tab = TABS.find((x) => x.id === requested)?.id ?? 'reports';
  const { t } = await getI18n();

  return (
    <div className="mx-auto max-w-[1040px] px-6 py-8">
      <h1 className="ttl text-[34px]">{t('moderation.title')}</h1>
      <p className="mut mt-2 text-[14px]">{t('moderation.lead')}</p>
      <div className="mt-5 flex flex-wrap gap-1.5 border-b border-divider" role="tablist">
        {TABS.map((x) => (
          <Link key={x.id} href={`/moderation?tab=${x.id}`} role="tab" aria-selected={tab === x.id} className="tab">
            {t(x.label)}
          </Link>
        ))}
      </div>
      <div className="pt-6">
        {(tab === 'reports' || tab === 'handled') && <Reports status={tab === 'reports' ? 'open' : 'actioned'} />}
        {tab === 'appeals' && <Appeals />}
        {tab === 'audit' && <Audit />}
      </div>
    </div>
  );
}

async function Reports({ status }: { status: 'open' | 'actioned' }) {
  const [{ items }, { t }] = await Promise.all([apiGet<{ items: ReportRow[] }>(`/moderation/reports?status=${status}`), getI18n()]);
  if (!items.length) return <p className="mut">{t(status === 'open' ? 'moderation.noOpen' : 'moderation.noHandled')}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {items.map((r) => (
        <ReportCard key={r.id} r={r} />
      ))}
    </ul>
  );
}

async function Appeals() {
  const [open, upheld, overturned] = await Promise.all(
    (['open', 'upheld', 'overturned'] as const).map((s) => apiGet<{ items: AppealRow[] }>(`/moderation/appeals?status=${s}`)),
  );
  const all = [...open.items, ...upheld.items, ...overturned.items];
  const { t } = await getI18n();
  if (!all.length) return <p className="mut">{t('moderation.noAppeals')}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {all.map((a) => (
        <AppealCard key={a.id} a={a} />
      ))}
    </ul>
  );
}

async function Audit() {
  const [{ items }, { t, fullStamp }] = await Promise.all([apiGet<{ items: AuditRow[] }>('/moderation/audit'), getI18n()]);
  return (
    <div className="overflow-x-auto">
      <table className="table min-w-[760px]">
        <thead>
          <tr>
            <th scope="col">{t('moderation.colWhen')}</th>
            <th scope="col">{t('moderation.colActor')}</th>
            <th scope="col">{t('moderation.colAction')}</th>
            <th scope="col">{t('moderation.colTarget')}</th>
            <th scope="col">{t('moderation.colReason')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.id}>
              <td className="mut whitespace-nowrap">{fullStamp(a.at)}</td>
              <td>{a.actorName}</td>
              <td>
                <code className="text-[12px]">{a.action}</code>
              </td>
              <td>{a.targetType === 'auction' ? <Link href={`/lots/${a.targetId}`}>{t('moderation.auction')}</Link> : <span className="mut">{a.targetType}</span>}</td>
              <td>{a.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
