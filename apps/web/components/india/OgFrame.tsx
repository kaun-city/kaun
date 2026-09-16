/**
 * OgFrame — the chrome every India share card shares.
 *
 * Not a page component: this is only ever rendered by Satori inside an
 * ImageResponse, so it is written to Satori's subset of CSS — flexbox only,
 * `display: flex` stated on every container, no class names, no CSS variables,
 * no `gap` shorthand ambiguity. Tailwind is not available here at all.
 *
 * The identity is the live site's Signal on Paper: paper canvas, one ink with
 * hierarchy by opacity, the wordmark over a 2px ink rule with its "?" in
 * accent, and the domain in the corner so a screenshot of the card still says
 * where it came from. Colours come from lib/design-tokens.ts, never literals.
 * Anything a card asserts sits between this header and this footer.
 */
import type { CSSProperties, ReactNode } from "react"
import { ACCENT, DANGER, INK, PAPER } from "@/lib/design-tokens"
import { OG_FONT_FAMILY } from "@/lib/india/og"

export const OG_BG = PAPER.canvas
export const OG_CARD = PAPER.DEFAULT
export const OG_INK = INK
export const OG_ACCENT = ACCENT
export const OG_DANGER = DANGER

/**
 * Ink at an opacity, as 8-digit hex (Satori reads it). Text stays at 0.6 or
 * above — the contrast floor on paper; lower is for rules and fills only.
 */
export function ogInk(alpha: number): string {
  return INK + Math.round(alpha * 255).toString(16).padStart(2, "0")
}

/** Wordmark, at the two sizes the cards use. */
export function OgWordmark({ scale = 1 }: { scale?: number }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "baseline",
      borderBottom: `${2 * scale}px solid ${INK}`,
      paddingBottom: `${4 * scale}px`,
    }}>
      <span style={{
        color: INK,
        fontSize: `${34 * scale}px`,
        fontWeight: 700,
        letterSpacing: "-1px",
      }}>KAUN</span>
      <span style={{
        color: ACCENT,
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
      {/* Ink rule along the top edge: the card's edge still reads as a sheet
          when it is viewed at 200px wide in a chat list. */}
      <div style={{
        position: "absolute",
        top: 0, left: 0, right: 0, height: "6px",
        display: "flex",
        backgroundColor: INK,
      }} />

      <div style={row}>
        <OgWordmark />
        {headerRight ? (
          <div style={{
            display: "flex",
            color: ogInk(0.6),
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
          color: ogInk(0.6),
          fontSize: "17px",
          maxWidth: "780px",
        }}>{footerLeft ?? ""}</div>
        <div style={{
          display: "flex",
          color: ogInk(0.75),
          fontSize: "21px",
          fontWeight: 700,
          letterSpacing: "0.5px",
        }}>kaun.city</div>
      </div>
    </div>
  )
}
