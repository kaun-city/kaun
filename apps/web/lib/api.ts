/**
 * Kaun API layer  talks to Supabase through kaun.city (lib/supabase.ts).
 *
 * Spatial queries use PostgreSQL functions (RPC).
 * CRUD uses PostgREST.
 * No separate API server.
 *
 * The ward card's fetchers reject with DataRequestError when a read fails, so
 * the card can show "Couldn't load" instead of an empty or endless state
 * (hooks/useWardData.ts). The other fetchers resolve to null or [] as before.
 */

import type { BudgetSummary, CommunityFact, ElectedRep, PinResult, PropertyTaxData, WardProfile, WardStats, WardGrievances, SakalaPerformance } from "./types.ts"
import { rpc, rpcOrThrow, query, queryOrThrow, insert, restRequest, restUrl, DataRequestError, BROWSER_REQUEST_TIMEOUT_MS } from "./supabase.ts"
import { wardQueryScope } from "./ward-query-scope.ts"
import { BBMP198_CROSSWALK_URL, WARD_CROSSWALK_URL } from "./constants.ts"
import { bengaluruDataConstituency } from "./bengaluru-constituencies.ts"
import { sourceWardNosForLegacyWard, type LegacySourceWardRow } from "./gba-crosswalk.ts"
import { indexBbmp198Crosswalk, type Bbmp198CrosswalkArtifact, type Bbmp198Index } from "./bbmp198-crosswalk.ts"
import { tenderTotal } from "./corporation-tenders.ts"

let sourceWardCrosswalk: Promise<LegacySourceWardRow[]> | null = null
let bbmp198Crosswalk: Promise<Bbmp198Index | null> | null = null

/**
 * The BBMP-198 -> DataMeet-243 crosswalk, loaded once per session. Null when
 * it cannot be loaded: 198-keyed figures are then withheld, never guessed.
 */
export function loadBbmp198Crosswalk(): Promise<Bbmp198Index | null> {
  bbmp198Crosswalk ??= fetch(BBMP198_CROSSWALK_URL)
    .then(response => {
      if (!response.ok) throw new Error(`bbmp198 crosswalk ${response.status}`)
      return response.json() as Promise<Bbmp198CrosswalkArtifact>
    })
    .then(indexBbmp198Crosswalk)
    .catch(() => {
      // Do not cache a failure for the whole session; retry on the next ward.
      bbmp198Crosswalk = null
      return null
    })
  return bbmp198Crosswalk
}

/** PostgREST `in` filter over BBMP-198 ward numbers (the 198-keyed tables are Bengaluru-only). */
function bbmp198WardFilter(bbmp198WardNos: Iterable<number>): string | null {
  const wardNos = [...new Set(bbmp198WardNos)].filter(Number.isInteger).sort((a, b) => a - b)
  return wardNos.length ? `in.(${wardNos.join(",")})` : null
}

/**
 * BBMP-Final-225 wards whose records are attributable to a DataMeet-243 ward,
 * using the same >= 10% material-overlap pairs as prod `ward_crosswalk` /
 * `v_work_orders_243` (never "any shared area").
 */
async function sourceWardNosForHistoricalWard(wardNo: number): Promise<number[]> {
  sourceWardCrosswalk ??= fetch(WARD_CROSSWALK_URL)
    .then(response => {
      if (!response.ok) throw new Error(`crosswalk ${response.status}`)
      return response.json()
    })
    .then(data => (data.rows ?? []) as LegacySourceWardRow[])
    .catch(() => {
      // Do not cache a failure for the whole session; retry on the next ward.
      // Reject rather than return no rows: "no contractors" would be a false answer.
      sourceWardCrosswalk = null
      throw new DataRequestError("ward crosswalk: unavailable")
    })
  return sourceWardNosForLegacyWard(await sourceWardCrosswalk, wardNo)
}

/**
 * Pin lookup  reverse geocode a lat/lng to a ward.
 */
