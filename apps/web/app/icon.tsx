import { ImageResponse } from "next/og"

export const runtime = "edge"
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
          backgroundColor: "#0A0A0A",
          borderRadius: 6,
        }}
      >
        <span style={{ color: "white", fontSize: 16, fontWeight: 900, letterSpacing: -1, fontFamily: "sans-serif" }}>K</span>
        <span style={{ color: "#2dd4bf", fontSize: 18, fontWeight: 900, marginTop: -2, fontFamily: "sans-serif" }}>?</span>
      </div>
    ),
    { ...size }
  )
}
