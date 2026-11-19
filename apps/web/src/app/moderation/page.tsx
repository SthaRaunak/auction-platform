import type { AppealRow, AuditRow, ReportRow } from '@bidwell/contract';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppealCard, ReportCard } from '@/components/account/ModerationConsole';
import { fullStamp } from '@/lib/format';
import { apiGet, getMe } from '@/lib/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Moderation' };

const TABS = [
  { id: 'reports', label: 'Open reports' },
  { id: 'handled', label: 'Handled reports' },
  { id: 'appeals', label: 'Appeals' },
  { id: 'audit', label: 'Audit log' },
] as const;

export default async function ModerationPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login?next=/moderation');
  if (me.role !== 'moderator' && me.role !== 'admin') notFound();
  const requested = (await searchParams).tab;
  const tab = TABS.find((t) => t.id === requested)?.id ?? 'reports';

  return (
    <div className="mx-auto max-w-[1040px] px-6 py-8">
      <h1 className="ttl text-[34px]">Moderation</h1>
      <p className="mut mt-2 text-[14px]">Every action requires a reason, is published on the lot, and is written to the append-only audit log.</p>
      <div className="mt-5 flex flex-wrap gap-1.5 border-b border-divider" role="tablist">
        {TABS.map((t) => (
          <Link key={t.id} href={`/moderation?tab=${t.id}`} role="tab" aria-selected={tab === t.id} className="tab">
            {t.label}
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
  const { items } = await apiGet<{ items: ReportRow[] }>(`/moderation/reports?status=${status}`);
  if (!items.length) return <p className="mut">{status === 'open' ? 'No open reports. 🎉' : 'Nothing handled yet.'}</p>;
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
  if (!all.length) return <p className="mut">No appeals.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {all.map((a) => (
        <AppealCard key={a.id} a={a} />
      ))}
    </ul>
  );
}

async function Audit() {
  const { items } = await apiGet<{ items: AuditRow[] }>('/moderation/audit');
  return (
    <div className="overflow-x-auto">
      <table className="table min-w-[760px]">
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">Actor</th>
            <th scope="col">Action</th>
            <th scope="col">Target</th>
            <th scope="col">Reason</th>
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
              <td>{a.targetType === 'auction' ? <Link href={`/lots/${a.targetId}`}>auction</Link> : <span className="mut">{a.targetType}</span>}</td>
              <td>{a.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