export async function pinLookup(lat: number, lng: number): Promise<PinResult | null> {
  let data: {
    found: boolean
    // BBMP legacy
    city_id?: string
    ward_no?: number
    ward_name?: string
    zone?: string | null
    assembly_constituency?: string | null
    // GBA
    gba_ward_no?: number | null
    gba_ward_name?: string | null
    gba_ward_name_kn?: string | null
    gba_corporation?: string | null
    gba_corporation_id?: number | null
    gba_ac?: string | null
    gba_ac_no?: number | null
    gba_zone?: string | null
    gba_zone_name?: string | null
    gba_population?: number | null
  } | null = null

  try {
    const response = await fetch("/api/pin-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng }),
    })
    if (!response.ok) return null
    data = await response.json()
  } catch {
    return null
  }

  if (!data || !data.found) {
    return { found: false } as PinResult
  }

  return {
    found: true,
    // BBMP legacy (all existing tabs continue to work)
    city_id: data.city_id ?? "bengaluru",
    // A current GBA ward can legitimately have no historical 243-ward join.
    // Preserve that gap instead of manufacturing ward 0 / an empty identity.
    ward_no: data.ward_no ?? null,
    ward_name: data.ward_name ?? null,
    zone: data.zone ?? null,
    assembly_constituency: data.assembly_constituency ?? null,
    agencies: [],
    // GBA
    gba_ward_no: data.gba_ward_no ?? null,
    gba_ward_name: data.gba_ward_name ?? null,
    gba_ward_name_kn: data.gba_ward_name_kn ?? null,
    gba_corporation: data.gba_corporation ?? null,
    gba_corporation_id: data.gba_corporation_id ?? null,
    gba_ac: data.gba_ac ?? null,
    gba_ac_no: data.gba_ac_no ?? null,
    gba_zone: data.gba_zone ?? null,
    gba_zone_name: data.gba_zone_name ?? null,
    gba_population: data.gba_population ?? null,
  }
}

/** Resolve a known ward identity without reverse-geocoding an approximate point. */
export async function fetchWardByNumber(
  wardNo: number,
  cityId = "bengaluru",
  location?: { lat: number; lng: number },
): Promise<PinResult | null> {
  const rows = await query<{
    ward_no: number
    ward_name: string
    assembly_constituency: string | null
    zone: string | null
  }>("wards", {
    ward_no: `eq.${wardNo}`,
    city_id: `eq.${cityId}`,
  }, {
    select: "ward_no,ward_name,assembly_constituency,zone",
    limit: 1,
  })

  const ward = rows[0]
  if (!ward) return null

  return {
    found: true,
    city_id: cityId,
    ward_no: ward.ward_no,
    ward_name: ward.ward_name,
    assembly_constituency: ward.assembly_constituency ?? "",
    zone: ward.zone ?? "",
    agencies: [],
    lat: location?.lat,
    lng: location?.lng,
    gba_ward_no: null,
    gba_ward_name: null,
    gba_ward_name_kn: null,
    gba_corporation: null,
    gba_corporation_id: null,
    gba_ac: null,
    gba_ac_no: null,
    gba_zone: null,
    gba_zone_name: null,
    gba_population: null,
  }
}

/**
 * Fetch full ward profile via PostgreSQL function.
 */
export async function fetchWardProfile(
  wardNo: number,
  cityId = "bengaluru",
  assemblyConstituency?: string
): Promise<WardProfile | null> {
  const data = await rpcOrThrow<WardProfile>("ward_profile", {
    p_ward_no: wardNo,
    p_city_id: cityId,
    p_assembly_constituency: assemblyConstituency ? bengaluruDataConstituency(assemblyConstituency) : null,
  })
  return data
}

/**
 * Fetch the current MLA independently of the large ward_profile payload. This
 * keeps representative identity available when optional ward enrichment is
 * slow or fails, and joins current GBA wards by their published AC name.
 */
export async function fetchElectedReps(
  assemblyConstituency: string,
  cityId = "bengaluru",
): Promise<ElectedRep[]> {
  return queryOrThrow<ElectedRep>("elected_reps", {
    city_id: `eq.${cityId}`,
    role: "eq.MLA",
    constituency: `ilike.${cityId === "bengaluru" ? bengaluruDataConstituency(assemblyConstituency) : assemblyConstituency}`,
  }, {
    order: "name",
  })
}

/**
 * Fetch community facts for a ward.
 */
