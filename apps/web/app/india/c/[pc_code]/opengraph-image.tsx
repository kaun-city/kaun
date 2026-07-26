/**
 * The share card for one Lok Sabha seat.
 *
 * WHY THIS ROUTE EXISTS. A constituency URL is the thing people forward. Until
 * now kaun.city/c/29-25 unfurled as a bare link on WhatsApp and LinkedIn — no
 * image, no seat name, nothing that says a real record is on the other side.
 * This gives every one of the 543 seats a card built from the same rows the
 * page renders.
 *
 * WHAT IT MAY SAY is decided in lib/india/og.ts, not here. This file is a dumb
 * renderer: it loads the minimum rows, hands them to buildConstituencyCard(),
 * and draws whatever comes back. That split is what lets tests pin the
 * editorial rules (NULL ≠ 0, no composite score, ministers have no attendance)
 * without rendering a PNG.
 *
 * IT MUST NOT FAIL. A crawler that receives a 500 caches a blank preview, and
 * it will not come back soon to find out we fixed it. So every failure path —
 * bad pc_code, unknown seat, Supabase unreachable, an exception anywhere in
 * the fetches — lands on fallbackConstituencyCard(), an identity-only card
 * that names the seat and admits it could not read the data. There is no
 * branch through this file that returns anything but a 1200×630 PNG.
 *
 * FETCHES ARE COUNTED. Three round trips in the normal case (constituency,
 * then MP and affidavit in parallel), and a fourth only when there is no
 * affidavit and attendance is the fact worth showing instead. The result is
 * revalidated hourly so a viral link does not turn every crawler retry into
 * fresh database load; these rows change on a loader's schedule, not a page
 * view's.
 */
import { ImageResponse } from "next/og"
import { OgFrame, OG_SAFFRON } from "@/components/india/OgFrame"
import { fetchActivity, fetchAffidavit, fetchConstituency, fetchSittingMp } from "@/lib/india/api"
import { buildConstituencyCard, fallbackConstituencyCard, OG_SIZE, type ConstituencyCard } from "@/lib/india/og"
import { ogFonts } from "@/lib/india/og-fonts"
import { isPcCode } from "@/lib/india/pc-code"
import { PARTY_COLORS } from "@/lib/constants"
import type { MpActivity } from "@/lib/india/types"

export const size = OG_SIZE
export const contentType = "image/png"
export const alt = "KAUN? — who holds this Lok Sabha seat and what they declared"

/** Hourly. The underlying rows move when a loader runs, not when a link spreads. */
export const revalidate = 3600

type Props = { params: Promise<{ pc_code: string }> }

async function loadCard(pcCode: string): Promise<ConstituencyCard> {
  try {
    if (!isPcCode(pcCode)) return fallbackConstituencyCard(pcCode)
    const constituency = await fetchConstituency(pcCode)
    if (!constituency) return fallbackConstituencyCard(pcCode)

    const [mp, affidavit] = await Promise.all([
      fetchSittingMp(pcCode),
      fetchAffidavit(pcCode),
    ])
    // Only when there is no affidavit is attendance worth a fourth round trip.
    const activity: MpActivity[] = mp && !affidavit ? await fetchActivity(mp.id, pcCode) : []

    return buildConstituencyCard({ constituency, mp, affidavit, activity })
  } catch {
    return fallbackConstituencyCard(pcCode)
  }
}

function Fact({ label, value, note }: { label: string; value: string; note: string | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "500px" }}>
      <div style={{
        display: "flex",
        color: "rgba(255,255,255,0.35)",
        fontSize: "16px",
        letterSpacing: "1.4px",
        textTransform: "uppercase",
      }}>{label}</div>
      <div style={{
        display: "flex",
        color: "white",
        fontSize: "34px",
        fontWeight: 700,
        marginTop: "6px",
      }}>{value}</div>
      {note && (
        <div style={{
          display: "flex",
          color: "rgba(255,255,255,0.28)",
          fontSize: "15px",
          marginTop: "5px",
        }}>{note}</div>
      )}
    </div>
  )
}

