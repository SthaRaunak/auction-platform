'use client';

import { createContext, useContext, useMemo, useTransition } from 'react';
import { setLocale } from './actions';
import { LOCALES, LOCALE_NAMES, type Locale } from './config';
import { createI18n, type I18n, type Messages } from './translator';

const I18nContext = createContext<I18n | null>(null);

/** The root layout passes in only the active language's messages, so the client never downloads both. */
export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: React.ReactNode }) {
  const i18n = useMemo(() => createI18n(locale, messages), [locale, messages]);
  return <I18nContext.Provider value={i18n}>{children}</I18nContext.Provider>;
}

/** For client components: `const { t, money } = useI18n()`. */
export function useI18n(): I18n {
  const i18n = useContext(I18nContext);
  if (!i18n) throw new Error('useI18n must be used inside <I18nProvider>');
  return i18n;
}

/**
 * EN / नेपाली switch in the navbar. A Server Action stores the choice in a
 * cookie and the server components re-render in place, so client state (a
 * half-typed bid, an open form) survives the switch.
 */
export function LocaleToggle() {
  const { locale, t } = useI18n();
  const [pending, startTransition] = useTransition();
  const choose = (next: Locale) => startTransition(() => setLocale(next));
  return (
    <fieldset className="seg flex-none" aria-busy={pending}>
      <legend className="sr-only">{t('nav.language')}</legend>
      {LOCALES.map((l) => (
        <label key={l} className="seg-opt !px-2.5 !py-[5px] !text-[12px]" lang={l}>
          <input type="radio" name="locale" checked={locale === l} onChange={() => choose(l)} />
          <span>{LOCALE_NAMES[l]}</span>
        </label>
      ))}
    </fieldset>
  );
}
