import { ImageResponse } from "next/og"
import { ACCENT, INK, PAPER } from "@/lib/design-tokens"

export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // The site's wordmark chip: paper, square (iOS applies its own mask),
          // an ink rule beneath at the 2px rule's scale.
          backgroundColor: PAPER.DEFAULT,
          borderBottom: `8px solid ${INK}`,
        }}
      >
        <span style={{ color: INK, fontSize: 80, fontWeight: 900, letterSpacing: -4, fontFamily: "sans-serif" }}>K</span>
        <span style={{ color: ACCENT, fontSize: 96, fontWeight: 900, marginTop: -8, fontFamily: "sans-serif" }}>?</span>
      </div>
    ),
    { ...size }
  )
}
