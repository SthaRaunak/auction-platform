import { URGENCY_SECONDS } from '@bidwell/contract';

// Locale-independent time helpers. Everything that renders text — money,
// dates, countdowns, "2m ago" — lives on the translator (src/i18n/translator.ts).

export function secondsUntil(iso: string, now: number) {
  return (new Date(iso).getTime() - now) / 1000;
}

export const isUrgent = (secondsLeft: number) => secondsLeft > 0 && secondsLeft <= URGENCY_SECONDS;
