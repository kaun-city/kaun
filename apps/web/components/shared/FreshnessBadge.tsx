interface Props {
  label: string   // e.g. "2013-18", "2020-22", "Census 2011"
  source?: string // e.g. "opencity.in", "BBMP"
}

/**
 * Compact data-freshness chip shown next to section headers.
 * Signals to the user how old the data is without taking up space.
 */
export function FreshnessBadge({ label, source }: Props) {
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded bg-white/5 text-white/25 border border-white/8 leading-none">
      <span className="w-1 h-1 rounded-full bg-white/20 shrink-0" />
      {source ? `${source} · ` : ""}{label}
    </span>
  )
}