export async function fetchCommunityFacts(
  wardNo: number,
  cityId = "bengaluru",
  category?: string
): Promise<CommunityFact[]> {
  const params: Record<string, string> = {
    "city_id": `eq.${cityId}`,
    "ward_no": `eq.${wardNo}`,
    "is_active": "eq.true",
  }
  if (category) params["category"] = `eq.${category}`

  return await query<CommunityFact>("community_facts", params, {
    order: "corroboration_count.desc,created_at.desc",
  })
}

/**
 * Active community facts for a ward, with the trust level ward_profile gives
 * them (communityFactTrust). Rejects on a failed read. Used for the ward card's
 * live parts, so a fact does not wait for the day-long cached record.
 */
export async function fetchWardCommunityFacts(wardNo: number, cityId = "bengaluru"): Promise<CommunityFact[]> {
  const rows = await queryOrThrow<Omit<CommunityFact, "trust_level">>("community_facts", {
    "city_id": `eq.${cityId}`,
    "ward_no": `eq.${wardNo}`,
    "is_active": "eq.true",
  }, {
    // contributor_token is never read back.
    select: "id,category,subject,field,value,source_type,source_url,source_note,corroboration_count,dispute_count,created_at",
    order: "corroboration_count.desc",
  })
  return rows.map(row => ({ ...row, trust_level: communityFactTrust(row) }) as CommunityFact)
}

/**
 * The trust level ward_profile's SQL assigns a community fact: the same tests
 * in the same order (supabase/migrations/20260919_ward_profile_without_tenders.sql).
 */
export function communityFactTrust(fact: { source_type: string; corroboration_count: number; dispute_count: number }): CommunityFact["trust_level"] {
  if (fact.source_type === "official") return "official"
  if (fact.source_type === "rti") return "rti"
  if (fact.dispute_count > fact.corroboration_count && fact.dispute_count >= 3) return "disputed"
  if (fact.corroboration_count >= 5) return "community_verified"
  return "unverified"
}

/**
 * Submit a community fact.
 */
export async function submitFact(payload: {
  city_id?: string
  ward_no: number
  category: string
  subject: string
  field: string
  value: string
  source_type?: string
  source_note?: string
  contributor_token?: string
}): Promise<{ ok: boolean; fact: CommunityFact; is_duplicate: boolean } | null> {
  const data = {
    city_id: payload.city_id ?? "bengaluru",
    ward_no: payload.ward_no,
    category: payload.category,
    subject: payload.subject,
    field: payload.field,
    value: payload.value,
    source_type: payload.source_type ?? "community",
    source_note: payload.source_note ?? null,
    contributor_token: payload.contributor_token ?? null,
    corroboration_count: payload.contributor_token ? 1 : 0,
    dispute_count: 0,
    is_active: true,
  }

  const fact = await insert<CommunityFact>("community_facts", data)
  if (!fact) return null

  // Also record the submitter's vote
  if (payload.contributor_token) {
    await insert("fact_votes", {
      fact_id: fact.id,
      vote_type: "corroborate",
      voter_token: payload.contributor_token,
    })
  }

  return {
    ok: true,
    fact: {
      ...fact,
      trust_level: fact.corroboration_count >= 5 ? "community_verified" : "unverified",
    },
    is_duplicate: false,
  }
}

/**
 * Corroborate (+) or dispute a community fact.
 */
export async function voteFact(
  factId: number,
  voteType: "corroborate" | "dispute",
  voterToken: string
): Promise<{ ok: boolean; corroboration_count: number; trust_level: string; already_voted: boolean } | null> {
  // Check if already voted
  const existing = await query("fact_votes", {
    "fact_id": `eq.${factId}`,
    "voter_token": `eq.${voterToken}`,
  })

  if (existing.length > 0) {
    return { ok: true, corroboration_count: 0, trust_level: "unverified", already_voted: true }
  }

  // Record vote
  await insert("fact_votes", {
    fact_id: factId,
    vote_type: voteType,
    voter_token: voterToken,
  })

  // Update the fact's counter via RPC
  const col = voteType === "corroborate" ? "corroboration_count" : "dispute_count"
  await rpc("increment_fact_counter", { p_fact_id: factId, p_column: col })

  return { ok: true, corroboration_count: 0, trust_level: "unverified", already_voted: false }
}

