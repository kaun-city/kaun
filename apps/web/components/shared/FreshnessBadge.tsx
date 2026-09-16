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
    <span className="inline-flex items-center gap-1 font-mono text-[0.6875rem] px-1.5 py-0.5 text-[#16130e]/55 border border-[#16130e]/20 leading-none whitespace-nowrap">
      {source ? `${source} · ` : ""}{label}
    </span>
  )
}
