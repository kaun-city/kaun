/**
 * A ward record: what the ward card shows, read from Kaun's database for one
 * ward. The same functions run in two places:
 *
 *   - app/api/ward/[corporation]/[ward] (+ /live), next to the database, with
 *     the rarely-changing record cached at the edge for a day;
 *   - the browser, for a ward with no current GBA identity (an old ?ward=
 *     link), which has no cached route to ask.
 *
 * The figures are computed exactly as hooks/useWardData.ts computed them
 * before this moved (tests/ward-bundle.test.mjs checks them against the
 * values the old hook produced for real wards): the full overlap vector
 * weighted by legacy_share for additive totals, material-overlap wards
 * (MATERIAL_OVERLAP) for record lists, and the 198-ward crosswalk for spend,
 * potholes and committee meetings.
 */

import type {
  BudgetSummary, CommunityFact, ContractorProfile, Department, ElectedRep, GbaContact,
  MlaLadFunds, PinResult, PropertyTaxData, RepReportCard,
  SakalaPerformance, WardAirQuality, WardAmenities, WardBusStats, WardCommitteeMeetings, WardGrievances, WardInfraStats, WardPotholes,
  WardProfile, WardRoadCrashes, WardSpendCategory, WardStats, WardTradeLicenses, WardWaterQuality, WorkOrder,
} from "./types.ts"
import {
  fetchBudgetSummary, fetchCorpContacts, fetchCorporationTenders, fetchDepartments, fetchElectedReps,
  fetchMlaLadFunds, fetchPropertyTax, fetchRepReportCard, fetchSakalaPerformance,
  fetchTradeLicenses, fetchWardAirQuality, fetchWardAmenities, fetchWardBusStats, fetchWardCommitteeMeetingsByBbmp198, fetchWardContractors, fetchWardGrievances, fetchWardInfraStats,
  fetchWardPotholesByBbmp198, fetchWardProfile, fetchWardReportCount, fetchWardRoadCrashes, fetchWardSignals, fetchWardSpendByBbmp198, fetchWardStats,
  fetchWardCommunityFacts, fetchWardUnknowns, fetchWardWaterQuality, fetchWorkOrders, lookupLocalOffices,
  type CivicSignal, type CorporationTenders,
} from "./api.ts"
import { getCity } from "./cities/index.ts"
import { BBMP_198_RECORDS_ATTRIBUTABLE } from "./ward-data-quality.ts"
import { attributableHistoricalWards, type GbaCrosswalkRow, type HistoricalWardRef, type LegacySourceWardRow } from "./gba-crosswalk.ts"
import { currentWardMeta, currentWardPinResult } from "./current-ward.ts"
import { allocateBbmp198, attributableBbmp198WardsForHistoricalWards, bbmp198AllocationWeights, type Bbmp198Index } from "./bbmp198-crosswalk.ts"
import { CORPORATION_TENDERS_SHOWN, corporationDepartment } from "./corporation-tenders.ts"

export type WardUnknowns = {
  total_questions: number
  answered: number
  unanswered: Array<{ category: string; subject: string; field: string; prompt: string; icon: string; priority: number }>
}

/**
 * Parts of the ward card whose reads can fail on their own. A failed part
 * shows "Couldn't load · Retry" (components/shared/LoadFailed) instead of a
 * placeholder that never finishes, or an empty state that isn't true.
 */
export type LoadSection =
  | "profile" | "reps" | "unknowns" | "facts" | "committee" | "ladFunds" | "reportCard" | "corpContacts" | "offices"
  | "budget" | "workOrders" | "tradeLicenses" | "propertyTax" | "wardSpend" | "tenders"
  | "wardStats" | "busStats" | "roadCrashes" | "airQuality" | "amenities" | "waterQuality"
  | "departments" | "sakala" | "grievances"
  | "infra" | "reportCount" | "signals" | "potholes" | "contractors"

/** The inputs the headline ranks; if one failed, the headline would be a guess. */
export const HEADLINE_SECTIONS: LoadSection[] = ["reportCard", "committee", "infra", "contractors"]
/** The headline inputs plus potholes: what the evidence snapshot draws. */
export const SNAPSHOT_SECTIONS: LoadSection[] = [...HEADLINE_SECTIONS, "potholes"]

