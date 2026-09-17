import type { MpAffidavit } from "./types"

/**
 * Rows for the declarations timeline: this affidavit, then MyNeta's history.
 *
 * One election can appear more than once — a declaration for each seat
 * contested, or a by-election held during the same term, filed under the same
 * label (21 of 543 LS2024 winners, Sep 2026). Two rows reading "Lok Sabha 2019"
 * with different figures look like an error, and a React key made of the label
 * collides. So a repeated election names its seat where MyNeta settles it
 * ("Lok Sabha 2019 · Amethi", "Telangana 2018 · Huzurabad by-election") and
 * says "separate nomination" where it does not. Nothing is merged or dropped.
 */

export interface NominationRow {
  key: string
  election: string
  /** Seat, "<seat> by-election" or "separate nomination"; only on repeated elections. */
  qualifier: string | null
  assets: number | null
  cases: number | null
  current: boolean
}

type TimelineAffidavit = Pick<
  MpAffidavit,
  "election" | "constituency_label" | "total_assets_inr" | "criminal_cases" | "declared_assets_history"
>

/** "Loksabha 2014", "Lok Sabha 2014" and "LokSabha2014" are one election. */
export function electionKey(label: string | null | undefined): string {
  return String(label ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")
}

/**
 * MyNeta's seat names are mostly upper case: "RAE BARELI" -> "Rae Bareli",
 * "BHADAUR (SC)" -> "Bhadaur (SC)". Anything with a digit ("MAH 3", a Rajya
 * Sabha seat code) or already in mixed case is left exactly as published, and
 * so are initials such as "C.V.".
 */
export function seatName(label: string | null | undefined): string | null {
  const s = String(label ?? "").replace(/\s+/g, " ").trim()
  if (!s) return null
  if (/\d/.test(s) || s !== s.toUpperCase()) return s
  return s
    .split(" ")
    .map(word => (/^\(.*\)$/.test(word) || word.includes(".") ? word : word.charAt(0) + word.slice(1).toLowerCase()))
    .join(" ")
}

export function nominationRows(affidavit: TimelineAffidavit): { rows: NominationRow[]; hasRepeats: boolean } {
  const history = affidavit.declared_assets_history ?? []
  const entries = [
    {
      election: affidavit.election.replace(/^LokSabha/, "Lok Sabha "),
      assets: affidavit.total_assets_inr,
      cases: affidavit.criminal_cases,
      current: true,
      seat: seatName(affidavit.constituency_label),
      byElection: false,
    },
    ...history.map(h => ({
      election: h.election,
      assets: h.declared_assets_inr,
      cases: h.declared_cases,
      current: false,
      seat: seatName(h.constituency),
      byElection: h.by_election === true,
    })),
  ]

  const counts = new Map<string, number>()
  for (const e of entries) counts.set(electionKey(e.election), (counts.get(electionKey(e.election)) ?? 0) + 1)
  const repeated = (e: { election: string }) => (counts.get(electionKey(e.election)) ?? 0) > 1

  const rows = entries.map((e, i) => ({
    key: `${i}-${electionKey(e.election)}`,
    election: e.election,
    qualifier: !repeated(e)
      ? null
      : e.seat
        ? `${e.seat}${e.byElection ? " by-election" : ""}`
        : e.current ? "this seat" : "separate nomination",
    assets: e.assets,
    cases: e.cases,
    current: e.current,
  }))
  return { rows, hasRepeats: entries.some(repeated) }
}
