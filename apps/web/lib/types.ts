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
  ward_no: number | null
  ward_name: string | null
  zone: string | null
  assembly_constituency: string | null
  agencies?: Agency[]
  primary_agency?: Agency | null
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
