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
    <span className="font-mono text-[11px] uppercase leading-snug tracking-[0.06em] text-ink/60 whitespace-nowrap">
      {source ? `${source} · ` : ""}{label}
    </span>
  )
}
