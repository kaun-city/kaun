/**
 * og.ts — what a Kaun share card is allowed to say.
 *
 * A share card is the most-read thing this site produces. It is forwarded on
 * WhatsApp by people who will never open the page, it is screenshotted, and it
 * carries a named politician's record next to a wordmark. So the decision of
 * WHICH numbers appear, and what they are called, is not a rendering detail —
 * it is the same editorial commitment the constituency page makes, and it
 * belongs in a pure module that a test can pin down.
 *
 * THE RULES, IDENTICAL TO THE PAGE'S:
 *
 *   - No composite score. Ever. Components with their source, nothing that
 *     reduces a member to one number (plans/design-direction.md, item 5).
 *   - NULL is never a zero. `criminal_cases === null` means the affidavit page
 *     could not be read; it renders as "Not recorded", never as "0" and never
 *     as "None declared". Same for assets and attendance.
 *   - A missing fact is stated, not hidden. A seat with no matched affidavit
 *     gets a card that says so in words, because a card with the fact silently
 *     dropped reads as "nothing to declare".
 *   - Ministers do not sign the attendance register. `metrics_excluded` means
 *     the number does not exist, so no attendance fact is offered at all.
 *
 * Pure functions only — no React, no next/og, no fetch — so
 * tests/india-og.test.mjs can exercise every branch, and so the image route
 * stays a dumb renderer of whatever this decides.
 */
import { formatPct, formatRupees } from "./format.ts"
import type { Constituency, Mp, MpActivity, MpAffidavit } from "./types.ts"

/** Every unfurl surface wants 1.91:1. This is that, at the size crawlers cache. */
export const OG_SIZE = { width: 1200, height: 630 } as const

/**
 * Font stack for every India card. Satori resolves it left to right per glyph,
 * so Latin and ₹ come from Inter and a Devanagari seat name falls through to
 * Noto. The faces themselves are loaded in lib/india/og-fonts.ts; this lives
 * here so the frame component can name the stack without pulling the loader
 * (and its filesystem access) along with it.
 */
export const OG_FONT_FAMILY = "Inter, 'Noto Sans Devanagari', sans-serif"

/** One labelled number, with where it came from. Never a number on its own. */
export interface CardFact {
  label: string
  value: string
  /** Provenance, rendered small under the value. */
  note: string | null
}

export interface ConstituencyCard {
  /** Seat name, already truncated to something that fits. */
  title: string
  /** px, chosen so the title occupies one line at 1200px wide. */
  titleSize: number
  /** Devanagari seat name, when in_constituencies has one. */
  hindi: string | null
  /** "Karnataka · Lok Sabha seat 25" */
  eyebrow: string
  mpName: string | null
  mpSize: number
  party: string | null
  /** "4 terms · Minister" — never a judgement, just roster fields. */
  mpMeta: string | null
  facts: CardFact[]
  /**
   * The honest empty state: what this card CANNOT tell you and why. Null when
   * the facts speak for themselves.
   */
  note: string | null
}

// ---------------------------------------------------------------------------
// text fitting
//
// Satori has no text measurement we can query before layout, and an overflowing
// headline is the one defect that makes a share card look broken. So the type
// scale steps down by character count, with a hard truncation past the point
// where even the smallest step would wrap. The buckets were set by rendering
// the longest real values in the table (Lakshadweep, Tiruchchirappalli,
// "Dadra & Nagar Haveli and Daman & Diu") and looking at the PNGs.
// ---------------------------------------------------------------------------

