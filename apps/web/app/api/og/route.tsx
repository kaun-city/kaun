import { ImageResponse } from "next/og"
import { ACCENT, INK, PAPER } from "@/lib/design-tokens"

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/** Ink at an opacity (8-digit hex). Text stays at 0.6+, the contrast floor on paper. */
const ink = (alpha: number) => INK + Math.round(alpha * 255).toString(16).padStart(2, "0")

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
  const corporationId = parseInt(searchParams.get("gba_corporation") ?? "0", 10)
  const gbaWardNo = parseInt(searchParams.get("gba_ward") ?? "0", 10)

  const currentWard = corporationId > 0 && gbaWardNo > 0
    ? await fetchJson(`gba_wards?gba_corporation_id=eq.${corporationId}&gba_ward_no=eq.${gbaWardNo}&select=gba_ward_name,gba_corporation,gba_ac,gba_population&limit=1`)
    : null
  const legacyWard = !currentWard && wardNo
    ? await fetchJson(`wards?ward_no=eq.${wardNo}&select=ward_name,assembly_constituency,zone&limit=1`)
    : null
  const wardName = currentWard?.gba_ward_name ?? legacyWard?.ward_name ?? "Bengaluru"
  const wardLabel = currentWard
    ? `Bengaluru ${currentWard.gba_corporation} · Ward ${gbaWardNo}`
    : legacyWard ? `Historic BBMP ward ${wardNo} · Bengaluru` : "Ward-level civic data"
  const constituency = currentWard?.gba_ac ?? legacyWard?.assembly_constituency ?? ""
  const population = currentWard?.gba_population != null
    ? Number(currentWard.gba_population).toLocaleString("en-IN")
    : ""

  return new ImageResponse(
    (
      <div style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: PAPER.canvas,
        padding: "56px 72px",
        fontFamily: "sans-serif",
      }}>

        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center", alignSelf: "flex-start", borderBottom: `2px solid ${INK}`, paddingBottom: "4px" }}>
          <span style={{ color: INK, fontSize: "26px", fontWeight: 900 }}>KAUN</span>
          <span style={{ color: ACCENT, fontSize: "30px", fontWeight: 900, marginLeft: "2px" }}>?</span>
        </div>

        {/* Ward name */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: "48px" }}>
          <span style={{ color: INK, fontSize: "76px", fontWeight: 800, letterSpacing: "-2px" }}>
            {wardName}
          </span>
          <span style={{ color: ink(0.7), fontSize: "24px", marginTop: "10px" }}>
            {wardLabel}
          </span>
          {constituency ? (
            <span style={{ color: ink(0.7), fontSize: "24px", marginTop: "10px" }}>
              Assembly constituency · {constituency}
            </span>
          ) : null}
        </div>

        {/* The share starts with the place. Political performance belongs on the page. */}
        {population ? (
          <div style={{
            display: "flex",
            alignItems: "center",
            marginTop: "48px",
            backgroundColor: PAPER.DEFAULT,
            border: `2px solid ${ink(0.15)}`,
            padding: "28px 40px",
          }}>
            <span style={{ color: INK, fontSize: "44px", fontWeight: 900, marginRight: "20px" }}>
              {population}
            </span>
            <span style={{ color: ink(0.8), fontSize: "24px", fontWeight: 400 }}>
              people in this ward
            </span>
          </div>
        ) : null}

        {/* Spacer pushes footer down */}
        <div style={{ display: "flex", flex: 1 }} />

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <span style={{ color: ink(0.6), fontSize: "20px" }}>
            Explore your ward&apos;s civic data
          </span>
          <span style={{ color: ink(0.75), fontSize: "22px", fontWeight: 700 }}>
            kaun.city
          </span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
