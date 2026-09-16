export { GBA_CROSSWALK_URL, GBA_CROSSWALK_VERSION } from "./constants"

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
