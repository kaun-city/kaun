import { ImageResponse } from "next/og"
import { ACCENT, DANGER, INK, PAPER } from "@/lib/design-tokens"

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/** Ink at an opacity (8-digit hex). Text stays at 0.6+, the contrast floor on paper. */
const ink = (alpha: number) => INK + Math.round(alpha * 255).toString(16).padStart(2, "0")

const ISSUE_LABELS: Record<string, string> = {
  hoarding:     "Illegal politician banner",
  pothole:      "Pothole / broken road",
  flooding:     "Waterlogging",
  construction: "Unauthorized construction",
  encroachment: "Encroachment",
  garbage:      "Garbage dump",
  signal:       "Broken signal",
  other:        "Civic issue",
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const reportId = parseInt(searchParams.get("id") ?? "0", 10)
  if (!reportId) return new Response("Missing id", { status: 400 })

  // Fetch report from Supabase
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/ward_reports?id=eq.${reportId}&status=eq.approved&select=issue_type,ward_name,ward_no,ai_label,ai_person,ai_party,photo_url,description&limit=1`,
    { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }
  )
  const rows = await res.json()
  const report = Array.isArray(rows) ? rows[0] : null
  if (!report) return new Response("Report not found", { status: 404 })

  const issueLabel  = ISSUE_LABELS[report.issue_type] ?? "Civic issue"
  const wardLine    = report.ward_name ? `Ward ${report.ward_no} · ${report.ward_name} · Bengaluru` : "Bengaluru"
  const personLine  = report.ai_person
    ? `${report.ai_person}${report.ai_party ? " · " + report.ai_party : ""}`
    : null
  const headline    = report.ai_label ?? report.description ?? issueLabel

  return new ImageResponse(
    (
      <div style={{
        width: "100%", height: "100%",
        display: "flex", flexDirection: "column",
        backgroundColor: PAPER.canvas,
        fontFamily: "sans-serif",
        position: "relative",
      }}>
        {/* Left ink rule */}
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: "8px", backgroundColor: INK,
          display: "flex",
        }} />

        {/* Photo (if available) — right half */}
        {report.photo_url ? (
          <div style={{
            position: "absolute", right: 0, top: 0, bottom: 0,
            width: "45%",
            display: "flex",
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={report.photo_url}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            {/* Gradient overlay */}
            <div style={{
              position: "absolute", top: 0, right: 0, bottom: 0, left: 0,
              background: `linear-gradient(to right, ${PAPER.canvas} 0%, ${PAPER.canvas}00 40%)`,
              display: "flex",
            }} />
          </div>
        ) : null}

        {/* Content */}
        <div style={{
          display: "flex", flexDirection: "column",
          padding: "56px 56px 56px 72px",
          maxWidth: report.photo_url ? "58%" : "100%",
          height: "100%",
          justifyContent: "space-between",
        }}>
          {/* Top: Wordmark */}
          <div style={{ display: "flex", alignItems: "center", alignSelf: "flex-start", borderBottom: `2px solid ${INK}`, paddingBottom: "4px" }}>
            <span style={{ color: INK, fontSize: "22px", fontWeight: 900 }}>KAUN</span>
            <span style={{ color: ACCENT, fontSize: "26px", fontWeight: 900 }}>?</span>
          </div>

          {/* Middle: Issue */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{
              display: "flex",
              backgroundColor: PAPER.DEFAULT,
              border: `2px solid ${ink(0.2)}`,
              padding: "6px 14px",
            }}>
              <span style={{ color: ink(0.75), fontSize: "14px", fontWeight: 700, letterSpacing: "0.05em" }}>
                {issueLabel.toUpperCase()}
              </span>
            </div>

            <div style={{ display: "flex", color: INK, fontSize: "32px", fontWeight: 800, lineHeight: "1.3" }}>
              {headline.length > 120 ? headline.substring(0, 117) + "..." : headline}
            </div>

            {personLine && (
              <div style={{
                display: "flex", alignItems: "center",
                backgroundColor: PAPER.muted,
                padding: "10px 16px",
              }}>
                <span style={{ color: DANGER, fontSize: "18px", fontWeight: 700, marginRight: "8px" }}>!</span>
                <span style={{ color: ink(0.85), fontSize: "18px", fontWeight: 600 }}>
                  {personLine}
                </span>
              </div>
            )}
          </div>

          {/* Bottom */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ color: ink(0.6), fontSize: "16px" }}>
              {wardLine}
            </div>
            <div style={{ color: ink(0.75), fontSize: "18px", fontWeight: 700 }}>
              kaun.city
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
