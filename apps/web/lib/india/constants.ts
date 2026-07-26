/**
 * Shared constants for the India layer.
 *
 * Kept apart from lib/constants.ts (which the Bengaluru UI owns) so nothing
 * here can affect the city surface, and so this module stays importable by the
 * node:test suite — pure data only.
 */
import type { SourceEntry } from "@/components/india/SourcesFooter"

/** Must match PC_GEOJSON_VERSION in scripts/india/build-pc-geojson.mjs.
 *  tests/india-surface.test.mjs asserts the two agree. */
export const PC_GEOJSON_VERSION = "2024-2026.07"

/**
 * The committed boundary asset. Served statically; middleware skips it.
 *
 * 1.4 MB, fetched on every load of the national map, and it changes only when
 * a delimitation does. next.config.ts serves it `immutable` for a year, which
 * is only safe because the URL carries the asset's own version: bump
 * PC_GEOJSON_VERSION (the test above asserts the file and the constant agree)
 * and every client asks for a different URL. Query strings are part of the
 * cache key in browsers and on the Vercel CDN alike, and the proxy matcher
 * keys off the pathname, so the versioned URL still skips middleware.
 */
export const PC_GEOJSON_URL = `/india-pc.geojson?v=${PC_GEOJSON_VERSION}`

/**
 * How long a rendered India page may be reused before Next re-renders it, and
 * how long a PostgREST read stays in the Data Cache.
 *
 * An hour, chosen against the refresh crons rather than by feel — nothing
 * behind these pages moves faster than weekly:
 *
 *   refresh-india-roster      Sundays 04:00 UTC   (sitting MPs)
 *   refresh-india-mospi       5th of the month    (central project snapshots)
 *   refresh-india-mplads      6th of the month    (MPLADS utilisation)
 *   refresh-india-affidavits  manual only         (ECI affidavits)
 *
 * So the worst case is a page an hour behind a monthly file. Shorter would buy
 * nothing a visitor could observe; longer would make a correction to a wrong
 * fact — the thing this site is for — sit unpublished.
 */
export const INDIA_REVALIDATE_SECONDS = 3600

/** Total Lok Sabha seats. Used for "N of 543" copy and as a build assertion. */
export const LOK_SABHA_SEATS = 543

/** Map defaults: the whole country in frame on a laptop. */
export const INDIA_CENTER: [number, number] = [22.5, 80.0]
export const INDIA_ZOOM = 4.4
export const INDIA_MIN_ZOOM = 3.5
/** A single seat is a district-sized object; past this the outline is noise. */
export const INDIA_MAX_ZOOM = 10

/**
 * The datasets behind the India layer, in the shape the sources footer renders.
 * One list, so the constituency page and the tracker cite the same thing the
 * same way — the ward pages drifted on this and it took a PR to reconcile.
 */
export const SOURCE_PC_BOUNDARIES: SourceEntry = {
  name: "Parliamentary constituency boundaries (543 seats)",
  publisher: "DataMeet + shijithpk 2024 supplement",
  period: "2008 delimitation, with 2022 J&K / 2023 Assam corrections",
  url: "https://github.com/datameet/maps/tree/master/parliamentary-constituencies",
  caveat: "Assam, J&K and Ladakh outlines were re-georeferenced from ECI press-note PDFs by the supplement's author, who states they are not survey-grade.",
}

export const SOURCE_ROSTER: SourceEntry = {
  name: "MP roster — 18th Lok Sabha",
  publisher: "sansad.in (Lok Sabha Secretariat)",
  period: "Live; pulled 2026-07-25",
  url: "https://sansad.in",
  caveat: "sansad.in publishes constituency names with no seat number. Names are resolved to a pc_code through an alias table and exact normalized matching only — never by similarity.",
}

export const SOURCE_AFFIDAVITS: SourceEntry = {
  name: "Criminal cases, assets, education",
  publisher: "ECI nomination affidavits via myneta.info (ADR)",
  period: "Lok Sabha 2024",
  url: "https://myneta.info",
  caveat: "Self-declared by the candidate in their Election Commission nomination affidavit. Kaun reproduces the declaration; it does not verify it.",
}

export const SOURCE_ACTIVITY: SourceEntry = {
  name: "Attendance, questions, debates",
  publisher: "PRS Legislative Research MP Track",
  period: "24 Jun 2024 – 18 Apr 2026",
  url: "https://prsindia.org/mptrack",
  caveat: "Ministers and the Speaker do not sign the attendance register, ask questions or introduce private member bills. Their metrics are recorded as not applicable, never as zero.",
}

export const SOURCE_MPLADS: SourceEntry = {
  name: "MPLADS allocation and spend",
  publisher: "eSAKSHI (MoSPI)",
  period: "18th Lok Sabha, to date",
  url: "https://mplads.gov.in",
}

export const SOURCE_MOSPI: SourceEntry = {
  name: "Central projects ≥ ₹150 crore — cost and schedule",
  publisher: "MoSPI Flash Report, Table 6 (PAIMANA)",
  period: "Monthly; ~7–8 week publication lag",
  url: "https://www.mospi.gov.in",
  caveat: "MoSPI publishes these with a state column and nothing finer — there is no district or constituency breakdown in the source.",
}

/** Rendered under the project card on every constituency page. */
export const MOSPI_STATE_LEVEL_NOTE =
  "MoSPI reports central projects by state only. These are the state's projects, not this constituency's — no district or constituency breakdown is published in the source, and Kaun does not guess one from a project's name."
