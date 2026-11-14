export function Avatar({ initials, size = 24 }: { initials: string; size?: number }) {
  return (
    <span className="av" style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.38)) }} aria-hidden>
      {initials}
    </span>
  );
}
