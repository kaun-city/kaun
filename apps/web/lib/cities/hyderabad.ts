import type { CityConfig } from "./types"

export const hyderabad: CityConfig = {
  id: "hyderabad",
  name: "Hyderabad",
  state: "Telangana",
  country: "India",
  center: [17.385, 78.4867],
  zoom: 11,
  geojsonUrl:
    "https://raw.githubusercontent.com/datameet/Municipal_Spatial_Data/master/Hyderabad/ghmc-wards.geojson",
  wardAcMapUrl: "/geo/hyderabad/ward-ac-mapping.json",
  subreddit: "hyderabad",
  budgetYear: "2024-25",
  sakalaNote: "Telangana has its own citizen services portal (meeseva.telangana.gov.in)",
  clientSidePinLookup: true,
  civicBody: "GHMC",
  helplineNumber: "040-21111111",
  features: {
    // Available
    budget:                true,   // GHMC budget PDFs via opencity.in
    buzz:                  true,   // Reddit r/hyderabad + news feeds
    wardAmenities:         false,  // Not seeded yet
    wardWaterQuality:      false,  // Not seeded yet

    // Not available / not applicable for GHMC
    mlaLadFunds:           false,  // Telangana LAD data not yet sourced
    repReportCards:        false,  // Telangana assembly data not yet in DB
    wardCommitteeMeetings: false,  // No public data available
    workOrders:            false,  // No GHMC equivalent of BBMP work orders API
    tradeLicenses:         false,  // No open data source found
    wardPotholes:          false,  // No structured open data
    wardSpend:             false,  // No ward-level spend breakdown
    grievances:            false,  // igs.ghmc.gov.in is login-walled
    propertyTax:           false,  // No ward-level breakdown
    sakala:                false,  // Telangana uses different system
  },
}
