export const PAGE_VIEW_TRACKING_STARTED_AT = Date.parse("2026-10-01T14:14:21.360Z")
const DAY = 86_400_000

export interface TrafficSnapshot {
  visitors: number
  pageViews: number
  visitorChangePercent: number
  pageViewChangePercent: number
  bounceRatePercent: number
}

export function parseTrafficSnapshot(value: unknown): TrafficSnapshot | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  for (const field of ["visitors", "pageViews"]) {
    if (typeof row[field] !== "number" || !Number.isSafeInteger(row[field]) || row[field] < 0) return null
  }
  for (const field of ["visitorChangePercent", "pageViewChangePercent"]) {
    if (typeof row[field] !== "number" || !Number.isFinite(row[field]) || row[field] < -100 || row[field] > 1e9) return null
  }
  if (typeof row.bounceRatePercent !== "number" || !Number.isFinite(row.bounceRatePercent) || row.bounceRatePercent < 0 || row.bounceRatePercent > 100) return null
  return {
    visitors: row.visitors as number, pageViews: row.pageViews as number,
    visitorChangePercent: row.visitorChangePercent as number,
    pageViewChangePercent: row.pageViewChangePercent as number,
    bounceRatePercent: row.bounceRatePercent as number,
  }
}

export function changeLabel(current: number | null, previous: number | null): string {
  if (current === null || previous === null) return "comparison unavailable"
  if (previous === 0) return current === 0 ? "unchanged" : "up from zero"
  const percent = Math.round((current - previous) / previous * 100)
  return `${percent > 0 ? "+" : ""}${percent}%`
}

type Counts = {
  pages24h: number | null; pagesPrevious24h: number | null; pages7d: number | null; pagesPrevious7d: number | null
  pins24h: number | null; pins7d: number | null; pinsPrevious7d: number | null
  reports24h: number | null; reports7d: number | null
  questions24h: number | null; questions7d: number | null
}
export function buildActivityDigest(input: {
  now: number; counts: Counts; health: string; queryFailed: boolean
  topWards: Array<{ ward_name: string; count: number }>; issues: string[]
  snapshot: { at: string; metrics: TrafficSnapshot } | null
}): string {
  const c = input.counts
  const value = (n: number | null) => n === null ? "unavailable" : n.toLocaleString("en-IN")
  const signed = (n: number) => `${n > 0 ? "+" : ""}${n}%`
  const age = input.now - PAGE_VIEW_TRACKING_STARTED_AT
  const snapshotAt = input.snapshot ? Date.parse(input.snapshot.at) : NaN
  const freshSnapshot = input.snapshot && Number.isFinite(snapshotAt) && input.now - snapshotAt >= 0 && input.now - snapshotAt <= 36 * 60 * 60 * 1000
  const traffic = freshSnapshot ? [
    `Vercel traffic — last 7 days (checked ${new Date(snapshotAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} IST):`,
    `${value(input.snapshot!.metrics.visitors)} visitors (${signed(input.snapshot!.metrics.visitorChangePercent)}) · ${value(input.snapshot!.metrics.pageViews)} views (${signed(input.snapshot!.metrics.pageViewChangePercent)}) vs previous 7 days`,
    `Bounce rate: ${input.snapshot!.metrics.bounceRatePercent}%`,
  ] : ["Vercel visitor statistics: awaiting a fresh dashboard check"]
  const pageTrend = age >= 2 * DAY ? `${changeLabel(c.pages24h, c.pagesPrevious24h)} vs previous 24h` : "tracking started 1 Oct; daily baseline building"
  const weekTrend = age >= 14 * DAY ? `${changeLabel(c.pages7d, c.pagesPrevious7d)} vs previous week` : "weekly baseline building"
  const lowEngagement = c.reports7d === 0 && c.questions7d === 0
  return [
    `📊 Kaun update (${new Date(input.now).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })})`,
    ...traffic,
    "",
    "Activity — 24 hours / 7 days:",
    `Page views: ${value(c.pages24h)} / ${value(c.pages7d)} (${pageTrend}; ${weekTrend})`,
    `Map pin drops: ${value(c.pins24h)} / ${value(c.pins7d)} (${changeLabel(c.pins7d, c.pinsPrevious7d)} vs previous week)`,
    `Civic reports: ${value(c.reports24h)} / ${value(c.reports7d)}`,
    `Ask Kaun questions: ${value(c.questions24h)} / ${value(c.questions7d)}`,
    input.topWards.length ? `Top map wards: ${input.topWards.slice(0, 3).map(w => `${w.ward_name} ${w.count}`).join(", ")}` : "",
    lowEngagement ? "Engagement: no reports or questions in the last 7 days." : "",
    "",
    `System health: ${input.health}${input.queryFailed ? " (some counts unavailable)" : ""}`,
    input.issues.length ? `Open items:\n${input.issues.map(issue => `• ${issue}`).join("\n")}` : "Open items: none detected by operational checks.",
    "https://kaun.city/status",
  ].filter(line => line !== "").join("\n")
}
