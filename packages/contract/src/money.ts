// Money is always an integer count of minor units (paisa for NPR). Floats never
// touch an amount; conversion happens only at the display/input edge. (A3)

export const DEFAULT_CURRENCY = 'NPR' as const;
export type Currency = typeof DEFAULT_CURRENCY;

const MINOR_PER_MAJOR = 100;

/** Display languages. Amounts are the same data; only the symbol and digits change. */
export type MoneyLocale = 'en' | 'ne';

/** How Nepali government notices write amounts: "Rs." in English, "रु." in Nepali, with lakh/crore grouping. */
const SYMBOLS: Record<MoneyLocale, Record<string, string>> = {
  en: { NPR: 'Rs.', INR: '₹' },
  ne: { NPR: 'रु.', INR: '₹' },
};

const DEVANAGARI_ZERO = 0x0966;

/**
 * ASCII digits → Devanagari (१,२४,०००). Done by hand rather than with
 * Intl 'ne-NP': some browsers ship without Nepali number data and fall back to
 * Latin digits, which would also break hydration against the server's output.
 */
export function toDevanagariDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) => String.fromCharCode(DEVANAGARI_ZERO + Number(d)));
}

const formatters = new Map<boolean, Intl.NumberFormat>();

function grouping(withFraction: boolean) {
  let f = formatters.get(withFraction);
  if (!f) {
    // en-IN gives the South Asian 1,00,000 grouping that Nepal shares.
    f = new Intl.NumberFormat('en-IN', { minimumFractionDigits: withFraction ? 2 : 0, maximumFractionDigits: withFraction ? 2 : 0 });
    formatters.set(withFraction, f);
  }
  return f;
}

/** Rs. 1,24,000 / रु. १,२४,००० — fractions are shown only when the amount has paisa. */
export function formatMoney(minor: number, currency: string = DEFAULT_CURRENCY, locale: MoneyLocale = 'en'): string {
  const hasFraction = minor % MINOR_PER_MAJOR !== 0;
  const symbol = SYMBOLS[locale][currency] ?? currency;
  const amount = grouping(hasFraction).format(Math.abs(minor) / MINOR_PER_MAJOR);
  return `${minor < 0 ? '-' : ''}${symbol}\u00a0${locale === 'ne' ? toDevanagariDigits(amount) : amount}`;
}

export function toMinor(major: number): number {
  return Math.round(major * MINOR_PER_MAJOR);
}

export function toMajor(minor: number): number {
  return minor / MINOR_PER_MAJOR;
}

/** Parses user-typed money ("Rs. 1,24,500" / "रु. १,२४,५००" / "124500") into minor units; digits only, whole rupees. */
export function parseMajorInput(text: string): number | null {
  const digits = text.replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - DEVANAGARI_ZERO)).replace(/[^0-9]/g, '');
  if (!digits) return null;
  const major = Number.parseInt(digits, 10);
  return Number.isSafeInteger(major) ? major * MINOR_PER_MAJOR : null;
}
