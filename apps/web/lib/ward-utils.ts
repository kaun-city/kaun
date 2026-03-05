import type { CommunityFact } from "./types"

export function formatLakh(val: number): string {
  if (val >= 10000) return `Rs. ${(val / 10000).toFixed(1)} Cr`
  return `Rs. ${val.toFixed(0)}L`
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
