/**
 * Build the GBA-369 ward identity table the server reads when it assembles a
 * ward card (app/api/ward). The browser takes these fields from the full
 * boundary layer; a route handler should not bundle 3.6 MB of geometry for
 * them, so this keeps only what the ward record is keyed on and derived from.
 *
 * Output is a pure function of the checked-in GBA layer, so re-running is
 * byte-stable. tests/ward-bundle.test.mjs fails if the two drift apart.
 *
 * Run: node scripts/wardmap/build-gba-ward-identity.mjs
 */
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "../..")
const LAYER_PATH = resolve(ROOT, "apps/web/public/bengaluru-gba-369.geojson")
const OUT_PATH = resolve(ROOT, "apps/web/lib/gba-ward-identity.json")

/**
 * The fields a ward record's data depends on: identity, the corporation (tenders,
 * contacts), the assembly constituency (reps, stats, tax, Sakala) and a point
 * inside the ward (the corporation office lookup).
 */
export const IDENTITY_FIELDS = [
  "corporation_id", "ward_no", "ward_name", "corporation", "assembly_constituency", "center_lat", "center_lng",
]

export function buildGbaWardIdentity(layer) {
  const wards = layer.features
    .map(feature => Object.fromEntries(IDENTITY_FIELDS.map(field => [field, feature.properties[field] ?? null])))
    .sort((a, b) => a.corporation_id - b.corporation_id || a.ward_no - b.ward_no)
  return {
    boundary_system: "gba-369-2025",
    source: layer.source,
    source_updated: layer.source_updated,
    wards,
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const layer = JSON.parse(readFileSync(LAYER_PATH, "utf8"))
  const identity = buildGbaWardIdentity(layer)
  // One ward per line: small, and a boundary update reads as a line diff.
  const { wards, ...meta } = identity
  const head = JSON.stringify(meta).slice(0, -1)
  writeFileSync(OUT_PATH, `${head},"wards":[\n${wards.map(ward => JSON.stringify(ward)).join(",\n")}\n]}\n`)
  console.log(`wrote ${identity.wards.length} wards to ${OUT_PATH}`)
}
