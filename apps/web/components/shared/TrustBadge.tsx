import { TRUST_STYLES } from "@/lib/constants"

export function TrustBadge({ level }: { level: string }) {
  const s = TRUST_STYLES[level] ?? TRUST_STYLES.unverified
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${s.bg} ${s.text} ${s.border}`}>
      {s.icon} {s.label}
    </span>
  )
}
