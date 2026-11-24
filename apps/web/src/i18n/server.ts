import 'server-only';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { LOCALE_COOKIE, isLocale, preferredLocale, type Locale } from './config';
import en from './messages/en.json';
import ne from './messages/ne.json';
import { createI18n, type Messages } from './translator';

// `satisfies` makes a missing or misspelt key in ne.json a type error.
const MESSAGES = { en, ne } satisfies Record<Locale, Messages>;

/** The viewer's language: the toggle's cookie if set, otherwise the browser's Accept-Language. */
export const getLocale = cache(async (): Promise<Locale> => {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;
  return preferredLocale((await headers()).get('accept-language'));
});

export async function getMessages(): Promise<Messages> {
  return MESSAGES[await getLocale()];
}

/** For server components: `const { t, money } = await getI18n()`. */
export const getI18n = cache(async () => {
  const locale = await getLocale();
  return createI18n(locale, MESSAGES[locale]);
});
