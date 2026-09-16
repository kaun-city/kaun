/**
 * The share card for the India layer's front door.
 *
 * Static by construction — no fetch, no database, nothing that can be slow or
 * absent — because this is the card that appears when someone shares
 * "kaun.city" itself, which is the most-shared URL the project has. The only
 * number on it is 543, which is a constitutional fact, not a query result.
 *
 * It also covers the post-cutover root: with NEXT_PUBLIC_INDIA_ROOT=1 the bare
 * domain rewrites to /india, so this is what kaun.city unfurls as.
 */
import { ImageResponse } from "next/og"
import { OgFrame, OG_CARD, OG_INK, ogInk } from "@/components/india/OgFrame"
import { LOK_SABHA_SEATS } from "@/lib/india/constants"
import { OG_SIZE } from "@/lib/india/og"
import { ogFonts } from "@/lib/india/og-fonts"

export const size = OG_SIZE
export const contentType = "image/png"
export const alt = `KAUN? — all ${LOK_SABHA_SEATS} Lok Sabha constituencies: who represents you and what they declared`

const CHIPS = [
  `${LOK_SABHA_SEATS} constituencies`,
  "Declared assets & cases",
  "Attendance & questions",
  "Central project overruns",
]

export default async function Image() {
  return new ImageResponse(
    (
      <OgFrame
        headerRight="India · Lok Sabha"
        footerLeft="ECI affidavits via MyNeta · sansad.in · PRS India · MoSPI · MPLADS"
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{
            display: "flex",
            color: ogInk(0.6),
            fontSize: "21px",
            letterSpacing: "1.8px",
            textTransform: "uppercase",
          }}>{LOK_SABHA_SEATS} seats · one page each</div>

          <div style={{
            display: "flex",
            flexDirection: "column",
            color: OG_INK,
            fontSize: "66px",
            fontWeight: 700,
            letterSpacing: "-2px",
            lineHeight: 1.08,
            marginTop: "14px",
          }}>
            <span>Who represents you —</span>
            <span>and what did they declare?</span>
          </div>

          <div style={{
            display: "flex",
            color: ogInk(0.7),
            fontSize: "26px",
            lineHeight: 1.4,
            marginTop: "18px",
            maxWidth: "940px",
          }}>
            Every sitting MP’s declared assets, criminal cases and parliamentary record —
            and the central projects running over budget in their state.
          </div>

          <div style={{ display: "flex", marginTop: "32px" }}>
            {CHIPS.map(label => (
              <div key={label} style={{
                display: "flex",
                marginRight: "14px",
                padding: "10px 20px",
                backgroundColor: OG_CARD,
                border: `1px solid ${ogInk(0.2)}`,
                color: ogInk(0.75),
                fontSize: "19px",
              }}>{label}</div>
            ))}
          </div>
        </div>
      </OgFrame>
    ),
    { ...OG_SIZE, fonts: await ogFonts() },
  )
}