/** Everything on the card that changes rarely. Cached for a day by the ward route. */
export interface WardRecord {
  /** reps, officers and the governance alert; community facts are live (WardLive). */
  profile: Omit<WardProfile, "community_facts"> | null
  /** MLA list fetched on its own, the fallback when the profile has no MLA. */
  mlaReps: ElectedRep[]
  /** Former BBMP-198 ward committees that materially overlap this ward, largest overlap first. Never summed. */
  committeeMeetings: WardCommitteeMeetings[]
  reportCard: RepReportCard | null
  ladFunds: MlaLadFunds[]
  corpName: string | null
  corpContacts: GbaContact[]
  budget: BudgetSummary | null
  workOrders: WorkOrder[]
  tradeLicenses: WardTradeLicenses[]
  propertyTax: PropertyTaxData | null
  wardSpend: WardSpendCategory | null
  corporationTenders: CorporationTenders | null
  wardStats: WardStats | null
  wardBusStats: WardBusStats | null
  roadCrashes: WardRoadCrashes | null
  airQuality: WardAirQuality | null
  amenities: WardAmenities | null
  waterQuality: WardWaterQuality[]
  departments: Department[]
  sakala: SakalaPerformance | null
  grievances: WardGrievances[]
  infraStats: WardInfraStats | null
  potholes: WardPotholes | null
  wardContractors: ContractorProfile[]
  /** Sections whose reads failed; everything else is complete. */
  failed: LoadSection[]
}

/** What residents add or report. Short-cached by the ward route. */
export interface WardLive {
  reportCount: number
  signals: CivicSignal[]
  unknowns: WardUnknowns | null
  communityFacts: CommunityFact[]
  failed: LoadSection[]
}

export const RECORD_SECTIONS: LoadSection[] = [
  "profile", "reps", "committee", "ladFunds", "reportCard", "corpContacts",
  "budget", "workOrders", "tradeLicenses", "propertyTax", "wardSpend", "tenders",
  "wardStats", "busStats", "roadCrashes", "airQuality", "amenities", "waterQuality",
  "departments", "sakala", "grievances", "infra", "potholes", "contractors",
]
export const LIVE_SECTIONS: LoadSection[] = ["reportCount", "signals", "unknowns", "facts"]

/** Crosswalks a record needs, loaded the right way for where the record is built. */
export interface WardRecordSources {
  /** BBMP-198 -> DataMeet-243 index; null when it cannot be loaded. */
  bbmp198Index(): Promise<Bbmp198Index | null>
  /** BBMP-Final-225 -> DataMeet-243 rows for contractor_profiles.wards; undefined lets the fetcher load its own. */
  legacySourceRows?(): Promise<LegacySourceWardRow[]>
}

const LEGACY_FALLBACK_REF = (wardNo: number, wardName: string | null): HistoricalWardRef => ({
  ward_no: wardNo,
  ward_name: wardName ?? `Ward ${wardNo}`,
  current_share: 1,
  legacy_share: 1,
})

export function weightedNumber<T>(rows: Array<{ value: T; ref: HistoricalWardRef }>, read: (value: T) => number | null | undefined): number {
  return rows.reduce((sum, row) => sum + (Number(read(row.value)) || 0) * row.ref.legacy_share, 0)
}

export function uniqueBy<T>(values: T[], key: (value: T) => string | number): T[] {
  return [...new Map(values.map(value => [key(value), value])).values()]
}

/** One row of lib/gba-ward-identity.json (scripts/wardmap/build-gba-ward-identity.mjs). */
export interface GbaWardIdentityRow {
  corporation_id: number
  ward_no: number
  ward_name: string
  corporation: string
  assembly_constituency: string
  center_lat: number
  center_lng: number
}

/**
 * The PinResult the map builds for a current GBA ward, built from the identity
 * table instead of the boundary layer (through the same currentWardMeta and
 * currentWardPinResult), plus the ward's centre for the corporation lookup.
 */
