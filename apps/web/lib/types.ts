export interface Agency {
  name: string
  short: string
  helpline: string | null
  website: string | null
  complaint_url: string | null
}

export interface RedditPost {
  title: string
  url: string
  score: number
  num_comments: number
  created_utc: number
  author: string
  flair: string | null
}

export interface ElectedRep {
  id: number
  role: "MLA" | "MP" | "CORPORATOR"
  constituency: string
  name: string
  party: string | null
  elected_since: string | null
  photo_url: string | null
  phone: string | null
  profile_url: string | null
  notes: string | null
  // From ECI affidavit / myneta.info
  criminal_cases: number | null
  age: number | null
  profession: string | null
  education: string | null
  data_source: string | null
}

export interface Officer {
  id: number
  department: string
  role: string
  name: string | null
  phone: string | null
  source: string | null
}

export interface Tender {
  id: number
  kppp_id: string | null
  title: string
  department: string | null
  contractor_name: string | null
  contractor_blacklisted: boolean
  value_lakh: number | null
  status: "OPEN" | "AWARDED" | "COMPLETED" | "CANCELLED"
  issued_date: string | null
  deadline: string | null
  source_url: string | null
}

export interface GovernanceAlert {
  type: string
  title: string
  body: string
  since: string
}

export type TrustLevel = "official" | "rti" | "community_verified" | "unverified" | "disputed"

export interface CommunityFact {
  id: number
  city_id: string
  ward_no: number | null
  category: string
  subject: string
  field: string
  value: string
  source_type: string
  source_url: string | null
  source_note: string | null
  corroboration_count: number
  dispute_count: number
  trust_level: TrustLevel
  created_at: string
  last_corroborated_at: string | null
}

export interface WardProfile {
  ward_no: number
  city_id: string
  assembly_constituency: string | null
  elected_reps: ElectedRep[]
  officers: Officer[]
  tenders: Tender[]
  tender_count: number
  tender_total_lakh: number
  governance_alert: GovernanceAlert
  community_facts: CommunityFact[]
}

export interface PinResult {
  found: boolean
  city_id: string
  // Legacy BBMP fields (used for all historical data joins)
  ward_no: number | null
  ward_name: string | null
  zone: string | null
  assembly_constituency: string | null
  agencies?: Agency[]
  primary_agency?: Agency | null
  lat?: number
  lng?: number
  // GBA fields (new structure from Oct 2025)
  gba_ward_no: number | null
  gba_ward_name: string | null
  gba_ward_name_kn: string | null
  gba_corporation: string | null       // 'Central'|'East'|'North'|'South'|'West'
  gba_corporation_id: number | null
  gba_ac: string | null
  gba_ac_no: number | null
  gba_zone: string | null
  gba_zone_name: string | null
  gba_population: number | null
}

export interface Department {
  id: number
  city_id: string
  short: string
  name: string
  alt_names: string | null
  category: string
  description: string | null
  website: string | null
  complaint_url: string | null
  helpline: string | null
  toll_free: string | null
  email: string | null
  handles: string | null
}

export interface PropertyTaxYear {
  financial_year: string
  total_collection_lakh: number
  total_applications: number
  ward_count: number
}

export interface PropertyTaxData {
  assembly_constituency: string
  years: PropertyTaxYear[]
}

export interface BudgetDept {
  department: string
  description: string
  amount_lakh: number
  amount_cr: number
  pct: number
}

export interface BudgetSummary {
  financial_year: string
  budget_type: string
  total_expenditure_lakh: number | null
  departments: BudgetDept[] | null
}

export interface WardStats {
  assembly_constituency: string
  total_population: number | null
  total_area_sqkm: number | null
  total_households: number | null
  total_road_length_km: number | null
  total_lakes: number | null
  total_parks: number | null
  total_playgrounds: number | null
  total_govt_schools: number | null
  total_police_stations: number | null
  total_fire_stations: number | null
  total_bus_stops: number | null
  total_bus_routes: number | null
  total_streetlights: number | null
  streetlights: number | null
  trees: number | null
  namma_clinics: number | null
  dwcc_count: number | null
  avg_population_density: number | null
  ward_count: number | null
  data_year: number
  source: string
}

export interface WardGrievances {
  year: number
  total_complaints: number
  closed: number
  in_progress: number
  registered: number
  reopened: number
}

