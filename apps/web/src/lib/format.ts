export { formatMoney as money } from '@bidwell/contract';
import { URGENCY_SECONDS } from '@bidwell/contract';

const pad = (n: number) => (n < 10 ? `0${n}` : String(n));

/** 1d 02h 05m · 2h 05m 09s · 05m 09s — the mock's countdown format. */
export function countdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${pad(h)}h ${pad(m)}m`;
  if (h > 0) return `${h}h ${pad(m)}m ${pad(sec)}s`;
  return `${pad(m)}m ${pad(sec)}s`;
}

export function secondsUntil(iso: string, now: number) {
  return (new Date(iso).getTime() - now) / 1000;
}

export const isUrgent = (secondsLeft: number) => secondsLeft > 0 && secondsLeft <= URGENCY_SECONDS;

export function ago(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return s <= 2 ? 'just now' : `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** "Fri 22 Aug, 14:00" */
export function endStamp(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
  return `${day}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

export function fullStamp(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function plural(n: number, word: string, many = `${word}s`) {
  return `${n.toLocaleString('en-IN')} ${n === 1 ? word : many}`;
}
