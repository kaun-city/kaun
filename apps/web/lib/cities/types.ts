export interface CityFeatures {
  mlaLadFunds: boolean
  repReportCards: boolean
  wardCommitteeMeetings: boolean
  workOrders: boolean
  tradeLicenses: boolean
  wardPotholes: boolean
  wardSpend: boolean
  grievances: boolean
  propertyTax: boolean
  sakala: boolean
  budget: boolean
  buzz: boolean
  wardAmenities: boolean
  wardWaterQuality: boolean
}

/**
 * Tone influences the editorial framing of headlines, ward grade colours,
 * and which aspects of governance are surfaced first.
 *
 * "accountability" — leads with failures, scams, blacklists, missing money.
 *   Used when the city has documented governance issues and citizens need
 *   to know who's responsible for them. Default for Bengaluru.
 *
 * "transparency" — leads with service delivery, scheme uptake, resolution
 *   times, what's actually working. Used when the state government has
 *   built open data infrastructure and citizens benefit from showcasing
 *   it. Default for AP cities like Visakhapatnam.
 */
export type CityTone = "accountability" | "transparency"

export interface CityConfig {
  id: string
  name: string
  state: string
  country: string
  /** Map center [lat, lng] */
  center: [number, number]
  /** Default zoom level */
  zoom: number
  /** Ward boundary GeoJSON URL */
  geojsonUrl: string
  /** Reddit community (subreddit name without r/) */
  subreddit: string
  /** Budget financial year shown in Expenses tab */
  budgetYear: string
  /** Optional note shown in Stats/Sakala section */
  sakalaNote?: string
  /** Editorial tone for City Pulse, Ward Headline, share copy */
  tone?: CityTone
  /** Local civic agency (e.g., BBMP / GVMC / GHMC) — used in helplines, RTI text */
  localAgency?: {
    short: string
    full: string
    helpline?: string
    website?: string
    grievanceUrl?: string
    rtiAddress?: string
  }
  /** Number of wards in the city — used for percentile calculations */
  wardCount?: number
  /** Feature flags - gates data fetches and UI sections */
  features: CityFeatures
}
