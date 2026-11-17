import type { Amendment } from '@bidwell/contract';
import { fullStamp, money } from '@/lib/format';

const MONEY_FIELDS = new Set(['startPrice', 'reservePrice', 'shippingCost', 'emdAmount']);
const LABELS: Record<string, string> = {
  title: 'Title', description: 'Description', category: 'Category', brand: 'Make / brand', condition: 'Condition', specs: 'Specs',
  images: 'Photos', delivery: 'Delivery', shippingCost: 'Shipping cost', location: 'Location', startPrice: 'Starting price',
  reservePrice: 'Reserve price', incrementBands: 'Increments', emdAmount: 'Deposit', startsAt: 'Start time', endsAt: 'End time',
  softCloseWindowSec: 'Soft-close window', softCloseExtendSec: 'Soft-close extension',
};

function show(field: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (MONEY_FIELDS.has(field) && typeof v === 'number') return money(v);
  if ((field === 'startsAt' || field === 'endsAt') && typeof v === 'string') return fullStamp(v);
  if (field === 'images' && Array.isArray(v)) return `${v.length} photo${v.length === 1 ? '' : 's'}`;
  if (typeof v === 'string') return v.length > 140 ? `${v.slice(0, 140)}…` : v;
  return JSON.stringify(v);
}

/** A6: the public amendment log — "Amended at T — view changes". */
export function Amendments({ items }: { items: Amendment[] }) {
  const last = items[items.length - 1];
  return (
    <details className="mt-3 rounded-[11px] border border-neutral-300 bg-white px-3.5 py-2.5 text-[12.5px]">
      <summary className="cursor-pointer">
        Amended {fullStamp(last.at)} — view {items.length === 1 ? 'change' : `all ${items.length} changes`}
      </summary>
      <ol className="mt-2.5 flex flex-col gap-3">
        {items.map((a) => (
          <li key={a.id}>
            <div className="mut text-[11.5px]">
              {fullStamp(a.at)} · {a.afterBids ? 'after bidding opened' : 'before any bids'}
            </div>
            <ul className="mt-1">
              {a.changes.map((c) => (
                <li key={c.field}>
                  <strong className="font-medium">{LABELS[c.field] ?? c.field}:</strong> <span className="mut line-through">{show(c.field, c.from)}</span> → {show(c.field, c.to)}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </details>
  );
}
