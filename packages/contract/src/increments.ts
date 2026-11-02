import { z } from 'zod';

// The increment schedule is data, not scattered ifs (A10). Each auction stores
// its own bands; a flat increment is simply a single open-ended band.

export const incrementBandSchema = z.object({
  /** Exclusive upper bound of the band in minor units; null = no upper bound. */
  below: z.number().int().positive().nullable(),
  step: z.number().int().positive(),
});
export type IncrementBand = z.infer<typeof incrementBandSchema>;

export const incrementBandsSchema = z
  .array(incrementBandSchema)
  .min(1)
  .refine((bands) => bands[bands.length - 1].below === null, 'The last band must be open-ended')
  .refine(
    (bands) => bands.every((b, i) => i === 0 || (bands[i - 1].below ?? Infinity) < (b.below ?? Infinity)),
    'Bands must be in ascending order',
  );

/**
 * Price-tiered default (all values in paisa), sized for public disposals that
 * run from a few thousand rupees of furniture to crores for land:
 * Rs. 100 under Rs. 10,000 · Rs. 500 under 1 lakh · Rs. 2,000 under 10 lakh ·
 * Rs. 10,000 under 1 crore · Rs. 50,000 above.
 */
export const DEFAULT_INCREMENT_BANDS: IncrementBand[] = [
  { below: 10_000_00, step: 100_00 },
  { below: 1_00_000_00, step: 500_00 },
  { below: 10_00_000_00, step: 2_000_00 },
  { below: 1_00_00_000_00, step: 10_000_00 },
  { below: null, step: 50_000_00 },
];

export function incrementFor(price: number, bands: IncrementBand[]): number {
  for (const band of bands) {
    if (band.below === null || price < band.below) return band.step;
  }
  return bands[bands.length - 1].step;
}
