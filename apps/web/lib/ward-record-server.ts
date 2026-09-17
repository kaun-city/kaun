/**
 * Server-side inputs for lib/ward-record.ts: the crosswalks and ward identity
 * table are bundled into the route (no relative fetch from a route handler);
 * the browser loads the same versioned public assets.
 */
import identityJson from "./gba-ward-identity.json"
import gbaCrosswalkJson from "@/public/bengaluru-gba-369-to-datameet-243.json"
import sourceCrosswalkJson from "@/public/bengaluru-ward-crosswalk.json"
import { BBMP198_INDEX } from "./bbmp198-server"
import { gbaWardKey, indexGbaCrosswalk, type GbaCrosswalkArtifact, type LegacySourceWardRow } from "./gba-crosswalk"
import { gbaWardResult, type GbaWardIdentityRow, type WardRecordSources } from "./ward-record"

const IDENTITY = new Map((identityJson.wards as GbaWardIdentityRow[]).map(row => [gbaWardKey(row.corporation_id, row.ward_no), row]))
const GBA_CROSSWALK = gbaCrosswalkJson as GbaCrosswalkArtifact
const GBA_INDEX = indexGbaCrosswalk(GBA_CROSSWALK)
const SOURCE_ROWS = (sourceCrosswalkJson as { rows: LegacySourceWardRow[] }).rows

export const SERVER_WARD_SOURCES: WardRecordSources = {
  bbmp198Index: async () => BBMP198_INDEX,
  legacySourceRows: async () => SOURCE_ROWS,
}

/** A current GBA ward from its route segments, or null when there is no such ward. */
export function serverGbaWard(corporation: string, ward: string) {
  if (!/^\d{1,2}$/.test(corporation) || !/^\d{1,3}$/.test(ward)) return null
  const key = gbaWardKey(Number(corporation), Number(ward))
  return gbaWardResult(IDENTITY.get(key), GBA_INDEX.get(key), GBA_CROSSWALK.version)
}
