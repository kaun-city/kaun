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
  /**
   * If true: pin lookup uses client-side point-in-polygon against geojsonUrl.
   * If false (default): uses the PostGIS pin_lookup RPC in Supabase.
   */
  clientSidePinLookup?: boolean
  /** Civic body name (e.g. 'BBMP', 'GHMC') */
  civicBody?: string
  /** Primary complaint helpline number */
  helplineNumber?: string
  /** Feature flags - gates data fetches and UI sections */
  features: CityFeatures
}
