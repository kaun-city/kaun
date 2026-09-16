export { GBA_CROSSWALK_URL, GBA_CROSSWALK_VERSION } from "./constants.ts"

export interface HistoricalWardRef {
  ward_no: number
  ward_name: string
  /** Fraction of the current ward covered by this historical ward. */
  current_share: number
  /** Fraction of the historical ward covered by this current ward. */
  legacy_share: number
}

export interface GbaCrosswalkRow {
  corporation_id: number
  ward_no: number
  ward_name: string
  primary_legacy_ward_no: number | null
  primary_current_share: number
  outside_legacy_share: number
  tier: "outside" | "clear-primary" | "split-primary" | "ambiguous"
  historical_wards: HistoricalWardRef[]
}

export interface GbaCrosswalkArtifact {
  version: string
  rows: GbaCrosswalkRow[]
}

export function gbaWardKey(corporationId: number, wardNo: number): string {
  return `${corporationId}:${wardNo}`
}

export function indexGbaCrosswalk(artifact: GbaCrosswalkArtifact): Map<string, GbaCrosswalkRow> {
  return new Map(artifact.rows.map(row => [gbaWardKey(row.corporation_id, row.ward_no), row]))
}

/**
 * Kaun's live "material overlap" cutoff. It is the same policy as the prod
 * `ward_crosswalk` table (every pair has share >= 0.10, plus the primary)
 * that backs `v_work_orders_243`. Do not invent a second threshold.
 */
export const MATERIAL_OVERLAP = 0.1

/**
 * Former DataMeet-243 wards whose ward-tagged *records* (work orders,
 * contractors, signals, grievances, licences, water/air readings) may be
 * listed under a current ward. A record list cannot be split by area, so a
 * former ward must overlap materially in both directions: it covers >= 10% of
 * the current ward AND >= 10% of it lies inside the current ward. The ref with
 * the largest current_share is always kept so no in-city ward ends up with no
 * record source. Additive totals must keep using the full vector with
 * legacy_share weights; this filter is only for lists and names.
 */
export function attributableHistoricalWards(refs: readonly HistoricalWardRef[]): HistoricalWardRef[] {
  if (!refs.length) return []
  const primary = refs.reduce((best, ref) => (ref.current_share > best.current_share ? ref : best))
  return refs.filter(ref =>
    ref === primary || (ref.current_share >= MATERIAL_OVERLAP && ref.legacy_share >= MATERIAL_OVERLAP),
  )
}

/** A row of bengaluru-ward-crosswalk.json (BBMP-Final-225 -> DataMeet-243). */
export interface LegacySourceWardRow {
  bbmp225_no: number
  /** Primary (max-overlap) DataMeet-243 ward for this 225 ward. */
  datameet243_no?: number | null
  /** share = fraction of the 225 ward inside that 243 ward. */
  shares?: Array<{ datameet243_no: number; share: number }>
}

/**
 * BBMP-Final-225 wards whose records (work orders, contractor_profiles.wards)
 * are attributable to a DataMeet-243 ward. Mirrors the prod `ward_crosswalk`
 * pairs exactly: share >= MATERIAL_OVERLAP, or the 243 ward is the 225 ward's
 * primary match.
 */
export function sourceWardNosForLegacyWard(rows: readonly LegacySourceWardRow[], wardNo: number): number[] {
  return rows
    .filter(row =>
      row.datameet243_no === wardNo ||
      (row.shares ?? []).some(share => share.datameet243_no === wardNo && share.share >= MATERIAL_OVERLAP),
    )
    .map(row => row.bbmp225_no)
}

/** Minimal current-ward crosswalk row needed to attribute records. */
export interface CurrentWardRecordRow {
  corporation_id: number
  ward_no: number
  historical_wards: HistoricalWardRef[]
}

/**
 * BBMP-225 source wards whose ward-tagged records belong to a current GBA
 * ward: the attributable former 243 wards, bridged to 225 with the same
 * material-overlap rule. This is exactly what the ward card queries, so any
 * city-wide view (map layers) must use it too.
 */
export function sourceWardNosForCurrentWard(
  row: CurrentWardRecordRow,
  sourceRows: readonly LegacySourceWardRow[],
): Set<number> {
  const sources = new Set<number>()
  for (const ref of attributableHistoricalWards(row.historical_wards)) {
    for (const source of sourceWardNosForLegacyWard(sourceRows, ref.ward_no)) sources.add(source)
  }
  return sources
}

/**
 * Count flagged contractor profiles per current ward ("corp:ward"), counting a
 * profile once per ward when any of its BBMP-225 work-order wards is an
 * attributable source for that ward.
 */
export function flaggedContractorCountsByCurrentWard(
  currentRows: readonly CurrentWardRecordRow[],
  sourceRows: readonly LegacySourceWardRow[],
  profiles: ReadonlyArray<{ wards: readonly number[] | null; blacklist_flags: readonly unknown[] | null }>,
): Record<string, number> {
  const flagged = profiles.filter(profile => Array.isArray(profile.blacklist_flags) && profile.blacklist_flags.length > 0)
  const counts: Record<string, number> = {}
  for (const row of currentRows) {
    const sources = sourceWardNosForCurrentWard(row, sourceRows)
    if (!sources.size) continue
    const count = flagged.filter(profile => (profile.wards ?? []).some(ward => sources.has(ward))).length
    if (count > 0) counts[gbaWardKey(row.corporation_id, row.ward_no)] = count
  }
  return counts
}
