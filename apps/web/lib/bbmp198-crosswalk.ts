import { MATERIAL_OVERLAP, attributableHistoricalWards, type HistoricalWardRef } from "./gba-crosswalk.ts"

export { BBMP198_CROSSWALK_URL, BBMP198_CROSSWALK_VERSION } from "./constants.ts"

/**
 * BBMP-198 (2010 delimitation) -> DataMeet-243 crosswalk helpers.
 *
 * ward_spend_category, ward_potholes and ward_committee_meetings carry BBMP
 * 198-ward numbers. They reach a DataMeet-243 ward (and from there a current
 * GBA ward) only through this spatial crosswalk, never by ward number.
 * Built by scripts/wardmap/build-bbmp198-crosswalk.mjs; method in
 * data/ward-crosswalk/METHODOLOGY.md.
 */

export interface Bbmp198Ref {
  /** BBMP-198 ward number, as stored in the 198-keyed tables. */
  ward_no: number
  ward_name: string
  /** Fraction of the 243 ward covered by this 198 ward. */
  dm243_share: number
  /** Fraction of this 198 ward inside the 243 ward: the allocation weight for additive totals. */
  bbmp198_share: number
}

export interface Bbmp198CrosswalkRow {
  datameet243_no: number
  datameet243_name: string
  primary_bbmp198_no: number | null
  primary_dm243_share: number
  outside_bbmp198_share: number
  tier: "outside" | "clear-primary" | "split-primary" | "ambiguous"
  bbmp198_wards: Bbmp198Ref[]
}

export interface Bbmp198CrosswalkArtifact {
  version: string
  rows: Bbmp198CrosswalkRow[]
}

export type Bbmp198Index = ReadonlyMap<number, Bbmp198CrosswalkRow>

export function indexBbmp198Crosswalk(artifact: Bbmp198CrosswalkArtifact): Map<number, Bbmp198CrosswalkRow> {
  return new Map(artifact.rows.map(row => [row.datameet243_no, row]))
}

/**
 * Allocation weight of every BBMP-198 ward for a set of DataMeet-243 wards
 * that are themselves weighted by legacy_share (a current GBA ward's overlap
 * vector, or a single 243 ward with legacy_share 1):
 * weight(198) = Σ legacy_share(243) × bbmp198_share(198 → 243).
 * An additive 198 total contributes value × weight to the estimate.
 */
export function bbmp198AllocationWeights(
  historicalWards: ReadonlyArray<Pick<HistoricalWardRef, "ward_no" | "legacy_share">>,
  index: Bbmp198Index,
): Map<number, number> {
  const weights = new Map<number, number>()
  for (const legacy of historicalWards) {
    const row = index.get(legacy.ward_no)
    if (!row || !(legacy.legacy_share > 0)) continue
    for (const ref of row.bbmp198_wards) {
      if (!(ref.bbmp198_share > 0)) continue
      weights.set(ref.ward_no, (weights.get(ref.ward_no) ?? 0) + legacy.legacy_share * ref.bbmp198_share)
    }
  }
  return weights
}

/**
 * Σ weight × value over the 198 rows that exist. Null when none of the
 * weighted 198 wards has a row, so "no data" never reads as zero.
 */
export function allocateBbmp198<T extends { ward_no: number }>(
  weights: ReadonlyMap<number, number>,
  rows: readonly T[],
  read: (row: T) => number | null | undefined,
): number | null {
  let total = 0
  let found = false
  for (const row of rows) {
    const weight = weights.get(row.ward_no)
    const value = Number(read(row))
    if (weight === undefined || read(row) == null || !Number.isFinite(value)) continue
    total += weight * value
    found = true
  }
  return found ? total : null
}

/**
 * Allocate a city-wide map of 198-keyed additive values to every 243 ward
 * (keyed by 243 ward number). A 243 ward is present only when at least one
 * overlapping 198 ward has a value.
 */
export function bbmp198ValuesToDatameet243(
  values: Readonly<Record<string, number>>,
  index: Bbmp198Index,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const row of index.values()) {
    let total = 0
    let found = false
    for (const ref of row.bbmp198_wards) {
      const value = values[String(ref.ward_no)]
      if (value === undefined || !(ref.bbmp198_share > 0)) continue
      total += value * ref.bbmp198_share
      found = true
    }
    if (found) out[String(row.datameet243_no)] = total
  }
  return out
}

export interface Bbmp198Estimate<F extends string> {
  /** Allocated values, rounded to whole units (rupees, complaints). */
  values: Record<F, number>
  /** The 198 wards with data that contributed, and the share of each allocated here. */
  bbmp198_wards: Array<{ ward_no: number; ward_name: string; bbmp198_share: number }>
}

/**
 * Estimate additive 198-keyed fields for one DataMeet-243 ward (the public
 * API's ward reference). Null when no overlapping 198 ward has a row.
 */
