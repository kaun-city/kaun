import { PARTY_COLORS } from "@/lib/constants"

export function PartyBadge({ party }: { party: string }) {
  const color = PARTY_COLORS[party] ?? "#888"
  return (
    <span
      className="text-xs font-semibold px-1.5 py-0.5 rounded"
      style={{ backgroundColor: color + "25", color }}
    >
      {party}
    </span>
  )
}
