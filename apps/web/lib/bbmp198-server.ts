/**
 * Server-side access to the BBMP-198 -> DataMeet-243 crosswalk for route
 * handlers. The JSON is bundled (no relative fetch from a route); the client
 * loads the same versioned public asset.
 */
import bbmp198CrosswalkJson from "@/public/bengaluru-bbmp-198-to-datameet-243.json"
import { BBMP198_CROSSWALK_VERSION } from "./constants"
import { indexBbmp198Crosswalk, type Bbmp198CrosswalkArtifact, type Bbmp198Estimate } from "./bbmp198-crosswalk"

export const BBMP198_INDEX = indexBbmp198Crosswalk(bbmp198CrosswalkJson as Bbmp198CrosswalkArtifact)

export const WARD_CROSSWALK_PAGE = "https://data.kaun.city/bengaluru/ward-crosswalk/"

/** Provenance attached to every public figure allocated from 198-ward records. */
export function bbmp198EstimateProvenance(estimate: Bbmp198Estimate<string>) {
  return {
    method: "Recorded on BBMP's 198-ward map (2010 delimitation) and allocated to this DataMeet-243 ward by area overlap. An estimate, not a ward-level record.",
    crosswalk_version: BBMP198_CROSSWALK_VERSION,
    crosswalk: WARD_CROSSWALK_PAGE,
    bbmp198_wards: estimate.bbmp198_wards,
  }
}
