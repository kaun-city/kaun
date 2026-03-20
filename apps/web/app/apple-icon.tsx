import { ImageResponse } from "next/og"

export const runtime = "edge"
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
          backgroundColor: "#0A0A0A",
          borderRadius: 40,
        }}
      >
        <span style={{ color: "white", fontSize: 80, fontWeight: 900, letterSpacing: -4, fontFamily: "sans-serif" }}>K</span>
        <span style={{ color: "#FF9933", fontSize: 96, fontWeight: 900, marginTop: -8, fontFamily: "sans-serif" }}>?</span>
      </div>
    ),
    { ...size }
  )
}
