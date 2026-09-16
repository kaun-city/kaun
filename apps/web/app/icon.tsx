import { ImageResponse } from "next/og"
import { ACCENT, INK, PAPER } from "@/lib/design-tokens"

export const size = { width: 32, height: 32 }
export const contentType = "image/png"

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // The site's wordmark chip: paper, square, a 2px ink rule beneath.
          backgroundColor: PAPER.DEFAULT,
          borderBottom: `2px solid ${INK}`,
        }}
      >
        <span style={{ color: INK, fontSize: 16, fontWeight: 900, letterSpacing: -1, fontFamily: "sans-serif" }}>K</span>
        <span style={{ color: ACCENT, fontSize: 18, fontWeight: 900, marginTop: -2, fontFamily: "sans-serif" }}>?</span>
      </div>
    ),
    { ...size }
  )
}