export function gbaWardResult(
  identity: GbaWardIdentityRow | undefined,
  crosswalk: GbaCrosswalkRow | undefined,
  crosswalkVersion: string,
): { result: PinResult; centre: { lat: number; lng: number } } | null {
  if (!identity) return null
  const feature = { type: "Feature" as const, geometry: null as never, properties: { ...identity, boundary_system: "gba-369-2025" } }
  const meta = currentWardMeta(feature, crosswalk, crosswalkVersion)
  if (!meta) return null
  const centre = { lat: identity.center_lat, lng: identity.center_lng }
  return { result: { ...currentWardPinResult(meta, null, "bengaluru"), ...centre }, centre }
}

/** The ward route for a result, when it has a current GBA identity; null sends the browser to build the record itself. */
export function wardRoutePath(result: PinResult | null): string | null {
  if (!result?.found || (result.city_id ?? "bengaluru") !== "bengaluru") return null
  const corporation = result.gba_corporation_id
  const ward = result.gba_ward_no
  return Number.isInteger(corporation) && Number.isInteger(ward) ? `/api/ward/${corporation}/${ward}` : null
}

/** The DataMeet-243 wards a result draws on: its overlap vector, or itself for a legacy ward. */
export function historicalWardsFor(result: PinResult | null): HistoricalWardRef[] {
  if (!result?.found) return []
  if (result.historical_wards?.length) return result.historical_wards
  return result.ward_no ? [LEGACY_FALLBACK_REF(result.ward_no, result.ward_name)] : []
}

/** A crosswalk that could not be loaded is a failed read, not "no rows". */
function requireIndex<T>(index: T | null): T {
  if (!index) throw new Error("bbmp198 crosswalk: unavailable")
  return index
}

/**
 * How many sections read at once. A card has about 25; firing them all
 * together overloaded a cold database (statement timeouts on ward_profile and
 * lookup_local_offices while recording the test fixtures).
 */
export const SECTION_CONCURRENCY = 6

function limiter(concurrency: number) {
  let active = 0
  const waiting: Array<() => void> = []
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= concurrency) await new Promise<void>(resolve => waiting.push(resolve))
    active++
    try {
      return await task()
    } finally {
      active--
      waiting.shift()?.()
    }
  }
}

type Limit = ReturnType<typeof limiter>

/** Receives how long each section took, for Server-Timing on a cache miss. */
export type SectionTiming = (section: LoadSection, ms: number) => void

/**
 * Run one section's reads, once more if the first attempt fails (a cold
 * database can time a statement out once). A second failure records the
 * section and yields the empty value.
 */
async function section<T>(limit: Limit, failed: LoadSection[], name: LoadSection, empty: T, load: () => Promise<T>, timing?: SectionTiming): Promise<T> {
  return limit(async () => {
    const started = performance.now()
    try {
      return await load()
    } catch {
      try {
        await new Promise(resolve => setTimeout(resolve, 250))
        return await load()
      } catch {
        failed.push(name)
        return empty
      }
    } finally {
      timing?.(name, performance.now() - started)
    }
  })
}

/**
 * The rarely-changing ward record. `point` is a location inside the ward for
 * the corporation office lookup (the tapped point in the browser, the ward's
 * centre on the server); without one the corporation comes from the result.
 */