/**
 * Fetch ward/constituency statistics (population, infrastructure, etc.)
 */
export async function fetchWardStats(assemblyConstituency: string, cityId = "bengaluru"): Promise<WardStats | null> {
  const data = await rpcOrThrow<WardStats>("ward_stats_by_ac", {
    p_assembly_constituency: cityId === "bengaluru" ? bengaluruDataConstituency(assemblyConstituency) : assemblyConstituency,
    ...(cityId !== "bengaluru" ? { p_city_id: cityId } : {}),
  })
  return data
}

/**
 * Fetch unanswered questions for a ward  the "what's unknown" prompts.
 */
export async function fetchWardUnknowns(wardNo: number, cityId = "bengaluru") {
  return await rpcOrThrow<{
    ward_no: number
    total_questions: number
    answered: number
    unanswered: Array<{
      category: string
      subject: string
      field: string
      prompt: string
      icon: string
      priority: number
    }>
  }>("ward_unknowns", { p_ward_no: wardNo, p_city_id: cityId })
}

/**
 * Fetch recent community activity across the city.
 */
export async function fetchRecentActivity(limit = 20) {
  return await rpc<Array<{
    type: string
    ward_no: number
    ward_name: string
    category: string
    subject: string
    field: string
    value: string
    corroborations: number
    created_at: string
    trust_level: string
  }>>("recent_activity", { p_limit: limit })
}

/**
 * Fetch property tax collections for an assembly constituency.
 */
export async function fetchPropertyTax(assemblyConstituency: string, cityId = "bengaluru"): Promise<PropertyTaxData | null> {
  return await rpcOrThrow<PropertyTaxData>("property_tax_by_ac", {
    p_assembly_constituency: cityId === "bengaluru" ? bengaluruDataConstituency(assemblyConstituency) : assemblyConstituency,
    ...(cityId !== "bengaluru" ? { p_city_id: cityId } : {}),
  })
}

/**
 * Fetch BBMP budget summary.
 */
export async function fetchBudgetSummary(financialYear = "2024-25"): Promise<BudgetSummary | null> {
  return await rpcOrThrow<BudgetSummary>("budget_summary", {
    p_financial_year: financialYear,
  })
}

/**
 * Fetch departments/agencies.
 */
export async function fetchDepartments(cityId = "bengaluru") {
  return await queryOrThrow("departments", { "city_id": `eq.${cityId}` }, { order: "category,short" })
}

/**
 * Fetch ward-level grievance aggregates (BBMP complaints, by ward name).
 */
export async function fetchWardGrievances(wardName: string, cityId = "bengaluru"): Promise<WardGrievances[]> {
  return await queryOrThrow<WardGrievances>("ward_grievances", {
    "ward_name": `eq.${wardName}`,
    "city_id": `eq.${cityId}`,
    "category": "eq.ALL",
    "select": "year,total_complaints,closed,in_progress,registered,reopened",
    "order": "year.desc",
    "limit": "3",
  })
}

/**
 * Fetch Sakala service-delivery performance for a BBMP assembly constituency.
 */
export async function fetchSakalaPerformance(acName: string): Promise<SakalaPerformance | null> {
  // sakala_performance spells some constituencies differently from
  // elected_reps; accept either the current-ward name or the data name.
  const names = [...new Set([acName, bengaluruDataConstituency(acName)])]
    .map(name => `assembly_name.ilike.${name.replace(/[(),]/g, "")}`)
  const rows = await queryOrThrow<SakalaPerformance>("sakala_performance", {
    "or": `(${names.join(",")})`,
    "department_code": "eq.BB",
    "select": "assembly_name,year,intime_pct,delayed_pct,pending,rank_intime,rank_overall",
    "order": "year.desc",
    "limit": "1",
  })
  return rows[0] ?? null
}

/**
 * Fetch trade license stats for a ward (aggregated by year).
 */
