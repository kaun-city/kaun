import type { CityConfig } from "./types"

export const bengaluru: CityConfig = {
  id: "bengaluru",
  name: "Bengaluru",
  state: "Karnataka",
  country: "India",
  center: [12.9716, 77.5946],
  zoom: 11,
  geojsonUrl:
    "https://raw.githubusercontent.com/datameet/Municipal_Spatial_Data/master/Bangalore/BBMP.geojson",
  subreddit: "bangalore",
  budgetYear: "2025-26",
  clientSidePinLookup: false,
  civicBody: "BBMP",
  helplineNumber: "1533",
  sakalaNote: "Bengaluru Urban ranks 31st of 32 districts statewide",
  features: {
    mlaLadFunds:           true,
    repReportCards:        true,
    wardCommitteeMeetings: true,
    workOrders:            true,
    tradeLicenses:         true,
    wardPotholes:          true,
    wardSpend:             true,
    grievances:            true,
    propertyTax:           true,
    sakala:                true,
    budget:                true,
    buzz:                  true,
    wardAmenities:         true,
    wardWaterQuality:      true,
  },
}
