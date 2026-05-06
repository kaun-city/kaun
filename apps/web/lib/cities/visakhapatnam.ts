import type { CityConfig } from "./types"

/**
 * Visakhapatnam — second city deployment.
 *
 * Different from Bengaluru in two important ways:
 *
 * 1. Data layer: GVMC (Greater Visakhapatnam Municipal Corporation) runs on
 *    UPYOG/DIGIT (eGov Foundation's open platform). All 123 AP ULBs use the
 *    same backend, so the adapter built here is reusable across Vijayawada,
 *    Tirupati, Guntur, etc. The CDMA Open Portal at
 *    apcdmaopenportal.emunicipal.ap.gov.in exposes structured grievance,
 *    revenue and service-request data publicly.
 *
 * 2. Editorial tone: AP's open data infrastructure is genuinely best-in-class
 *    in India. The framing here is "transparency" — leading with what's
 *    working (resolution times, scheme uptake, ward-level service delivery)
 *    rather than "accountability" (scams, blacklists). This is honest to
 *    the data and respectful of the governance investment AP has made.
 */
export const visakhapatnam: CityConfig = {
  id: "visakhapatnam",
  name: "Visakhapatnam",
  state: "Andhra Pradesh",
  country: "India",
  center: [17.6868, 83.2185],
  zoom: 11,
  // GVMC has 98 wards (2024 delimitation). KML is on opencity.in, will be
  // converted to GeoJSON and hosted in the kaun-city/kaun repo.
  geojsonUrl:
    "https://raw.githubusercontent.com/kaun-city/kaun/master/data/visakhapatnam-wards.geojson",
  subreddit: "Visakhapatnam",
  budgetYear: "2025-26",
  tone: "transparency",
  wardCount: 98,
  localAgency: {
    short: "GVMC",
    full: "Greater Visakhapatnam Municipal Corporation",
    helpline: "1800-4250-0009",
    website: "https://gvmc.gov.in",
    grievanceUrl: "https://gvmc.gov.in/static_content/Grievances.jsp",
    rtiAddress: "Public Information Officer, GVMC, Asilmetta, Visakhapatnam - 530016",
  },
  // Most features are unset at v1 — turned on as adapters land.
  // UPYOG-backed features (grievances, propertyTax, tradeLicenses) will be
  // first to enable since the data is already public on the CDMA portal.
  features: {
    mlaLadFunds:           false, // AP MLA-LADS data path TBD
    repReportCards:        false, // Pending: AP assembly attendance data
    wardCommitteeMeetings: false, // GVMC ward committee data not yet sourced
    workOrders:            false, // AP eProc adapter pending
    tradeLicenses:         true,  // UPYOG TL module via CDMA portal
    wardPotholes:          false, // GVMC grievances will cover this
    wardSpend:             false, // Pending
    grievances:            true,  // UPYOG PGR via CDMA portal
    propertyTax:           true,  // UPYOG PT via CDMA portal
    sakala:                false, // Karnataka-specific
    budget:                true,  // PDFs on gvmc.gov.in
    buzz:                  true,  // r/Visakhapatnam
    wardAmenities:         true,  // OSM works for any city
    wardWaterQuality:      false, // APPCB station data path TBD
  },
}