/** Truncate on a word boundary where possible, with a real ellipsis. */
export function truncate(text: string, max: number): string {
  const t = text.trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  const space = cut.lastIndexOf(" ")
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/**
 * Title px for a seat name of this length.
 *
 * The ceiling is set by the densest card, not the prettiest: a seat with a
 * Hindi name, a three-term member, an attendance figure AND the no-affidavit
 * line has about 460px of vertical room, and 78px at the top of this scale is
 * what leaves it. Mumbai South is that card; it overflowed into the wordmark
 * at 86 and fits at 78.
 */
export function titleSizeFor(text: string): number {
  const n = text.length
  if (n <= 13) return 78
  if (n <= 18) return 66
  if (n <= 26) return 54
  if (n <= 34) return 44
  return 36
}

/**
 * "LS18" -> "18th Lok Sabha".
 *
 * The roster's term_label is a database key, and the constituency page can get
 * away with showing it raw because the surrounding page explains itself. A
 * share card has no surrounding page, so it spells the term out.
 */
export function termPhrase(termLabel: string): string {
  const m = /^LS(\d+)$/.exec(termLabel)
  if (!m) return termLabel
  const n = Number(m[1])
  const tens = n % 100
  const suffix = tens >= 11 && tens <= 13
    ? "th"
    : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"
  return `${n}${suffix} Lok Sabha`
}

/** MP name px. Members' names run long ("Shashi Tharoor" to full patronymics). */
export function mpSizeFor(text: string): number {
  const n = text.length
  if (n <= 20) return 42
  if (n <= 30) return 34
  return 28
}

// ---------------------------------------------------------------------------
// facts
// ---------------------------------------------------------------------------

/**
 * The two affidavit facts, in the page's own words.
 *
 * "None declared" and "Not recorded" are deliberately different strings for
 * `0` and `null`: the first is a statement the candidate made, the second is
 * an admission that Kaun could not read the page. Collapsing them would be the
 * single most damaging thing this card could do to a member.
 */
export function affidavitFacts(a: MpAffidavit): CardFact[] {
  const source = `Self-declared · EC affidavit ${a.election}`
  const assets: CardFact = {
    label: "Declared assets",
    value: a.total_assets_inr === null ? "Not stated" : formatRupees(a.total_assets_inr),
    note: source,
  }
  const cases: CardFact =
    a.criminal_cases === null
      ? {
        label: "Criminal cases",
        value: "Not recorded",
        note: "Affidavit not read in full — not a declaration of zero",
      }
      : a.criminal_cases === 0
        ? { label: "Criminal cases", value: "None declared", note: source }
        : {
          label: "Criminal cases",
          value: `${a.criminal_cases} declared`,
          note: source,
        }
  return [assets, cases]
}

/**
 * Attendance, only when it is a real figure for the whole term.
 *
 * TERM ROWS ONLY — NEVER A SESSION ROW, AND NEVER activity[0].
 * This rule was written after a card was rendered for Dadra & Nagar Haveli
 * that read "LOK SABHA ATTENDANCE 0.0%" under a named member's name. The
 * member has no term-cumulative row in PRS's data, only per-session rows, and
 * the newest of those covers a session that is still sitting: 20 sittings
 * held, 0 signed so far, attendance_pct 0.00. Their actual record across the
 * completed sessions is 78% to 100%.
 *
 * A share card is forwarded without its page. "0.0%" on one, attached to a
 * real person's name, is a defamatory falsehood produced by reading a
 * half-finished session as a verdict. So the card takes the term-cumulative
 * row or it takes nothing, and a seat whose member has no term row simply
 * shows no attendance fact.
 *
 * `metrics_excluded` is the other half: ministers and the Speaker do not sign
 * the register at all. The schema stores NULL plus a reason, and this returns
 * null, so no card ever implies a minister was absent.
 */
export function attendanceFact(activity: MpActivity[]): CardFact | null {
  const term = activity.find(a => a.period_kind === "term") ?? null
  if (!term) return null
  if (term.metrics_excluded || term.attendance_pct === null) return null
  return {
    label: "Lok Sabha attendance",
    value: formatPct(term.attendance_pct),
    note: term.session_label ? `PRS India · ${term.session_label}` : "PRS India, this term",
  }
}

// ---------------------------------------------------------------------------
// the card
// ---------------------------------------------------------------------------

export interface ConstituencyCardInput {
  constituency: Constituency
  mp: Mp | null
  affidavit: MpAffidavit | null
  /** Only fetched when there is no affidavit to show. May be empty. */
  activity?: MpActivity[]
}

const NO_AFFIDAVIT =
  "No affidavit matched to this seat yet. Kaun shows nothing rather than a guess."

export function buildConstituencyCard(input: ConstituencyCardInput): ConstituencyCard {
  const { constituency: c, mp, affidavit, activity = [] } = input

  const title = truncate(c.pc_name, 40)
  const eyebrow = `${c.state_name} · Lok Sabha seat ${c.pc_no}`

  if (!mp) {
    return {
      title,
      titleSize: titleSizeFor(title),
      hindi: c.pc_name_hi,
      eyebrow,
      mpName: null,
      mpSize: 42,
      party: null,
      mpMeta: null,
      facts: [],
      note:
        "No sitting MP on record for this seat — the member has died or resigned "
        + "and the bypoll result is not yet in the roster.",
    }
  }

  const terms = mp.no_of_terms ? `${mp.no_of_terms} term${mp.no_of_terms === 1 ? "" : "s"}` : null
  const mpMeta = [terms, mp.is_minister ? "Minister" : null, termPhrase(mp.term_label)]
    .filter(Boolean).join(" · ") || null

  let facts: CardFact[] = []
  let note: string | null = null

  if (affidavit) {
    facts = affidavitFacts(affidavit)
  } else {
    const att = attendanceFact(activity)
    if (att) facts = [att]
    note = mp.is_minister && !att
      ? `${NO_AFFIDAVIT} Attendance is not recorded for ministers.`
      : NO_AFFIDAVIT
  }

  const mpName = truncate(mp.name, 38)
  return {
    title,
    titleSize: titleSizeFor(title),
    hindi: c.pc_name_hi,
    eyebrow,
    mpName,
    mpSize: mpSizeFor(mpName),
    party: mp.party_abbr,
    mpMeta,
    facts,
    note,
  }
}

/**
 * The card that renders when Supabase does not answer.
 *
 * An unfurl has no error state — a crawler that gets a 500 caches a blank
 * preview for as long as it feels like, which is worse than a plain card. So
 * the identity we already hold (the seat key, from the URL) becomes the whole
 * card, and it says what it does not know instead of pretending.
 */
export function fallbackConstituencyCard(pcCode: string): ConstituencyCard {
  const seat = /^[1-9]\d*-[1-9]\d*$/.test(pcCode) ? pcCode : null
  return {
    title: "Lok Sabha constituency",
    titleSize: titleSizeFor("Lok Sabha constituency"),
    hindi: null,
    eyebrow: seat ? `Seat ${seat} · Lok Sabha` : "Lok Sabha",
    mpName: null,
    mpSize: 42,
    party: null,
    mpMeta: null,
    facts: [],
    note: "This card could not reach Kaun’s data just now. The page itself has the current record.",
  }
}
