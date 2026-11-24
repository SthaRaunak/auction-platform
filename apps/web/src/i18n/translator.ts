import { ENDING_WINDOWS, REPORT_REASONS, SORTS, categoryLabel, conditionLabel, deliveryLabel, formatMoney, toDevanagariDigits } from '@bidwell/contract';
import { Fragment, createElement, type ReactNode } from 'react';
import type { Locale } from './config';
import type en from './messages/en.json';

// One translator for server and client components. Messages are plain JSON
// (en.json is the source of truth; ne.json must have the same shape — checked
// in server.ts). Keys are type-checked dot paths: t('bid.placeBid', { amount }).

export type Messages = typeof en;

/** A message with plural forms, chosen by the `count` variable (Intl.PluralRules). */
type Plural = { one: string; other: string };
type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string | Plural ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
export type MessageKey = Leaves<Messages>;

type Vars = Record<string, string | number>;
/** Renderers for inline tags in a message: "<link>Sign in</link> to bid" → { link: (text) => <Link>{text}</Link> }. */
type Tags = Record<string, (chunks: string) => ReactNode>;

// Nepali numbers and dates are built from en-IN / en-GB output with Devanagari
// digits and Nepali month and weekday names swapped in, rather than with Intl
// 'ne-NP': not every browser ships Nepali locale data, and a fallback would
// render differently from the server and break hydration.
const NE_MONTHS = ['जनवरी', 'फेब्रुअरी', 'मार्च', 'अप्रिल', 'मे', 'जुन', 'जुलाई', 'अगस्ट', 'सेप्टेम्बर', 'अक्टोबर', 'नोभेम्बर', 'डिसेम्बर'];
const NE_WEEKDAYS = ['आइत', 'सोम', 'मङ्गल', 'बुध', 'बिही', 'शुक्र', 'शनि'];

const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
const labelIn = (list: readonly { value: string; label: string }[], value: string) => list.find((x) => x.value === value)?.label ?? value;

export function createI18n(locale: Locale, messages: Messages) {
  const plurals = new Intl.PluralRules(locale);
  const digits = (value: string | number) => (locale === 'ne' ? toDevanagariDigits(String(value)) : String(value));
  const num = (n: number, options?: Intl.NumberFormatOptions) => digits(new Intl.NumberFormat('en-IN', options).format(n));

  const lookup = (key: string): string | Plural | undefined => {
    let node: unknown = messages;
    for (const part of key.split('.')) node = node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined;
    return typeof node === 'string' || (node && typeof node === 'object' && 'other' in node) ? (node as string | Plural) : undefined;
  };

  const format = (message: string | Plural, vars?: Vars) => {
    const text = typeof message === 'string' ? message : message[plurals.select(Number(vars?.count ?? 0)) as keyof Plural] ?? message.other;
    return text.replace(/\{(\w+)\}/g, (match, name: string) => {
      const v = vars?.[name];
      if (v === undefined) return match;
      return typeof v === 'number' ? num(v) : v;
    });
  };

  /** Translate a key. Number variables are formatted for the locale (१,२४० in Nepali). */
  const t = (key: MessageKey, vars?: Vars): string => {
    const m = lookup(key);
    return m === undefined ? key : format(m, vars);
  };

  /** Like `t`, for messages with inline markup such as links or bold text. */
  const rich = (key: MessageKey, tags: Tags, vars?: Vars): ReactNode => {
    const text = t(key, vars);
    const parts: ReactNode[] = [];
    let last = 0;
    for (const m of text.matchAll(/<(\w+)>(.*?)<\/\1>/g)) {
      parts.push(text.slice(last, m.index));
      const render = tags[m[1]];
      parts.push(render ? render(m[2]) : m[2]);
      last = m.index + m[0].length;
    }
    parts.push(text.slice(last));
    return createElement(Fragment, null, ...parts);
  };

  /** A label for a value from a contract catalog; falls back to the contract's English label. */
  const catalog = (group: string, value: string, english: string) => {
    const m = lookup(`catalog.${group}.${value}`);
    return typeof m === 'string' ? m : english;
  };

  const date = (iso: string, options: Intl.DateTimeFormatOptions) => {
    const d = new Date(iso);
    if (locale === 'en') return d.toLocaleString('en-GB', options);
    return new Intl.DateTimeFormat('en-GB', options)
      .formatToParts(d)
      .map((p) => (p.type === 'month' ? NE_MONTHS[d.getMonth()] : p.type === 'weekday' ? NE_WEEKDAYS[d.getDay()] : digits(p.value)))
      .join('');
  };

  return {
    locale,
    t,
    rich,
    /** ASCII digits → Devanagari in Nepali; for ids and numbers that shouldn't be grouped. */
    digits,

    /** Dynamic data entered in both languages: the Nepali text when we're in Nepali and it exists, else English. */
    pick: (english: string, nepali: string | null | undefined) => (locale === 'ne' && nepali ? nepali : english),

    /** Lakh/crore grouping in both languages (1,24,000 / १,२४,०००). */
    num,
    money: (minor: number, currency?: string) => formatMoney(minor, currency, locale),

    /** 1d 02h 05m · 2h 05m 09s · 05m 09s — the mock's countdown format, with localised units and digits. */
    countdown: (seconds: number) => {
      const s = Math.max(0, Math.floor(seconds));
      const [d, h, m, sec] = [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60];
      const u = messages.time.units;
      if (d > 0) return digits(`${d}${u.d} ${pad(h)}${u.h} ${pad(m)}${u.m}`);
      if (h > 0) return digits(`${h}${u.h} ${pad(m)}${u.m} ${pad(sec)}${u.s}`);
      return digits(`${pad(m)}${u.m} ${pad(sec)}${u.s}`);
    },

    ago: (iso: string, now: number) => {
      const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
      if (s <= 2) return t('time.justNow');
      if (s < 60) return t('time.secondsAgo', { count: s });
      if (s < 3600) return t('time.minutesAgo', { count: Math.floor(s / 60) });
      if (s < 86400) return t('time.hoursAgo', { count: Math.floor(s / 3600) });
      return t('time.daysAgo', { count: Math.floor(s / 86400) });
    },

    /** "Fri 22 Aug, 14:00" */
    endStamp: (iso: string) => `${date(iso, { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')}, ${date(iso, { hour: '2-digit', minute: '2-digit' })}`,
    fullStamp: (iso: string) => date(iso, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    day: (iso: string) => date(iso, { day: 'numeric', month: 'short', year: 'numeric' }),
    monthYear: (iso: string) => date(iso, { month: 'long', year: 'numeric' }),

    category: (slug: string) => catalog('category', slug, categoryLabel(slug)),
    condition: (value: string) => catalog('condition', value, conditionLabel(value)),
    delivery: (value: string) => catalog('delivery', value, deliveryLabel(value)),
    sort: (value: string) => catalog('sort', value, labelIn(SORTS, value)),
    ending: (value: string) => catalog('ending', value, labelIn(ENDING_WINDOWS, value)),
    reportReason: (value: string) => catalog('reportReason', value, labelIn(REPORT_REASONS, value)),

    /**
     * API errors carry a stable code. In English the server's message is the
     * most specific one; in Nepali we show our translation of the code, or the
     * English message when we have none.
     */
    error: (err: { code: string; message: string }) => {
      const m = locale === 'en' ? undefined : lookup(`errors.${err.code}`);
      return typeof m === 'string' ? m : err.message;
    },
  };
}

export type I18n = ReturnType<typeof createI18n>;
