import { Star } from 'lucide-react';

/** Five stars, filled to the nearest half. Always paired with a text value, never colour alone (E8). */
export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const rounded = Math.round(value * 2) / 2;
  return (
    <span className="inline-flex items-center gap-[2px] align-[-2px]" role="img" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = rounded >= n ? 1 : rounded >= n - 0.5 ? 0.5 : 0;
        return (
          <span key={n} className="relative inline-block" style={{ width: size, height: size }} aria-hidden>
            <Star size={size} strokeWidth={1.5} className="absolute inset-0 text-neutral-300" fill="var(--color-neutral-200)" />
            {fill > 0 && (
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star size={size} strokeWidth={1.5} color="var(--color-accent-700)" fill="var(--color-accent)" />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
