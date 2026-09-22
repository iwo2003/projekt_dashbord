export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="10" fill="#f5b942" />
        <circle cx="16" cy="16" r="4.2" fill="#17140c" />
        <g stroke="#17140c" strokeWidth="1.8" strokeLinecap="round">
          <path d="M16 5.2v3M16 23.8v3M5.2 16h3M23.8 16h3" />
          <path d="M8.1 8.1l2.1 2.1M21.8 21.8l2.1 2.1M23.9 8.1l-2.1 2.1M10.2 21.8l-2.1 2.1" />
        </g>
      </svg>
      {compact ? null : (
        <span className="leading-tight">
          <span className="block text-[1.05rem] font-semibold tracking-tight">Helios</span>
          <span className="block text-[0.68rem] uppercase tracking-[0.16em] text-fog">panel</span>
        </span>
      )}
    </span>
  );
}