export function estimateDatameet243FromBbmp198<R extends { ward_no: number }, F extends keyof R & string>(
  index: Bbmp198Index,
  datameet243No: number,
  rows: readonly R[],
  fields: readonly F[],
): Bbmp198Estimate<F> | null {
  const row = index.get(datameet243No)
  if (!row) return null
  const weights = bbmp198AllocationWeights([{ ward_no: datameet243No, legacy_share: 1 }], index)
  const present = rows.filter(source => weights.has(source.ward_no))
  if (!present.length) return null
  const values = {} as Record<F, number>
  for (const field of fields) {
    values[field] = Math.round(allocateBbmp198(weights, present, source => (source[field] == null ? null : Number(source[field]))) ?? 0)
  }
  const contributing = new Set(present.map(source => source.ward_no))
  return {
    values,
    bbmp198_wards: row.bbmp198_wards
      .filter(ref => ref.bbmp198_share > 0 && contributing.has(ref.ward_no))
      .sort((a, b) => b.bbmp198_share - a.bbmp198_share || a.ward_no - b.ward_no)
      .map(ref => ({ ward_no: ref.ward_no, ward_name: ref.ward_name, bbmp198_share: ref.bbmp198_share })),
  }
}

/**
 * BBMP-198 wards whose non-additive records (a ward committee's meeting
 * count) may be named under this 243 ward: the overlap is material in both
 * directions, or the 198 ward is the 243 ward's largest overlap. Such records
 * are never split or summed. Largest dm243_share first.
 */
export function attributableBbmp198Wards(row: Bbmp198CrosswalkRow): Bbmp198Ref[] {
  const covering = row.bbmp198_wards.filter(ref => ref.dm243_share > 0)
  if (!covering.length) return []
  const primary = covering.reduce((best, ref) => (ref.dm243_share > best.dm243_share ? ref : best))
  return covering
    .filter(ref => ref === primary || (ref.dm243_share >= MATERIAL_OVERLAP && ref.bbmp198_share >= MATERIAL_OVERLAP))
    .sort((a, b) => b.dm243_share - a.dm243_share || a.ward_no - b.ward_no)
}

export interface AttributedBbmp198Ward {
  ward_no: number
  ward_name: string
  /** Approximate fraction of the current ward this 198 ward covers (ordering only). */
  coverage: number
}

/**
 * BBMP-198 wards whose non-additive records belong to a current ward: the
 * current ward's attributable 243 wards (material both ways, primary kept),
 * each bridged to 198 with the same rule. Largest coverage first, so the
 * first entry is the former ward committee that best represents the ward.
 */
export function attributableBbmp198WardsForHistoricalWards(
  historicalWards: readonly HistoricalWardRef[],
  index: Bbmp198Index,
): AttributedBbmp198Ward[] {
  const found = new Map<number, AttributedBbmp198Ward>()
  for (const legacy of attributableHistoricalWards(historicalWards)) {
    const row = index.get(legacy.ward_no)
    if (!row) continue
    for (const ref of attributableBbmp198Wards(row)) {
      const entry = found.get(ref.ward_no) ?? { ward_no: ref.ward_no, ward_name: ref.ward_name, coverage: 0 }
      entry.coverage += legacy.current_share * ref.dm243_share
      found.set(ref.ward_no, entry)
    }
  }
  return [...found.values()].sort((a, b) => b.coverage - a.coverage || a.ward_no - b.ward_no)
}

/** A former BBMP-198 ward committee's meeting record, as passed to AI and RTI routes. */
export interface FormerWardCommittee {
  ward_name: string
  bbmp198_ward_no: number
  meetings_count: number
  period?: string | null
}

const MAX_COMMITTEES = 6

/**
 * One line per former ward committee, for model prompts and RTI context.
 * Input arrives from the client, so it is bounded and coerced here. Counts
 * stay per committee; they are never added up.
 */
export function describeFormerWardCommittees(committees: unknown): string[] {
  if (!Array.isArray(committees)) return []
  return committees.slice(0, MAX_COMMITTEES).flatMap(item => {
    const committee = item as Partial<FormerWardCommittee> | null
    const name = typeof committee?.ward_name === "string" ? committee.ward_name.replace(/\s+/g, " ").trim().slice(0, 60) : ""
    const wardNo = Number(committee?.bbmp198_ward_no)
    const count = Number(committee?.meetings_count)
    if (!name || !Number.isInteger(wardNo) || wardNo < 1 || wardNo > 198 || !Number.isInteger(count) || count < 0) return []
    const period = typeof committee?.period === "string" && /^[\d\s-]{4,12}$/.test(committee.period) ? committee.period.trim() : "2020-22"
    return [`${name} ward committee (BBMP 198-ward map, ward ${wardNo}): ${count} meeting${count === 1 ? "" : "s"} recorded, ${period}`]
  })
}
