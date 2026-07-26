/**
 * OgFrame — the chrome every India share card shares.
 *
 * Not a page component: this is only ever rendered by Satori inside an
 * ImageResponse, so it is written to Satori's subset of CSS — flexbox only,
 * `display: flex` stated on every container, no class names, no CSS variables,
 * no `gap` shorthand ambiguity. Tailwind is not available here at all.
 *
 * The identity is the one the live site already has and the design doc says to
 * keep as canon: near-black #0A0A0A, one saffron accent, wordmark, and the
 * domain in the corner so a screenshot of the card still says where it came
 * from. Anything a card asserts sits between this header and this footer.
 */
import type { CSSProperties, ReactNode } from "react"
import { OG_FONT_FAMILY } from "@/lib/india/og"

export const OG_BG = "#0A0A0A"
export const OG_SAFFRON = "#FF9933"

/** Wordmark, at the two sizes the cards use. */
export function OgWordmark({ scale = 1 }: { scale?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline" }}>
      <span style={{
        color: "white",
        fontSize: `${34 * scale}px`,
        fontWeight: 700,
        letterSpacing: "-1px",
      }}>KAUN</span>
      <span style={{
        color: OG_SAFFRON,
        fontSize: `${38 * scale}px`,
        fontWeight: 700,
      }}>?</span>
    </div>
  )
}

export function OgFrame({
  headerRight,
  footerLeft,
  children,
}: {
  /** Small muted label opposite the wordmark. */
  headerRight?: ReactNode
  /** The line that says where the numbers came from. */
  footerLeft?: ReactNode
  children: ReactNode
}) {
  const row: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  }
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: OG_BG,
        padding: "44px 64px 38px",
        fontFamily: OG_FONT_FAMILY,
        position: "relative",
      }}
    >
      {/* Accent wash, top-right — the same one the city card uses. */}
      <div style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        backgroundImage: "radial-gradient(circle at 82% 12%, rgba(255,153,51,0.10) 0%, transparent 58%)",
      }} />
      {/* Saffron rule along the top edge: the card's one piece of brand colour
          that survives being viewed at 200px wide in a chat list. */}
      <div style={{
        position: "absolute",
        top: 0, left: 0, right: 0, height: "6px",
        display: "flex",
        backgroundColor: OG_SAFFRON,
      }} />

      <div style={row}>
        <OgWordmark />
        {headerRight ? (
          <div style={{
            display: "flex",
            color: "rgba(255,255,255,0.35)",
            fontSize: "20px",
            letterSpacing: "0.5px",
          }}>{headerRight}</div>
        ) : <div style={{ display: "flex" }} />}
      </div>

      {/*
        The safe area. `overflow: hidden` is a guarantee, not a style: the type
        scale is tuned so real content fits, but a seat name or member name
        longer than anything in today's table must clip at the edge of this box
        rather than ride up into the wordmark or down through the footer.
      */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        justifyContent: "center",
        overflow: "hidden",
      }}>
        {children}
      </div>

      <div style={row}>
        <div style={{
          display: "flex",
          color: "rgba(255,255,255,0.22)",
          fontSize: "17px",
          maxWidth: "780px",
        }}>{footerLeft ?? ""}</div>
        <div style={{
          display: "flex",
          color: "rgba(255,255,255,0.5)",
          fontSize: "21px",
          fontWeight: 700,
          letterSpacing: "0.5px",
        }}>kaun.city</div>
      </div>
    </div>
  )
}