export async function fetchTradeLicenses(wardName: string, cityId = "bengaluru"): Promise<import('./types').WardTradeLicenses[]> {
  return await queryOrThrow<import('./types').WardTradeLicenses>('ward_trade_licenses', {
    'ward_name': `eq.${wardName}`,
    'city_id': `eq.${cityId}`,
    'select': 'year,total_licenses,new_licenses,renewals,total_revenue,top_trade_type',
    'order': 'year.desc',
    'limit': '3',
  })
}

/**
 * Fetch GBA City Corporation contacts for a given corporation name.
 */
export async function fetchCorpContacts(corporation: string): Promise<import('./types').GbaContact[]> {
  const rows = await queryOrThrow<import('./types').GbaContact>('gba_contacts', { corporation: `eq.${corporation}` }, { order: 'id' })
  return rows
}

/**
 * Lookup local offices (BESCOM, BWSSB, Police) for a lat/lng point.
 */
export async function lookupLocalOffices(lat: number, lng: number): Promise<import('./types').LocalOffice[]> {
  const result = await rpcOrThrow<import('./types').LocalOffice[]>('lookup_local_offices', { p_lat: lat, p_lng: lng })
  return result ?? []
}

/**
 * Fetch BBMP work orders for a ward. Returns both opencity-sourced
 * legacy rows (with net_paid/deduction populated) and IFMS-sourced
 * live rows (with contractor_code/division/budget_head/payment_status
 * populated) in a single mixed list ordered by contract size.
 */
export async function fetchWorkOrders(wardNo: number, cityId = "bengaluru"): Promise<import('./types').WorkOrder[]> {
  // v_work_orders_243 = bbmp_work_orders ⋈ ward_crosswalk (overlap-inclusive):
  // a work order surfaces in every DataMeet-243 ward its BBMP-225 ward
  // materially overlaps, so previously-empty wards are populated correctly.
  // overlap_share + is_primary let the UI tag shared works. See
  // data/ward-crosswalk/METHODOLOGY.md.
  return await queryOrThrow<import('./types').WorkOrder>('v_work_orders_243', {
    'datameet243_no': `eq.${wardNo}`,
    'city_id': `eq.${cityId}`,
    'select': 'id,work_order_id,ward_no,bbmp_ward_no,datameet243_no,overlap_share,is_primary,ward_class,source_ward_name,description,contractor,contractor_name,contractor_phone,sanctioned_amount,net_paid,deduction,fy,contractor_code,division,budget_head,start_date,end_date,order_ref,sbr_ref,bill_ref,payment_status,data_source,ifms_wbid',
    'order': 'sanctioned_amount.desc.nullslast,net_paid.desc.nullslast',
    'limit': '20',
  })
}

/**
 * Fetch contractor profile by phone number or entity ID.
 */
export async function fetchContractorProfile(phone: string): Promise<import('./types').ContractorProfile | null> {
  const rows = await query<import('./types').ContractorProfile>('contractor_profiles', {
    'phone': `eq.${phone}`,
    'select': 'entity_id,canonical_name,aliases,phone,total_contracts,total_value_lakh,total_paid_lakh,total_deduction_lakh,avg_deduction_pct,ward_count,wards,first_seen,last_seen,is_govt_entity,blacklist_flags',
    'limit': '1',
  })
  return rows[0] ?? null
}

/**
 * Fetch top contractors for the city by total value.
 */
export async function fetchTopContractors(limit = 10): Promise<import('./types').ContractorProfile[]> {
  return await query<import('./types').ContractorProfile>('contractor_profiles', {
    'city_id': 'eq.bengaluru',
    'select': 'entity_id,canonical_name,aliases,phone,total_contracts,total_value_lakh,total_paid_lakh,total_deduction_lakh,avg_deduction_pct,ward_count,wards,first_seen,last_seen,is_govt_entity,blacklist_flags',
    'order': 'total_value_lakh.desc',
    'limit': String(limit),
  })
}

/**
 * Fetch contractors flagged on any blacklist.
 */
export async function fetchFlaggedContractors(): Promise<import('./types').ContractorProfile[]> {
  return await query<import('./types').ContractorProfile>('contractor_profiles', {
    'blacklist_flags': 'neq.{}',
    'city_id': 'eq.bengaluru',
    'select': 'entity_id,canonical_name,aliases,phone,total_contracts,total_value_lakh,total_paid_lakh,total_deduction_lakh,avg_deduction_pct,ward_count,wards,first_seen,last_seen,is_govt_entity,blacklist_flags',
    'order': 'total_value_lakh.desc',
  })
}

