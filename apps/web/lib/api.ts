/**
 * Kaun API layer  talks to Supabase directly.
 *
 * Spatial queries use PostgreSQL functions (RPC).
 * CRUD uses PostgREST.
 * No separate API server.
 */

import type { BudgetSummary, CommunityFact, PinResult, PropertyTaxData, RedditPost, WardProfile, WardStats, WardGrievances, SakalaPerformance } from "./types"
import { rpc, query, insert } from "./supabase"

/**
 * Pin lookup  reverse geocode a lat/lng to a ward.
 */
export async function pinLookup(lat: number, lng: number): Promise<PinResult | null> {
  const data = await rpc<{
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
  }>("pin_lookup", { lat, lng })

  if (!data || !data.found) {
    return { found: false } as PinResult
  }

  return {
    found: true,
    // BBMP legacy (all existing tabs continue to work)
    city_id: data.city_id ?? "bengaluru",
    ward_no: data.ward_no ?? 0,
    ward_name: data.ward_name ?? "",
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

/**
 * Fetch full ward profile via PostgreSQL function.
 */
export async function fetchWardProfile(
  wardNo: number,
  cityId = "bengaluru",
  assemblyConstituency?: string
): Promise<WardProfile | null> {
  const data = await rpc<WardProfile>("ward_profile", {
    p_ward_no: wardNo,
    p_city_id: cityId,
    p_assembly_constituency: assemblyConstituency ?? null,
  })
  return data
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
export async function fetchWardStats(assemblyConstituency: string): Promise<WardStats | null> {
  const data = await rpc<WardStats>("ward_stats_by_ac", {
    p_assembly_constituency: assemblyConstituency,
  })
  return data
}

/**
 * Fetch unanswered questions for a ward  the "what's unknown" prompts.
 */
export async function fetchWardUnknowns(wardNo: number, cityId = "bengaluru") {
  return await rpc<{
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
export async function fetchPropertyTax(assemblyConstituency: string): Promise<PropertyTaxData | null> {
  return await rpc<PropertyTaxData>("property_tax_by_ac", {
    p_assembly_constituency: assemblyConstituency,
  })
}

/**
 * Fetch BBMP budget summary.
 */
export async function fetchBudgetSummary(financialYear = "2024-25"): Promise<BudgetSummary | null> {
  return await rpc<BudgetSummary>("budget_summary", {
    p_financial_year: financialYear,
  })
}

/**
 * Fetch departments/agencies.
 */
export async function fetchDepartments(cityId = "bengaluru") {
  return await query("departments", { "city_id": `eq.${cityId}` }, { order: "category,short" })
}

/**
 * Fetch recent subreddit posts for a ward (client-side, optional).
 */
export async function fetchBuzz(wardName: string, subreddit = "bangalore"): Promise<RedditPost[]> {
  try {
    const q = encodeURIComponent(`${wardName} ${subreddit}`)
    const res = await fetch(
      `https://www.reddit.com/r/${subreddit}/search.json?q=${q}&restrict_sr=on&sort=new&limit=5`,
      { headers: { "User-Agent": "kaun-civic/1.0" } }
    )
    if (!res.ok) return []
    const data = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data?.data?.children ?? []).map((c: any) => ({
      title: c.data.title,
      url: `https://reddit.com${c.data.permalink}`,
      score: c.data.score,
      num_comments: c.data.num_comments,
      created_utc: c.data.created_utc,
      author: c.data.author ?? "",
      flair: c.data.link_flair_text ?? null,
    }))
  } catch {
    return []
  }
}

/**
 * Fetch ward-level grievance aggregates (BBMP complaints, by ward name).
 */
export async function fetchWardGrievances(wardName: string): Promise<WardGrievances[]> {
  return await query<WardGrievances>("ward_grievances", {
    "ward_name": `eq.${wardName}`,
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
  const rows = await query<SakalaPerformance>("sakala_performance", {
    "assembly_name": `ilike.${acName}`,
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
export async function fetchTradeLicenses(wardName: string): Promise<import('./types').WardTradeLicenses[]> {
  return await query<import('./types').WardTradeLicenses>('ward_trade_licenses', {
    'ward_name': `eq.${wardName}`,
    'select': 'year,total_licenses,new_licenses,renewals,total_revenue,top_trade_type',
    'order': 'year.desc',
    'limit': '3',
  })
}

/**
 * Fetch GBA City Corporation contacts for a given corporation name.
 */
export async function fetchCorpContacts(corporation: string): Promise<import('./types').GbaContact[]> {
  const rows = await query<import('./types').GbaContact>('gba_contacts', { corporation: `eq.${corporation}` }, { order: 'id' })
  return rows
}

/**
 * Lookup local offices (BESCOM, BWSSB, Police) for a lat/lng point.
 */
export async function lookupLocalOffices(lat: number, lng: number): Promise<import('./types').LocalOffice[]> {
  const result = await rpc<import('./types').LocalOffice[]>('lookup_local_offices', { p_lat: lat, p_lng: lng })
  return result ?? []
}

/**
 * Fetch BBMP work orders for a ward. Returns both opencity-sourced
 * legacy rows (with net_paid/deduction populated) and IFMS-sourced
 * live rows (with contractor_code/division/budget_head/payment_status
 * populated) in a single mixed list ordered by contract size.
 */
export async function fetchWorkOrders(wardNo: number): Promise<import('./types').WorkOrder[]> {
  return await query<import('./types').WorkOrder>('bbmp_work_orders', {
    'ward_no': `eq.${wardNo}`,
    'select': 'id,work_order_id,description,contractor,contractor_name,contractor_phone,sanctioned_amount,net_paid,deduction,fy,contractor_code,division,budget_head,start_date,end_date,order_ref,sbr_ref,bill_ref,payment_status,data_source,ifms_wbid',
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
export async function fetchWardContractors(wardNo: number): Promise<import('./types').ContractorProfile[]> {
  return await query<import('./types').ContractorProfile>('contractor_profiles', {
    'wards': `cs.{${wardNo}}`,
    'city_id': 'eq.bengaluru',
    'select': 'entity_id,canonical_name,aliases,phone,total_contracts,total_value_lakh,total_paid_lakh,total_deduction_lakh,avg_deduction_pct,ward_count,wards,first_seen,last_seen,is_govt_entity,blacklist_flags',
    'order': 'total_value_lakh.desc',
    'limit': '10',
  })
}

/**
 * Fetch pothole complaint count for a ward (Fix My Street 2022).
 */
export async function fetchWardPotholes(wardNo: number): Promise<import('./types').WardPotholes | null> {
  const rows = await query<import('./types').WardPotholes>('ward_potholes', {
    'ward_no': `eq.${wardNo}`,
    'select': 'ward_no,ward_name,complaints,data_year',
    'limit': '1',
  })
  return rows[0] ?? null
}

/**
 * Fetch MLA/MP report card for a constituency.
 */
export async function fetchRepReportCard(constituency: string, role: string = 'MLA'): Promise<import('./types').RepReportCard | null> {
  const rows = await query<import('./types').RepReportCard>('rep_report_cards', {
    'constituency': `ilike.${constituency}`,
    'role': `eq.${role}`,
    'select': 'role,constituency,attendance_pct,questions_asked,debates,bills_introduced,committees,lad_utilization_pct,net_worth_growth_pct,criminal_cases,term',
    'limit': '1',
  })
  return rows[0] ?? null
}

/**
 * Fetch ward committee meeting count (2020-2022) by ward number.
 */
export async function fetchWardCommitteeMeetings(wardNo: number): Promise<import('./types').WardCommitteeMeetings | null> {
  const rows = await query<import('./types').WardCommitteeMeetings>('ward_committee_meetings', {
    'ward_no': `eq.${wardNo}`,
    'select': 'ward_no,ward_name,assembly_constituency,meetings_count,period',
    'limit': '1',
  })
  return rows[0] ?? null
}

/**
 * Fetch MLA LAD fund spend for an assembly constituency (2013-2018 term).
 */
export async function fetchMlaLadFunds(assemblyConstituency: string): Promise<import('./types').MlaLadFunds[]> {
  return await query<import('./types').MlaLadFunds>('mla_lad_funds', {
    'assembly_constituency': `ilike.${assemblyConstituency}`,
    'select': 'assembly_constituency,financial_year,total_lakh,project_count,term',
    'order': 'financial_year.asc',
  })
}

/**
 * Fetch infrastructure stats for a ward (traffic signals + BMTC stops from spatial join).
 */
export async function fetchWardInfraStats(wardNo: number): Promise<import('./types').WardInfraStats | null> {
  const rows = await query<import('./types').WardInfraStats>('ward_infra_stats', {
    'ward_no': `eq.${wardNo}`,
    'select': 'ward_no,ward_name,signal_count,bus_stop_count,daily_trips',
    'limit': '1',
  })
  return rows[0] ?? null
}

/**
 * Fetch BMTC bus stop count and daily trips for a ward (ward_bus_stops table).
 */
export async function fetchWardBusStats(wardNo: number): Promise<import('./types').WardBusStats | null> {
  const rows = await query<import('./types').WardBusStats>('ward_bus_stops', {
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
  const rows = await query<import('./types').WardRoadCrashes>('ward_road_crashes', {
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
  const rows = await query<import('./types').WardAirQuality>('ward_air_quality', {
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
export async function fetchWardReportCount(wardNo: number): Promise<number> {
  const rows = await query<{ id: number }>('ward_reports', {
    'ward_no': `eq.${wardNo}`,
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

export async function fetchWardSignals(wardNo: number): Promise<CivicSignal[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  return query<CivicSignal>('civic_signals', {
    'ward_no': `eq.${wardNo}`,
    'signal_at': `gte.${since}`,
    'select': 'id,source,url,author,title,issue_type,upvotes,signal_at',
    'order': 'signal_at.desc',
    'limit': '10',
  })
}

/**
 * Fetch ward amenities from OSM data (hospitals, pharmacies, ATMs, EV charging, etc.)
 */
export async function fetchWardAmenities(wardNo: number): Promise<import('./types').WardAmenities | null> {
  const rows = await query<import('./types').WardAmenities>('ward_amenities', {
    'ward_no': `eq.${wardNo}`,
    'select': 'ward_no,city_id,hospitals,clinics,pharmacies,atms,banks,public_toilets,ev_charging,petrol_pumps,post_offices,libraries,community_halls,places_of_worship,restaurants,cafes,metro_stations,data_source,updated_at',
    'limit': '1',
  })
  return rows[0] ?? null
}

/**
 * Fetch water body quality data near a ward.
 */
export async function fetchWardWaterQuality(wardNo: number): Promise<import('./types').WardWaterQuality[]> {
  return await query<import('./types').WardWaterQuality>('ward_water_quality', {
    'ward_no': `eq.${wardNo}`,
    'select': 'ward_no,water_body_name,water_body_type,ph,bod,do_level,coliform,quality_class,data_year,data_source',
    'order': 'data_year.desc',
    'limit': '5',
  })
}

export async function fetchWardSpend(wardNo: number): Promise<import('./types').WardSpendCategory | null> {
  const rows = await query<import('./types').WardSpendCategory>('ward_spend_category', {
    'ward_no': `eq.${wardNo}`,
    'select': 'ward_no,ward_name,buildings_facilities,drainage,roads_and_drains,roads_and_infrastructure,streetlighting,waste_management,water_and_sanitation,grand_total,period',
    'limit': '1',
  })
  return rows[0] ?? null
}
