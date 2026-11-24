// Shared by server and client: which languages exist and how the choice is stored.

export const LOCALES = ['en', 'ne'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/** A plain preference cookie: set by the navbar toggle, read by server components on every render. */
export const LOCALE_COOKIE = 'bw_locale';
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Shown in the toggle in its own language and script. */
export const LOCALE_NAMES: Record<Locale, string> = { en: 'EN', ne: 'नेपाली' };

export const isLocale = (v: unknown): v is Locale => typeof v === 'string' && (LOCALES as readonly string[]).includes(v);

/** First visit, no cookie yet: pick the best match from Accept-Language ("ne-NP,ne;q=0.9,en;q=0.8"). */
export function preferredLocale(acceptLanguage: string | null | undefined): Locale {
  const ranked = (acceptLanguage ?? '')
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      return { lang: tag.split('-')[0].toLowerCase(), q: q ? Number(q.trim().slice(2)) : 1 };
    })
    .filter((x) => x.lang && !Number.isNaN(x.q))
    .sort((a, b) => b.q - a.q);
  return ranked.map((x) => x.lang).find(isLocale) ?? DEFAULT_LOCALE;
}