/**
 * Fetch contractors active in a specific ward.
 */
export async function fetchWardContractors(
  wardNo: number,
  cityId = "bengaluru",
  /** The BBMP-225 crosswalk rows, when the caller has them (the server bundles them); otherwise loaded here. */
  sourceRows?: LegacySourceWardRow[],
): Promise<import('./types').ContractorProfile[]> {
  const sourceWardNos = cityId !== "bengaluru" ? [wardNo]
    : sourceRows ? sourceWardNosForLegacyWard(sourceRows, wardNo)
    : await sourceWardNosForHistoricalWard(wardNo)
  if (!sourceWardNos.length) return []
  return await queryOrThrow<import('./types').ContractorProfile>('contractor_profiles', {
    // contractor_profiles.wards stores the original BBMP-Final-225 work-order
    // keys, not DataMeet-243 keys. Array overlap over the materially
    // overlapping 225 wards performs the same bridge as v_work_orders_243.
    'wards': `ov.{${sourceWardNos.join(',')}}`,
    'city_id': `eq.${cityId}`,
    'select': 'entity_id,canonical_name,aliases,phone,total_contracts,total_value_lakh,total_paid_lakh,total_deduction_lakh,avg_deduction_pct,ward_count,wards,first_seen,last_seen,is_govt_entity,blacklist_flags',
    'order': 'total_value_lakh.desc',
    // Not a top-N: the ward record counts debarment flags across every
    // contractor here, and half of wards have more than 10 (the busiest ~56).
    'limit': '500',
  })
}

/**
 * Fetch pothole complaint counts (Fix My Street 2022) for BBMP-198 wards.
 * ward_potholes is keyed on the 198-ward map: pass 198 numbers from the
 * crosswalk, never a DataMeet-243 or GBA ward number.
 */
export async function fetchWardPotholesByBbmp198(bbmp198WardNos: Iterable<number>): Promise<import('./types').WardPotholes[]> {
  const wardNo = bbmp198WardFilter(bbmp198WardNos)
  if (!wardNo) return []
  return await queryOrThrow<import('./types').WardPotholes>('ward_potholes', {
    'ward_no': wardNo,
    'select': 'ward_no,ward_name,complaints,data_year',
  })
}

/**
 * Fetch MLA/MP report card for a constituency.
 */
export async function fetchRepReportCard(constituency: string, role: string = 'MLA'): Promise<import('./types').RepReportCard | null> {
  const rows = await queryOrThrow<import('./types').RepReportCard>('rep_report_cards', {
    'constituency': `ilike.${bengaluruDataConstituency(constituency)}`,
    'role': `eq.${role}`,
    'select': 'role,constituency,attendance_pct,questions_asked,debates,bills_introduced,committees,lad_utilization_pct,net_worth_growth_pct,criminal_cases,term',
    'limit': '1',
  })
  return rows[0] ?? null
}

/**
 * Fetch ward committee meeting counts (2020-2022) for BBMP-198 ward
 * committees. ward_committee_meetings is keyed on the 198-ward map: pass 198
 * numbers from the crosswalk, never a DataMeet-243 or GBA ward number.
 */
export async function fetchWardCommitteeMeetingsByBbmp198(bbmp198WardNos: Iterable<number>): Promise<import('./types').WardCommitteeMeetings[]> {
  const wardNo = bbmp198WardFilter(bbmp198WardNos)
  if (!wardNo) return []
  return await queryOrThrow<import('./types').WardCommitteeMeetings>('ward_committee_meetings', {
    'ward_no': wardNo,
    'select': 'ward_no,ward_name,assembly_constituency,meetings_count,period',
  })
}

/**
 * Fetch MLA LAD fund spend for an assembly constituency (2013-2018 term).
 */
