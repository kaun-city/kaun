import type { CommunityFact } from "./types"

/**
 * Rupees -> display, the one money format for ward records (en-IN, 1 Cr = 100 L).
 *   2,12,00,00,000 -> "₹212 Cr"   2,50,00,000 -> "₹2.5 Cr"   82,00,000 -> "₹82 L"   4,103 -> "₹4,103"
 * Missing values return "—" so they never read as ₹0.
 */
export function formatINR(rupees: number | null | undefined): string {
  if (rupees == null || !Number.isFinite(rupees)) return "—"
  const abs = Math.abs(rupees)
  const oneDecimal = (value: number) => value.toFixed(1).replace(/\.0$/, "")
  if (abs >= 1e9) return `₹${Math.round(rupees / 1e7).toLocaleString("en-IN")} Cr`
  if (abs >= 1e7) return `₹${oneDecimal(rupees / 1e7)} Cr`
  if (abs >= 1e5) return `₹${oneDecimal(rupees / 1e5)} L`
  return `₹${Math.round(rupees).toLocaleString("en-IN")}`
}

/** Lakh -> display. (An older version divided by 10,000 and showed crores 100x too small.) */
export function formatLakh(lakh: number | null | undefined): string {
  return formatINR(lakh == null ? lakh : lakh * 1e5)
}

/** Crore -> display. */
export function formatCrore(crore: number | null | undefined): string {
  return formatINR(crore == null ? crore : crore * 1e7)
}

export function timeAgo(utc: number): string {
  const secs = Math.floor(Date.now() / 1000) - utc
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

export function getVoterToken(): string {
  if (typeof window === "undefined") return "ssr"
  let token = sessionStorage.getItem("kaun_voter_token")
  if (!token) {
    token = "v_" + Math.random().toString(36).slice(2) + Date.now().toString(36)
    sessionStorage.setItem("kaun_voter_token", token)
  }
  return token
}

/** Group community facts by subject → field, keeping highest-corroboration per field. */
export function groupOfficerFacts(facts: CommunityFact[]): Record<string, Record<string, CommunityFact>> {
  const result: Record<string, Record<string, CommunityFact>> = {}
  for (const f of facts) {
    if (f.category !== "officer") continue
    if (!result[f.subject]) result[f.subject] = {}
    const existing = result[f.subject][f.field]
    if (!existing || f.corroboration_count > existing.corroboration_count) {
      result[f.subject][f.field] = f
    }
  }
  return result
}
