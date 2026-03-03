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
}

export interface PinResult {
  found: boolean
  city_id: string
  ward_no: number | null
  ward_name: string | null
  zone: string | null
  assembly_constituency: string | null
  agencies: Agency[]
  primary_agency: Agency | null
}

/** Subset of GeoJSON feature properties from datameet BBMP.geojson */
export interface WardProperties {
  KGISWardNo: number
  KGISWardName: string
  ZoneName?: string
  Assembly?: string
}
