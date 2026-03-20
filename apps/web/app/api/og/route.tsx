import { ImageResponse } from "next/og"

export const runtime = "edge"

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function fetchJson(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
      Accept: "application/json",
    },
  })
  if (!res.ok) return null
  const data = await res.json()
  return Array.isArray(data) ? data[0] ?? null : data
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const wardNo = parseInt(searchParams.get("ward_no") ?? "0", 10)

  const ward = wardNo
    ? await fetchJson(`wards?ward_no=eq.${wardNo}&select=ward_name,assembly_constituency&limit=1`)
    : null

  const report = ward?.assembly_constituency
    ? await fetchJson(
        `rep_report_cards?constituency=eq.${encodeURIComponent(ward.assembly_constituency)}&role=eq.MLA&select=attendance_pct,lad_utilization_pct,criminal_cases&limit=1`
      )
    : null

  let stat = ""
  let statLabel = ""
  if (report?.lad_utilization_pct !== null && report?.lad_utilization_pct !== undefined && Number(report.lad_utilization_pct) === 0) {
    stat = "0%"; statLabel = "development funds utilized"
  } else if (report?.criminal_cases != null && Number(report.criminal_cases) >= 3) {
    stat = String(report.criminal_cases)
    statLabel = Number(report.criminal_cases) > 1 ? "criminal cases on record" : "criminal case on record"
  } else if (report?.attendance_pct != null && Number(report.attendance_pct) < 65) {
    stat = `${report.attendance_pct}%`; statLabel = "assembly attendance"
  } else if (report?.lad_utilization_pct != null) {
    stat = `${report.lad_utilization_pct}%`; statLabel = "LAD funds utilized"
  }

  const wardName    = ward?.ward_name ?? "Bengaluru"
  const constituency = ward?.assembly_constituency ?? ""

  return new ImageResponse(
    (
      <div style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: "#0A0A0A",
        padding: "56px 72px",
        fontFamily: "sans-serif",
      }}>

        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <span style={{ color: "white", fontSize: "26px", fontWeight: 900 }}>KAUN</span>
          <span style={{ color: "#2dd4bf", fontSize: "30px", fontWeight: 900, marginLeft: "2px" }}>?</span>
        </div>

        {/* Ward name */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: "48px" }}>
          <div style={{ color: "white", fontSize: "76px", fontWeight: 800, letterSpacing: "-2px" }}>
            {wardName}
          </div>
          {constituency ? (
            <div style={{ display: "flex", color: "rgba(255,255,255,0.35)", fontSize: "24px", marginTop: "10px" }}>
              Ward {wardNo} · {constituency} · Bengaluru
            </div>
          ) : null}
        </div>

        {/* Accountability stat box */}
        {stat ? (
          <div style={{
            display: "flex",
            alignItems: "center",
            marginTop: "48px",
            backgroundColor: "rgba(255,153,51,0.12)",
            border: "2px solid rgba(255,153,51,0.30)",
            borderRadius: "16px",
            padding: "28px 40px",
          }}>
            <div style={{ display: "flex", color: "#2dd4bf", fontSize: "72px", fontWeight: 900, marginRight: "24px" }}>
              {stat}
            </div>
            <div style={{ display: "flex", color: "rgba(255,255,255,0.65)", fontSize: "28px", fontWeight: 400 }}>
              {statLabel}
            </div>
          </div>
        ) : null}

        {/* Spacer pushes footer down */}
        <div style={{ display: "flex", flex: 1 }} />

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", color: "rgba(255,255,255,0.25)", fontSize: "20px" }}>
            Find out who is accountable for your ward
          </div>
          <div style={{ display: "flex", color: "rgba(255,255,255,0.55)", fontSize: "22px", fontWeight: 700 }}>
            kaun.city
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