export async function buildWardRecord(
  result: PinResult,
  sources: WardRecordSources,
  point: { lat: number; lng: number } | null = result.lat && result.lng ? { lat: result.lat, lng: result.lng } : null,
  timing?: SectionTiming,
): Promise<WardRecord> {
  const city = getCity(result.city_id)
  const historicalWards = historicalWardsFor(result)
  // Additive totals (spend, amenities, signals counts…) use the full overlap
  // vector weighted by legacy_share. Record *lists* (work orders, contractors,
  // signals, grievances, licences, water/air readings) may only come from
  // former wards that overlap materially (>= 10% both ways, primary always).
  const recordWards = attributableHistoricalWards(historicalWards)
  const wardNo = historicalWards[0]?.ward_no
  const cityId = result.city_id ?? city.id
  const assemblyConstituency = result.gba_ac ?? result.assembly_constituency ?? undefined
  const currentWardName = result.gba_ward_name ?? result.ward_name ?? "Current ward"
  const failed: LoadSection[] = []
  const limit = limiter(SECTION_CONCURRENCY)
  const run = <T>(name: LoadSection, empty: T, load: () => Promise<T>): Promise<T> => section(limit, failed, name, empty, load, timing)
  const bbmp198 = () => sources.bbmp198Index().then(requireIndex)

  const [
    profile, mlaReps, committeeMeetings, ladFunds, reportCard, corporation,
    budget, workOrders, tradeLicenses, propertyTax, corporationTenders, wardSpend,
    wardStats, wardBusStats, roadCrashes, airQuality, amenities, waterQuality,
    departments, sakala, grievances, infraStats, potholes, wardContractors,
  ] = await Promise.all([
    run("profile", null, async () => {
      if (!wardNo) return null
      const value = await fetchWardProfile(wardNo, cityId, assemblyConstituency)
      if (!value) return null
      // Only what the card reads. Facts are live (buildWardLive), and until
      // migration 20260919 runs the function still returns every city tender.
      const { ward_no, city_id, assembly_constituency, elected_reps, officers, governance_alert } = value
      return { ward_no, city_id, assembly_constituency, elected_reps, officers, governance_alert }
    }),
    run("reps", [] as ElectedRep[], async () => assemblyConstituency ? fetchElectedReps(assemblyConstituency, cityId) : []),
    run("committee", [] as WardCommitteeMeetings[], async () => {
      if (!(historicalWards.length && city.features.wardCommitteeMeetings && BBMP_198_RECORDS_ATTRIBUTABLE)) return []
      // A committee's meeting count belongs to that committee: name each
      // materially overlapping former 198-ward committee, never split or sum.
      const committees = attributableBbmp198WardsForHistoricalWards(historicalWards, await bbmp198())
      const rows = await fetchWardCommitteeMeetingsByBbmp198(committees.map(committee => committee.ward_no))
      const order = new Map(committees.map((committee, position) => [committee.ward_no, position]))
      return rows.sort((a, b) => (order.get(a.ward_no) ?? 0) - (order.get(b.ward_no) ?? 0))
    }),
    run("ladFunds", [] as MlaLadFunds[], async () =>
      assemblyConstituency && city.features.mlaLadFunds ? (await fetchMlaLadFunds(assemblyConstituency)) ?? [] : []),
    run("reportCard", null, async () =>
      assemblyConstituency && city.features.repReportCards ? fetchRepReportCard(assemblyConstituency) : null),
    run("corpContacts", { corpName: null as string | null, corpContacts: [] as GbaContact[] }, async () => {
      if (!point) {
        const name = result.gba_corporation ?? null
        return { corpName: name, corpContacts: name ? await fetchCorpContacts(name) : [] }
      }
      const offices = await lookupLocalOffices(point.lat, point.lng)
      const corporation = offices.find(office => office.boundary_type === "gba_corporation")
      if (!corporation) return { corpName: null, corpContacts: [] }
      return { corpName: corporation.name, corpContacts: await fetchCorpContacts(corporation.name) }
    }),
    run("budget", null, async () => city.features.budget ? fetchBudgetSummary(city.budgetYear) : null),
    run("workOrders", [] as WorkOrder[], async () => {
      if (!(recordWards.length && city.features.workOrders)) return []
      const groups = await Promise.all(recordWards.map(ref => fetchWorkOrders(ref.ward_no, cityId)))
      return uniqueBy(groups.flat(), row => row.work_order_id || row.id)
    }),
    run("tradeLicenses", [] as WardTradeLicenses[], async () => {
      if (!(recordWards.length && city.features.tradeLicenses)) return []
      return (await Promise.all(recordWards.map(ref => fetchTradeLicenses(ref.ward_name, cityId)))).flat()
    }),
    run("propertyTax", null, async () =>
      assemblyConstituency && city.features.propertyTax ? fetchPropertyTax(assemblyConstituency, cityId) : null),
    run("tenders", null, async () => {
      // A few of the corporation's latest tenders, not every city tender.
      const department = corporationDepartment(result.gba_corporation)
      return department ? fetchCorporationTenders(department, CORPORATION_TENDERS_SHOWN, cityId) : null
    }),
    run("wardSpend", null, async () => {
      if (!historicalWards.length || !city.features.wardSpend || !BBMP_198_RECORDS_ATTRIBUTABLE) return null
      // Spend is recorded on the 198-ward map: allocate each 198 ward's total
      // by legacy_share (current -> 243) x bbmp198_share (243 -> 198).
      const weights = bbmp198AllocationWeights(historicalWards, await bbmp198())
      const rows = await fetchWardSpendByBbmp198(weights.keys())
      if (!rows.length) return null
      const fields: Array<keyof WardSpendCategory> = ["buildings_facilities", "drainage", "roads_and_drains", "roads_and_infrastructure", "streetlighting", "waste_management", "water_and_sanitation", "grand_total"]
      const estimate = { ward_no: 0, ward_name: currentWardName, period: rows[0].period } as WardSpendCategory
      for (const field of fields) Object.assign(estimate, { [field]: allocateBbmp198(weights, rows, row => Number(row[field])) ?? 0 })
      return estimate
    }),
    run("wardStats", null, async () => assemblyConstituency ? fetchWardStats(assemblyConstituency, cityId) : null),
    run("busStats", null, async (): Promise<WardBusStats | null> => {
      if (!historicalWards.length) return null
      const results = await Promise.all(historicalWards.map(async ref => ({ ref, value: await fetchWardBusStats(ref.ward_no) })))
      const rows = results.filter((row): row is { ref: HistoricalWardRef; value: WardBusStats } => !!row.value)
      return rows.length ? { ward_no: 0, stop_count: Math.round(weightedNumber(rows, v => v.stop_count)), total_trips: Math.round(weightedNumber(rows, v => v.total_trips)) } : null
    }),
    run("roadCrashes", null, async (): Promise<WardRoadCrashes | null> => {
      if (!historicalWards.length) return null
      const results = await Promise.all(historicalWards.map(async ref => ({ ref, value: await fetchWardRoadCrashes(ref.ward_no) })))
      const rows = results.filter((row): row is { ref: HistoricalWardRef; value: WardRoadCrashes } => !!row.value)
      if (!rows.length) return null
      return { ward_no: 0, crashes_2024: Math.round(weightedNumber(rows, v => v.crashes_2024)), fatal_2024: Math.round(weightedNumber(rows, v => v.fatal_2024)), crashes_2025: Math.round(weightedNumber(rows, v => v.crashes_2025)), fatal_2025: Math.round(weightedNumber(rows, v => v.fatal_2025)) }
    }),
    run("airQuality", null, async () => {
      if (!historicalWards.length) return null
      const values = await Promise.all(recordWards.map(ref => fetchWardAirQuality(ref.ward_no)))
      return values.find(Boolean) ?? null
    }),
    run("amenities", null, async (): Promise<WardAmenities | null> => {
      if (!(historicalWards.length && city.features.wardAmenities)) return null
      const results = await Promise.all(historicalWards.map(async ref => ({ ref, value: await fetchWardAmenities(ref.ward_no, cityId) })))
      const rows = results.filter((row): row is { ref: HistoricalWardRef; value: WardAmenities } => !!row.value)
      if (!rows.length) return null
      const fields: Array<keyof WardAmenities> = ["hospitals", "clinics", "pharmacies", "atms", "banks", "public_toilets", "ev_charging", "petrol_pumps", "post_offices", "libraries", "community_halls", "places_of_worship", "restaurants", "cafes", "metro_stations"]
      const estimate = { ward_no: 0, city_id: cityId, data_source: "Historical 243-ward overlap estimate", updated_at: rows[0].value.updated_at } as WardAmenities
      for (const field of fields) Object.assign(estimate, { [field]: Math.round(weightedNumber(rows, value => Number(value[field]))) })
      return estimate
    }),
    run("waterQuality", [] as WardWaterQuality[], async () => {
      if (!(recordWards.length && city.features.wardWaterQuality)) return []
      const values = await Promise.all(recordWards.map(ref => fetchWardWaterQuality(ref.ward_no, cityId)))
      return uniqueBy(values.flat(), row => `${row.water_body_name}:${row.data_year}`)
    }),
    run("departments", [] as Department[], async () => (await fetchDepartments(cityId)) as Department[]),
    run("sakala", null, async () =>
      assemblyConstituency && city.features.sakala ? fetchSakalaPerformance(assemblyConstituency) : null),
    run("grievances", [] as WardGrievances[], async () => {
      if (!(recordWards.length && city.features.grievances)) return []
      return (await Promise.all(recordWards.map(ref => fetchWardGrievances(ref.ward_name, cityId)))).flat()
    }),
    run("infra", null, async (): Promise<WardInfraStats | null> => {
      if (!historicalWards.length) return null
      const results = await Promise.all(historicalWards.map(async ref => ({ ref, value: await fetchWardInfraStats(ref.ward_no, cityId) })))
      const rows = results.filter((row): row is { ref: HistoricalWardRef; value: WardInfraStats } => !!row.value)
      // bus_stop_count / daily_trips are inflated in the view (see
      // lib/ward-data-quality.ts); only signal_count is carried. Bus figures: wardBusStats.
      return rows.length ? { ward_no: 0, ward_name: currentWardName, signal_count: Math.round(weightedNumber(rows, v => v.signal_count)), bus_stop_count: 0, daily_trips: 0 } : null
    }),
    run("potholes", null, async (): Promise<WardPotholes | null> => {
      if (!(historicalWards.length && city.features.wardPotholes && BBMP_198_RECORDS_ATTRIBUTABLE)) return null
      // Complaints are counted on the 198-ward map: allocate like spend.
      const weights = bbmp198AllocationWeights(historicalWards, await bbmp198())
      const rows = await fetchWardPotholesByBbmp198(weights.keys())
      const complaints = allocateBbmp198(weights, rows, row => row.complaints)
      return complaints != null ? { ward_no: 0, ward_name: currentWardName, complaints: Math.round(complaints), data_year: rows[0].data_year } : null
    }),
    run("contractors", [] as ContractorProfile[], async () => {
      if (!(historicalWards.length && city.features.workOrders)) return []
      const sourceRows = await sources.legacySourceRows?.()
      const values = await Promise.all(recordWards.map(ref => fetchWardContractors(ref.ward_no, cityId, sourceRows)))
      const contractors = uniqueBy(values.flat(), row => row.entity_id)
      return contractors.sort((a, b) => (Number(b.total_value_lakh) || 0) - (Number(a.total_value_lakh) || 0))
    }),
  ])

  return {
    profile, mlaReps, committeeMeetings, reportCard, ladFunds,
    corpName: corporation.corpName, corpContacts: corporation.corpContacts,
    budget, workOrders, tradeLicenses, propertyTax, wardSpend, corporationTenders,
    wardStats, wardBusStats, roadCrashes, airQuality, amenities, waterQuality,
    departments, sakala, grievances, infraStats, potholes, wardContractors,
    failed: RECORD_SECTIONS.filter(name => failed.includes(name)),
  }
}