export async function fetchMlaLadFunds(assemblyConstituency: string): Promise<import('./types').MlaLadFunds[]> {
  return await queryOrThrow<import('./types').MlaLadFunds>('mla_lad_funds', {
    'assembly_constituency': `ilike.${bengaluruDataConstituency(assemblyConstituency)}`,
    'select': 'assembly_constituency,financial_year,total_lakh,project_count,term',
    'order': 'financial_year.asc',
  })
}

/**
 * Fetch infrastructure stats for a ward (traffic signals + BMTC stops from spatial join).
 */
export async function fetchWardInfraStats(wardNo: number, cityId = "bengaluru"): Promise<import('./types').WardInfraStats | null> {
  const rows = await queryOrThrow<import('./types').WardInfraStats>('ward_infra_stats', {
    ...wardQueryScope('ward_infra_stats', wardNo, cityId),
    'select': 'ward_no,ward_name,signal_count,bus_stop_count,daily_trips',
    'limit': '1',
  })
  return rows[0] ?? null
}

/**
 * Fetch BMTC bus stop count and daily trips for a ward (ward_bus_stops; no row
 * means no stop). See lib/ward-data-quality.ts.
 */
export async function fetchWardBusStats(wardNo: number): Promise<import('./types').WardBusStats | null> {
  const rows = await queryOrThrow<import('./types').WardBusStats>('ward_bus_stops', {
    'ward_no': `eq.${wardNo}`,
    'select': 'ward_no,stop_count,total_trips',
    'limit': '1',
  })
  return rows[0] ?? null
}

/**
 * Fetch road crash data for a ward (ward_road_crashes table).
 */
export async function fetchWardRoadCrashes(wardNo: number): Promise<import('./types').WardRoadCrashes | null> {
  const rows = await queryOrThrow<import('./types').WardRoadCrashes>('ward_road_crashes', {
    'ward_no': `eq.${wardNo}`,
    'select': 'ward_no,crashes_2024,fatal_2024,crashes_2025,fatal_2025',
    'limit': '1',
  })
  return rows[0] ?? null
}

/**
 * Fetch air quality data for nearest monitoring station to a ward.
 */
export async function fetchWardAirQuality(wardNo: number): Promise<import('./types').WardAirQuality | null> {
  const rows = await queryOrThrow<import('./types').WardAirQuality>('ward_air_quality', {
    'ward_no': `eq.${wardNo}`,
    'select': 'ward_no,station_name,avg_pm25,avg_pm10,data_year',
    'limit': '1',
  })
  return rows[0] ?? null
}

/**
 * Fetch active city pulse facts for the homepage ticker.
 */
export async function fetchCityPulseFacts(cityId = "bengaluru"): Promise<{ category: string; severity: string; headline: string; source_name: string; source_url: string | null }[]> {
  try {
    return await query<{ category: string; severity: string; headline: string; source_name: string; source_url: string | null }>('city_pulse_facts', {
      'city_id': `eq.${cityId}`,
      'is_active': 'eq.true',
      'select': 'category,severity,headline,source_name,source_url',
      'order': 'is_editorial.desc,published_at.desc',
      'limit': '20',
    })
  } catch {
    return []
  }
}

/**
 * Fetch ward spend breakdown by category (BBMP work orders 2018-2023).
 */
export async function fetchWardReportCount(wardNo: number, cityId = "bengaluru"): Promise<number> {
  const rows = await queryOrThrow<{ id: number }>('ward_reports', {
    ...wardQueryScope('ward_reports', wardNo, cityId),
    'status': 'eq.approved',
    'reported_at': `gte.${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()}`,
    'select': 'id',
  })
  return rows.length
}

export interface CivicSignal {
  id: number
  source: string
  url: string
  author: string
  title: string
  issue_type: string
  upvotes: number
  signal_at: string
}

export async function fetchWardSignals(wardNo: number, cityId = "bengaluru"): Promise<CivicSignal[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  return queryOrThrow<CivicSignal>('civic_signals', {
    ...wardQueryScope('civic_signals', wardNo, cityId),
    'signal_at': `gte.${since}`,
    'select': 'id,source,url,author,title,issue_type,upvotes,signal_at',
    'order': 'signal_at.desc',
    'limit': '10',
  })
}

/**
 * Fetch ward amenities from OSM data (hospitals, pharmacies, ATMs, EV charging, etc.)
 */
