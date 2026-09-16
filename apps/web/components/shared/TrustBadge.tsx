import { TRUST_STYLES } from "@/lib/constants"

export function TrustBadge({ level }: { level: string }) {
  const s = TRUST_STYLES[level] ?? TRUST_STYLES.unverified
  return (
    <span className={`inline-flex items-center whitespace-nowrap border px-1.5 py-0.5 font-mono text-[11px] font-semibold leading-none ${s.bg} ${s.text} ${s.border}`}>
      {s.icon} {s.label}
    </span>
  )
}
