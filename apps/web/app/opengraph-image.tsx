import { ImageResponse } from "next/og"

export const runtime = "edge"
export const alt = "KAUN? - Bengaluru Civic Accountability"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          backgroundColor: "#0A0A0A",
          padding: "64px 72px",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Subtle grid texture */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: "radial-gradient(circle at 80% 20%, rgba(255,153,51,0.08) 0%, transparent 60%)",
          display: "flex",
        }} />

        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
          <span style={{ color: "white", fontSize: "32px", fontWeight: 900, letterSpacing: "-1px" }}>KAUN</span>
          <span style={{ color: "#2dd4bf", fontSize: "36px", fontWeight: 900 }}>?</span>
        </div>

        {/* Main headline */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", gap: "20px" }}>
          <div style={{ color: "white", fontSize: "68px", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-2px" }}>
            Who is accountable<br />for your ward?
          </div>
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "28px", fontWeight: 400, lineHeight: 1.4 }}>
            MLAs, spending, infrastructure and grievances —<br />ward-level civic data for Bengaluru.
          </div>
        </div>

        {/* Stat chips */}
        <div style={{ display: "flex", gap: "16px", marginBottom: "40px" }}>
          {["243 wards", "MLAs tracked", "RTI generator", "Ask Kaun"].map((label) => (
            <div key={label} style={{
              display: "flex",
              padding: "10px 20px",
              backgroundColor: "rgba(255,153,51,0.12)",
              border: "1px solid rgba(255,153,51,0.25)",
              borderRadius: "100px",
              color: "rgba(255,255,255,0.7)",
              fontSize: "18px",
            }}>
              {label}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ color: "rgba(255,255,255,0.25)", fontSize: "20px" }}>
            Pin a place. Know who is responsible.
          </div>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "22px", fontWeight: 700, letterSpacing: "0.5px" }}>
            kaun.city
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
