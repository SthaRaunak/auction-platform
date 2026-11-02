// Money is always an integer count of minor units (paisa for NPR). Floats never
// touch an amount; conversion happens only at the display/input edge. (A3)

export const DEFAULT_CURRENCY = 'NPR' as const;
export type Currency = typeof DEFAULT_CURRENCY;

const MINOR_PER_MAJOR = 100;

/** How Nepali government notices write amounts in English: "Rs." with lakh/crore grouping. */
const SYMBOLS: Record<string, string> = { NPR: 'Rs.', INR: '₹' };

const formatters = new Map<string, Intl.NumberFormat>();

function grouping(withFraction: boolean) {
  const key = String(withFraction);
  let f = formatters.get(key);
  if (!f) {
    // en-IN gives the South Asian 1,00,000 grouping that Nepal shares.
    f = new Intl.NumberFormat('en-IN', { minimumFractionDigits: withFraction ? 2 : 0, maximumFractionDigits: withFraction ? 2 : 0 });
    formatters.set(key, f);
  }
  return f;
}

/** Rs. 1,24,000 — fractions are shown only when the amount has paisa. */
export function formatMoney(minor: number, currency: string = DEFAULT_CURRENCY): string {
  const hasFraction = minor % MINOR_PER_MAJOR !== 0;
  const symbol = SYMBOLS[currency] ?? currency;
  return `${minor < 0 ? '-' : ''}${symbol}\u00a0${grouping(hasFraction).format(Math.abs(minor) / MINOR_PER_MAJOR)}`;
}

export function toMinor(major: number): number {
  return Math.round(major * MINOR_PER_MAJOR);
}

export function toMajor(minor: number): number {
  return minor / MINOR_PER_MAJOR;
}

/** Parses user-typed money ("Rs. 1,24,500" / "124500") into minor units; digits only, whole rupees. */
export function parseMajorInput(text: string): number | null {
  const digits = text.replace(/[^0-9]/g, '');
  if (!digits) return null;
  const major = Number.parseInt(digits, 10);
  return Number.isSafeInteger(major) ? major * MINOR_PER_MAJOR : null;
}
