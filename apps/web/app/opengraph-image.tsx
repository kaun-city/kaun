import { ImageResponse } from "next/og"
import { ACCENT, INK, PAPER } from "@/lib/design-tokens"

export const alt = "KAUN? - Bengaluru Civic Accountability"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

/** Ink at an opacity (8-digit hex). Text stays at 0.6+, the contrast floor on paper. */
const ink = (alpha: number) => INK + Math.round(alpha * 255).toString(16).padStart(2, "0")

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          backgroundColor: PAPER.canvas,
          padding: "64px 72px",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center", alignSelf: "flex-start", gap: "2px", borderBottom: `2px solid ${INK}`, paddingBottom: "4px" }}>
          <span style={{ color: INK, fontSize: "32px", fontWeight: 900, letterSpacing: "-1px" }}>KAUN</span>
          <span style={{ color: ACCENT, fontSize: "36px", fontWeight: 900 }}>?</span>
        </div>

        {/* Main headline */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", gap: "20px" }}>
          <div style={{ display: "flex", flexDirection: "column", color: INK, fontSize: "68px", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-2px" }}>
            <span>Who is accountable</span>
            <span>for your ward?</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", color: ink(0.7), fontSize: "28px", fontWeight: 400, lineHeight: 1.4 }}>
            <span>MLAs, spending, infrastructure and grievances —</span>
            <span>ward-level civic data for Bengaluru.</span>
          </div>
        </div>

        {/* Stat chips */}
        <div style={{ display: "flex", gap: "16px", marginBottom: "40px" }}>
          {["369 current wards", "MLAs tracked", "RTI generator", "Ask Kaun"].map((label) => (
            <div key={label} style={{
              display: "flex",
              padding: "10px 20px",
              backgroundColor: PAPER.DEFAULT,
              border: `1px solid ${ink(0.2)}`,
              color: ink(0.75),
              fontSize: "18px",
            }}>
              {label}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: ink(0.6), fontSize: "20px" }}>
            Pin a place. Know who is responsible.
          </span>
          <span style={{ color: ink(0.75), fontSize: "22px", fontWeight: 700, letterSpacing: "0.5px" }}>
            kaun.city
          </span>
        </div>
      </div>
    ),
    { ...size }
  )
}