export async function fetchWardAmenities(wardNo: number, cityId = "bengaluru"): Promise<import('./types').WardAmenities | null> {
  const rows = await queryOrThrow<import('./types').WardAmenities>('ward_amenities', {
    'ward_no': `eq.${wardNo}`,
    'city_id': `eq.${cityId}`,
    'select': 'ward_no,city_id,hospitals,clinics,pharmacies,atms,banks,public_toilets,ev_charging,petrol_pumps,post_offices,libraries,community_halls,places_of_worship,restaurants,cafes,metro_stations,data_source,updated_at',
    'limit': '1',
  })
  return rows[0] ?? null
}

/**
 * Fetch water body quality data near a ward.
 */
export async function fetchWardWaterQuality(wardNo: number, cityId = "bengaluru"): Promise<import('./types').WardWaterQuality[]> {
  return await queryOrThrow<import('./types').WardWaterQuality>('ward_water_quality', {
    'ward_no': `eq.${wardNo}`,
    'city_id': `eq.${cityId}`,
    'select': 'ward_no,water_body_name,water_body_type,ph,bod,do_level,coliform,quality_class,data_year,data_source',
    'order': 'data_year.desc',
    'limit': '5',
  })
}

/**
 * Fetch ward works spend by category (2018-23) for BBMP-198 wards.
 * ward_spend_category is keyed on the 198-ward map: pass 198 numbers from the
 * crosswalk, never a DataMeet-243 or GBA ward number.
 */
export async function fetchWardSpendByBbmp198(bbmp198WardNos: Iterable<number>): Promise<import('./types').WardSpendCategory[]> {
  const wardNo = bbmp198WardFilter(bbmp198WardNos)
  if (!wardNo) return []
  return await queryOrThrow<import('./types').WardSpendCategory>('ward_spend_category', {
    'ward_no': wardNo,
    'select': 'ward_no,ward_name,buildings_facilities,drainage,roads_and_drains,roads_and_infrastructure,streetlighting,waste_management,water_and_sanitation,grand_total,period',
  })
}

export interface CorporationTenders {
  /** The latest tenders, newest first. */
  tenders: import('./types').Tender[]
  /** Every tender on record for this department. */
  total: number
}

/**
 * The latest KPPP tenders for one GBA corporation (a KPPP department name).
 * The card shows a few; the count comes from PostgREST's Content-Range, so
 * the other rows never travel. ward_profile used to ship every city tender
 * (13,203 rows, ~6.6 MB) on each ward open.
 */
export async function fetchCorporationTenders(department: string, limit: number, cityId = "bengaluru"): Promise<CorporationTenders> {
  const url = restUrl('tenders')
  url.searchParams.set('city_id', `eq.${cityId}`)
  url.searchParams.set('department', `eq.${department}`)
  url.searchParams.set('select', 'id,kppp_id,title,department,contractor_name,contractor_blacklisted,value_lakh,status,issued_date,deadline,source_url')
  url.searchParams.set('order', 'issued_date.desc.nullslast')
  url.searchParams.set('limit', String(limit))
  const res = await restRequest(url, { headers: { 'Prefer': 'count=exact' } })
  let tenders: import('./types').Tender[]
  try {
    tenders = await res.json()
  } catch {
    throw new DataRequestError('tenders: unreadable response')
  }
  return { tenders, total: tenderTotal(res.headers.get('content-range'), tenders.length) }
}

/**
 * A ward's cached record or live parts from Kaun's ward route
 * (app/api/ward/[corporation]/[ward]). Rejects with DataRequestError, so the
 * card shows "Couldn't load · Retry" for every part the request covered.
 */
export async function fetchWardRoute<T>(path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, { signal: AbortSignal.timeout(BROWSER_REQUEST_TIMEOUT_MS) })
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError"
    throw new DataRequestError(`${path}: ${timedOut ? "timed out" : "unreachable"}`)
  }
  if (!res.ok) throw new DataRequestError(`${path}: HTTP ${res.status}`)
  try {
    return await res.json() as T
  } catch {
    throw new DataRequestError(`${path}: unreadable response`)
  }
}