/** Resident reports, signals, unanswered questions and community facts. */
export async function buildWardLive(result: PinResult, timing?: SectionTiming): Promise<WardLive> {
  const historicalWards = historicalWardsFor(result)
  const recordWards = attributableHistoricalWards(historicalWards)
  const wardNo = historicalWards[0]?.ward_no
  const cityId = result.city_id ?? getCity(result.city_id).id
  const failed: LoadSection[] = []
  const limit = limiter(SECTION_CONCURRENCY)
  const run = <T>(name: LoadSection, empty: T, load: () => Promise<T>): Promise<T> => section(limit, failed, name, empty, load, timing)

  const [reportCount, signals, unknowns, communityFacts] = await Promise.all([
    run("reportCount", 0, async () => {
      if (!historicalWards.length) return 0
      const rows = await Promise.all(historicalWards.map(async ref => ({ ref, value: await fetchWardReportCount(ref.ward_no, cityId) })))
      return Math.round(weightedNumber(rows, value => value))
    }),
    run("signals", [] as CivicSignal[], async () => {
      if (!historicalWards.length) return []
      const values = await Promise.all(recordWards.map(ref => fetchWardSignals(ref.ward_no, cityId)))
      return uniqueBy(values.flat(), row => row.id)
    }),
    run("unknowns", null, async () => wardNo ? fetchWardUnknowns(wardNo, cityId) : null),
    run("facts", [] as CommunityFact[], async () => wardNo ? fetchWardCommunityFacts(wardNo, cityId) : []),
  ])

  return { reportCount, signals, unknowns, communityFacts, failed: LIVE_SECTIONS.filter(name => failed.includes(name)) }
}