export default async function Image({ params }: Props) {
  const { pc_code } = await params
  const [card, fonts] = await Promise.all([loadCard(pc_code), ogFonts()])
  const partyColor = card.party ? PARTY_COLORS[card.party] ?? "#8A8A8A" : "#8A8A8A"

  return new ImageResponse(
    (
      <OgFrame
        headerRight="Lok Sabha constituency"
        footerLeft={card.facts.length > 0
          ? "Every figure is self-declared or officially published, and named beside it."
          : "Kaun publishes what it can cite, and says plainly what it cannot."}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          {/* identity */}
          <div style={{
            display: "flex",
            color: OG_SAFFRON,
            fontSize: "20px",
            letterSpacing: "1.6px",
            textTransform: "uppercase",
            opacity: 0.85,
          }}>{card.eyebrow}</div>

          <div style={{
            display: "flex",
            color: "white",
            fontSize: `${card.titleSize}px`,
            fontWeight: 700,
            letterSpacing: "-1.5px",
            lineHeight: 1.05,
            marginTop: "10px",
          }}>{card.title}</div>

          {card.hindi && (
            <div style={{
              display: "flex",
              color: "rgba(255,255,255,0.38)",
              fontSize: "26px",
              marginTop: "4px",
            }}>{card.hindi}</div>
          )}

          {/* who holds it */}
          {card.mpName && (
            <div style={{ display: "flex", flexDirection: "column", marginTop: "22px" }}>
              <div style={{
                display: "flex",
                color: "rgba(255,255,255,0.35)",
                fontSize: "16px",
                letterSpacing: "1.4px",
                textTransform: "uppercase",
              }}>Sitting MP</div>
              <div style={{ display: "flex", alignItems: "center", marginTop: "4px" }}>
                <div style={{
                  display: "flex",
                  color: "white",
                  fontSize: `${card.mpSize}px`,
                  fontWeight: 700,
                }}>{card.mpName}</div>
                {card.party && (
                  <div style={{
                    display: "flex",
                    marginLeft: "14px",
                    padding: "5px 14px",
                    borderRadius: "8px",
                    backgroundColor: `${partyColor}26`,
                    color: partyColor,
                    fontSize: "20px",
                    fontWeight: 700,
                  }}>{card.party}</div>
                )}
              </div>
              {card.mpMeta && (
                <div style={{
                  display: "flex",
                  color: "rgba(255,255,255,0.3)",
                  fontSize: "18px",
                  marginTop: "4px",
                }}>{card.mpMeta}</div>
              )}
            </div>
          )}

          {/* the facts, or the reason there are none */}
          {card.facts.length > 0 && (
            <div style={{ display: "flex", marginTop: "24px" }}>
              {card.facts.map(f => (
                <Fact key={f.label} label={f.label} value={f.value} note={f.note} />
              ))}
            </div>
          )}

          {/*
            The honest empty state, as a rule-and-sentence rather than a boxed
            callout: a box costs ~30px of padding, and the densest card — a
            member with attendance but no matched affidavit — does not have
            30px to spare. The saffron rule carries the emphasis instead.
          */}
          {card.note && (
            <div style={{
              display: "flex",
              alignItems: "stretch",
              marginTop: card.facts.length > 0 ? "18px" : "26px",
              maxWidth: "1000px",
            }}>
              <div style={{
                display: "flex",
                width: "3px",
                backgroundColor: "rgba(255,153,51,0.55)",
                marginRight: "14px",
              }} />
              <div style={{
                display: "flex",
                color: "rgba(255,255,255,0.45)",
                fontSize: "19px",
                lineHeight: 1.4,
              }}>{card.note}</div>
            </div>
          )}
        </div>
      </OgFrame>
    ),
    { ...OG_SIZE, fonts },
  )
}