export interface SakalaPerformance {
  assembly_name: string
  year: number
  intime_pct: number | null
  delayed_pct: number | null
  pending: number | null
  rank_intime: number | null
  rank_overall: number | null
}

/** Subset of GeoJSON feature properties from datameet BBMP.geojson */
export interface WardProperties {
  KGISWardNo: number
  KGISWardName: string
  ZoneName?: string
  Assembly?: string
}

export interface WardTradeLicenses {
  year: number
  total_licenses: number
  new_licenses: number
  renewals: number
  total_revenue: number
  top_trade_type: string | null
}

export interface LocalOffice {
  boundary_type: string
  name: string
  phone?: string
  email?: string
}

export interface GbaContact {
  id: number
  corporation: string
  role: string
  name: string | null
  phone: string | null
  email: string | null
  control_room: string | null
  office_address: string | null
}

export interface WorkOrder {
  id: number
  work_order_id: string
  ward_no: number
  description: string
  contractor: string | null
  contractor_name: string | null
  contractor_phone: string | null
  sanctioned_amount: number
  net_paid: number | null
  deduction: number | null
  fy: string
  // Fields populated by the IFMS adapter (scripts/adapters/ifms.mjs).
  // Null for opencity-sourced rows.
  contractor_code?: string | null
  division?: string | null
  budget_head?: string | null
  start_date?: string | null
  end_date?: string | null
  order_ref?: string | null
  sbr_ref?: string | null
  bill_ref?: string | null
  payment_status?: string | null
  data_source?: string | null
  ifms_wbid?: number | null
}

export interface ContractorProfile {
  entity_id: string
  canonical_name: string
  aliases: string[]
  phone: string | null
  total_contracts: number
  total_value_lakh: number
  total_paid_lakh: number
  total_deduction_lakh: number
  avg_deduction_pct: number
  ward_count: number
  wards: number[]
  first_seen: string | null
  last_seen: string | null
  is_govt_entity: boolean
  blacklist_flags: string[]
}

export interface WardPotholes {
  ward_no: number
  ward_name: string
  complaints: number
  data_year: string
}

export interface RepReportCard {
  role: string
  constituency: string
  attendance_pct: number | null
  questions_asked: number | null
  debates: number | null
  bills_introduced: number | null
  committees: number | null
  lad_utilization_pct: number | null
  net_worth_growth_pct: number | null
  criminal_cases: number | null
  term: string
}

export interface WardCommitteeMeetings {
  ward_no: number
  ward_name: string
  assembly_constituency: string
  meetings_count: number
  period: string
}

export interface MlaLadFunds {
  assembly_constituency: string
  financial_year: string
  total_lakh: number
  project_count: number
  term: string
}

export interface WardSpendCategory {
  ward_no: number
  ward_name: string
  buildings_facilities: number
  drainage: number
  roads_and_drains: number
  roads_and_infrastructure: number
  streetlighting: number
  waste_management: number
  water_and_sanitation: number
  grand_total: number
  period: string
}

export interface WardInfraStats {
  ward_no: number
  ward_name: string
  signal_count: number
  bus_stop_count: number
  daily_trips: number
}

export interface WardBusStats {
  ward_no: number
  stop_count: number
  total_trips: number
}

export interface WardRoadCrashes {
  ward_no: number
  crashes_2024: number
  fatal_2024: number
  crashes_2025: number
  fatal_2025: number
}

export interface WardAirQuality {
  ward_no: number
  station_name: string
  avg_pm25: number | null
  avg_pm10: number | null
  data_year: string
}

export interface WardAmenities {
  ward_no: number
  city_id: string
  hospitals: number
  clinics: number
  pharmacies: number
  atms: number
  banks: number
  public_toilets: number
  ev_charging: number
  petrol_pumps: number
  post_offices: number
  libraries: number
  community_halls: number
  places_of_worship: number
  restaurants: number
  cafes: number
  metro_stations: number
  data_source: string
  updated_at: string
}

export interface WardWaterQuality {
  ward_no: number
  water_body_name: string
  water_body_type: string
  ph: number | null
  bod: number | null
  do_level: number | null
  coliform: number | null
  quality_class: string | null
  data_year: string
  data_source: string
}

