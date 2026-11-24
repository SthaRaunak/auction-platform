'use client';

import type { Amendment } from '@bidwell/contract';
import { useI18n } from '@/i18n/client';
import type { I18n, MessageKey } from '@/i18n/translator';

const MONEY_FIELDS = new Set(['startPrice', 'reservePrice', 'shippingCost', 'emdAmount']);

function show(i18n: I18n, field: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (MONEY_FIELDS.has(field) && typeof v === 'number') return i18n.money(v);
  if ((field === 'startsAt' || field === 'endsAt') && typeof v === 'string') return i18n.fullStamp(v);
  if (field === 'images' && Array.isArray(v)) return i18n.t('amend.photos', { count: v.length });
  if (typeof v === 'string') return v.length > 140 ? `${v.slice(0, 140)}…` : v;
  return JSON.stringify(v);
}

/** A6: the public amendment log — "Amended at T — view changes". */
export function Amendments({ items }: { items: Amendment[] }) {
  const i18n = useI18n();
  const { t, fullStamp } = i18n;
  const last = items[items.length - 1];
  const label = (field: string) => {
    const key = `amend.fields.${field}` as MessageKey;
    const text = t(key);
    return text === key ? field : text;
  };
  return (
    <details className="mt-3 rounded-[11px] border border-neutral-300 bg-white px-3.5 py-2.5 text-[12.5px]">
      <summary className="cursor-pointer">{t('amend.summary', { when: fullStamp(last.at), count: items.length })}</summary>
      <ol className="mt-2.5 flex flex-col gap-3">
        {items.map((a) => (
          <li key={a.id}>
            <div className="mut text-[12px]">
              {fullStamp(a.at)} · {t(a.afterBids ? 'amend.afterBids' : 'amend.beforeBids')}
            </div>
            <ul className="mt-1">
              {a.changes.map((c) => (
                <li key={c.field}>
                  <strong className="font-medium">{label(c.field)}:</strong> <span className="mut line-through">{show(i18n, c.field, c.from)}</span> → {show(i18n, c.field, c.to)}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </details>
  );
}
