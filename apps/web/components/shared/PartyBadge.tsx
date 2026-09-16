import { PARTY_COLORS } from "@/lib/constants"

/**
 * Party colours were chosen for a dark ground; as text on paper most of them
 * fall below 3:1. The colour now lives in a swatch and the letters stay ink.
 */
export function PartyBadge({ party }: { party: string }) {
  const color = PARTY_COLORS[party]
  return (
    <span className="inline-flex items-center gap-1.5 border border-ink/20 bg-paper-bright px-1.5 py-0.5 font-mono text-[11px] font-semibold leading-none text-ink">
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 ${color ? "" : "bg-ink/40"}`}
        style={color ? { backgroundColor: color } : undefined}
      />
      {party}
    </span>
  )
}
