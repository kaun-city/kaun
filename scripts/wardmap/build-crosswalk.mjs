/**
 * build-crosswalk.mjs  —  Canonical Kaun Ward Crosswalk builder. READ-ONLY
 * w.r.t. Supabase (writes only a versioned artifact + methodology to the repo).
 *
 * THE PUBLIC GOOD
 * ---------------
 * No public source today maps BBMP's 2023 *Final* 225-ward delimitation (the
 * numbering BBMP/IFMS tags work orders with) to the KGIS/DataMeet 243-ward set
 * (what the kaun.city map and `wards` table render). Kaun derives and publishes
 * it: deterministically, from official polygons, versioned, sourced, correctable.
 *
 * METHOD (deterministic, geometry-based — no name fuzzing)
 *   - BBMP-Final-225 polygons + attrs: opencity "BBMP Final Wards Map - 2023"
 *     KML (id, name_en, name_ka, AC, population). Numbering verified to match
 *     bbmp_work_orders.ward_no exactly (1=Kempegowda … 5=Kogilu … 9=Hebbal
 *     Kempapura).
 *   - DataMeet-243 polygons: the exact GeoJSON the map renders (KGISWardNo).
 *   - For each 225 ward: sample its interior, classify each point by the 243
 *     ward polygon that contains it. Largest share = primary match; the full
 *     share vector captures splits (one 225 ward across several 243 wards).
 *
 * OUTPUT (committed — this is the deliverable, NOT gitignored)
 *   data/ward-crosswalk/bbmp2023_225_to_datameet_243.csv
 *   data/ward-crosswalk/bbmp2023_225_to_datameet_243.json
 *   data/ward-crosswalk/METHODOLOGY.md
 *
 * Run: node scripts/wardmap/build-crosswalk.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, resolve } from "path"

const CROSSWALK_VERSION = "2023f-2026.05"   // bump on any curated correction
const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA = resolve(__dirname, "../../data/ward-crosswalk")
// Public download copies the data.kaun.city wiki links point to. Regenerated
// by this builder every run so they can never drift from the canonical file.
const WIKI_PUB = resolve(__dirname, "../../wiki/docs/bengaluru/ward-crosswalk")
mkdirSync(DATA, { recursive: true })

const KML_URL =
  "https://data.opencity.in/dataset/7b492849-a5cb-439b-89e9-e03522055e6a/resource/7857d752-dda4-4e5e-b9e6-53146372f86b/download/b272c5b2-3e66-4b0f-a59f-35ec7b4caa1e.kml"
const BBMP_GEOJSON =
  "https://raw.githubusercontent.com/datameet/Municipal_Spatial_Data/master/Bangalore/BBMP.geojson"

// ---- geometry: self-contained ray-casting PIP (validated on GBA crosswalk) --
function ringContains(ring, x, y) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) inside = !inside
  }
  return inside
}
const polyContains = (poly, x, y) =>
  ringContains(poly[0], x, y) && !poly.slice(1).some(h => ringContains(h, x, y))
function geomContains(g, x, y) {
  if (g.type === "Polygon") return polyContains(g.coordinates, x, y)
  return g.coordinates.some(p => polyContains(p, x, y))   // MultiPolygon
}
function geomBbox(g) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates
  for (const p of polys) for (const [x, y] of p[0]) {
    if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y
  }
  return [a, b, c, d]
}

// ---- KML parser: Placemark -> {attrs, geom(MultiPolygon)} ----------------
function parseKml(kml) {
  const out = []
  for (const pm of kml.split("<Placemark").slice(1)) {
    const attr = n => {
      const m = pm.match(new RegExp(`name="${n}">([^<]*)<`))
      return m ? m[1].trim() : ""
    }
    const polys = []
    for (const pol of pm.split("<Polygon").slice(1)) {
      const outer = pol.match(/<outerBoundaryIs>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/)
      if (!outer) continue
      const ring = txt => txt.trim().split(/\s+/).map(t => {
        const [lng, lat] = t.split(",").map(Number)
        return [lng, lat]
      }).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]))
      const rings = [ring(outer[1])]
      for (const inn of pol.matchAll(/<innerBoundaryIs>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/g))
        rings.push(ring(inn[1]))
      if (rings[0].length >= 4) polys.push(rings)
    }
    if (!polys.length) continue
    out.push({
      id: parseInt(attr("id"), 10),
      name_en: attr("name_en"),
      name_ka: attr("name_ka"),
      ac: attr("assembly_constituency_name_en").replace(/^\d+-/, ""),
      ac_id: parseInt(attr("assembly_constituency_id"), 10) || null,
      population: parseInt(attr("population"), 10) || null,
      geom: { type: "MultiPolygon", coordinates: polys },
    })
  }
  return out
}

const csv = rows => rows.map(r => r.map(c => {
  const s = c == null ? "" : String(c)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}).join(",")).join("\n")

async function main() {
  console.log("1/4  fetching BBMP-Final-225 KML + DataMeet-243 GeoJSON…")
  const [kmlTxt, geo] = await Promise.all([
    fetch(KML_URL).then(r => r.text()),
    fetch(BBMP_GEOJSON).then(r => r.json()),
  ])
  const w225 = parseKml(kmlTxt)
  const dm243 = geo.features.map(f => ({
    no: parseInt(f.properties.KGISWardNo, 10),
    name: f.properties.KGISWardName,
    lgd: f.properties.LGD_WardCode,
    geom: f.geometry, bbox: geomBbox(f.geometry),
  }))
  console.log(`     ${w225.length} BBMP-Final-225 wards · ${dm243.length} DataMeet-243 wards`)
  if (w225.length !== 225) console.warn(`     ⚠ expected 225 KML wards, got ${w225.length}`)

  console.log("2/4  deterministic spatial overlap (225 → 243)…")
  // tier: clean 1:1 (>=0.7) · split-with-clear-primary (0.5-0.7) · true-split (<0.5)
  const rows = []
  let clean = 0, primary = 0, tie = 0
  for (const w of w225.sort((a, b) => a.id - b.id)) {
    const [mnX, mnY, mxX, mxY] = geomBbox(w.geom)
    const steps = 18, dx = (mxX - mnX) / steps, dy = (mxY - mnY) / steps
    const hits = {}; let inside = 0, outside = 0
    for (let i = 0; i <= steps; i++) for (let j = 0; j <= steps; j++) {
      const x = mnX + (i + .5) * dx, y = mnY + (j + .5) * dy
      if (!geomContains(w.geom, x, y)) continue
      inside++
      let mt = null
      for (const d of dm243) {
        if (x < d.bbox[0] || x > d.bbox[2] || y < d.bbox[1] || y > d.bbox[3]) continue
        if (geomContains(d.geom, x, y)) { mt = d.no; break }
      }
      if (mt == null) outside++; else hits[mt] = (hits[mt] || 0) + 1
    }
    const ranked = Object.entries(hits).map(([k, v]) => [+k, v]).sort((a, b) => b[1] - a[1])
    const top = ranked[0], second = ranked[1]
    const conf = top && inside ? +(top[1] / inside).toFixed(3) : 0
    const dm = top ? dm243.find(d => d.no === top[0]) : null
    const tier = conf >= 0.7 ? "clean" : conf >= 0.5 ? "split-primary" : "true-split"
    if (tier === "clean") clean++; else if (tier === "split-primary") primary++; else tie++
    // FULL area-share vector — every overlapped 243 ward, no truncation.
    // `shares` is the machine-readable form (for proportional consumers);
    // `split` is the same data as a compact string for the CSV.
    const shares = ranked.map(([n, c]) => ({
      datameet243_no: n, share: +(c / (inside || 1)).toFixed(4),
    }))
    rows.push({
      bbmp225_no: w.id, bbmp225_name_en: w.name_en, bbmp225_name_ka: w.name_ka,
      assembly_constituency: w.ac, population: w.population,
      datameet243_no: dm ? dm.no : null,
      datameet243_name: dm ? dm.name : null,
      lgd_ward_code: dm ? dm.lgd : null,
      overlap_confidence: conf,
      tier,
      runner_up_243_no: second ? second[0] : null,
      runner_up_share: second && inside ? +(second[1] / inside).toFixed(4) : 0,
      outside_share: inside ? +(outside / inside).toFixed(4) : 1,
      split: shares.map(s => `${s.datameet243_no}:${s.share}`).join(" "),
      shares,
      samples: inside,
      method: "spatial-overlap",
    })
  }
  console.log(`     ${rows.length} mapped · clean 1:1 ${clean} · split-with-primary ${primary} · true-split ${tie}`)

  console.log("3/4  writing canonical artifact…")
  // Explicit CSV columns (the array `shares` is JSON-only; `split` carries the
  // full vector in the CSV).
  const header = [
    "bbmp225_no", "bbmp225_name_en", "bbmp225_name_ka", "assembly_constituency",
    "population", "datameet243_no", "datameet243_name", "lgd_ward_code",
    "overlap_confidence", "tier", "runner_up_243_no", "runner_up_share",
    "outside_share", "split", "samples", "method",
  ]
  const csvText = csv([header, ...rows.map(r => header.map(h => r[h]))])
  const jsonText = JSON.stringify({
      crosswalk: "bbmp2023-final-225 → datameet-243",
      version: CROSSWALK_VERSION,
      generated_at: new Date().toISOString(),
      method: "deterministic spatial interior-point overlap (no name matching)",
      sources: {
        bbmp_225: "opencity.in — BBMP Final Wards Map 2023 (KML), id/name/AC/population",
        datameet_243: "DataMeet Municipal_Spatial_Data Bangalore/BBMP.geojson (KGISWardNo)",
      },
      tiers: { clean, split_primary: primary, true_split: tie },
      caveats: [
        "BBMP-Final-225 and DataMeet-243 are DIFFERENT delimitations. A 225 ward often spans 2+ 243 wards — this is expected, not an error.",
        "FULL area-share vector: every overlapped 243 ward is listed in `shares` (machine-readable) and `split` (compact string) — no truncation. `outside_share` is the fraction in no 243 ward; shares + outside_share sum to ~1.",
        "tier=clean: ≥70% of the 225 ward sits in one 243 ward. tier=split-primary: 50–70% (clear primary). tier=true-split: <50% (no dominant 243 ward — consumer must choose a policy; use `shares` for proportional).",
        "Corrections: open an issue at github.com/kaun-city/kaun (label: ward-crosswalk).",
      ],
      rows,
    }, null, 1)

  // Overlap-inclusive pairs: one row per (225 ward → 243 ward) where the
  // overlap share ≥ PAIR_MIN_SHARE, PLUS the primary (max-overlap) pair
  // always, so nothing regresses vs. winner-take-all. This is what
  // populates the ~107 otherwise-empty 243 wards: a work order surfaces in
  // every 243 ward its 225 ward materially overlaps. is_primary marks the
  // max-overlap target (== datameet243_no / bbmp_ward_no).
  const PAIR_MIN_SHARE = 0.10
  const pairs = []
  for (const r of rows) {
    const prim = r.datameet243_no
    for (const s of r.shares) {
      if (s.share >= PAIR_MIN_SHARE || s.datameet243_no === prim) {
        pairs.push({
          bbmp225_no: r.bbmp225_no,
          datameet243_no: s.datameet243_no,
          share: s.share,
          is_primary: s.datameet243_no === prim,
        })
      }
    }
  }
  const pairHdr = ["bbmp225_no", "datameet243_no", "share", "is_primary"]
  const pairsCsv = csv([pairHdr, ...pairs.map(p => pairHdr.map(h => p[h]))])
  const pairsJson = JSON.stringify({
    crosswalk: "ward_crosswalk_pairs (overlap-inclusive)",
    version: CROSSWALK_VERSION,
    min_share: PAIR_MIN_SHARE,
    note: "One row per 225→243 overlap ≥ min_share, plus the primary pair always. is_primary = max-overlap (== bbmp_ward_no).",
    pairs,
  }, null, 1)

  // Canonical artifact + the public download copies the wiki links to are
  // written by THIS builder in one run, so a correction can never leave the
  // published files stale. Do not hand-edit the wiki copies.
  for (const dir of [DATA, WIKI_PUB]) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(resolve(dir, "bbmp2023_225_to_datameet_243.csv"), csvText)
    writeFileSync(resolve(dir, "bbmp2023_225_to_datameet_243.json"), jsonText)
    writeFileSync(resolve(dir, "ward_crosswalk_pairs.csv"), pairsCsv)
    writeFileSync(resolve(dir, "ward_crosswalk_pairs.json"), pairsJson)
  }
  const distinct243 = new Set(pairs.map(p => p.datameet243_no)).size
  console.log(`     pairs: ${pairs.length} (225→243, ≥${PAIR_MIN_SHARE} ∪ primary) covering ${distinct243} distinct 243 wards`)

  console.log("4/4  writing METHODOLOGY.md…")
  writeFileSync(resolve(DATA, "METHODOLOGY.md"), `# Kaun Ward Crosswalk — BBMP-Final-2023 (225) ↔ DataMeet (243)

**Version \`${CROSSWALK_VERSION}\` · generated ${new Date().toISOString().slice(0, 10)} · ${rows.length} wards · ${clean} clean 1:1 · ${primary} split-with-primary · ${tie} true-split**

## Why this exists
BBMP/IFMS tag every work order, payment and tender with the **2023 *Final*
225-ward** number. The kaun.city map, \`wards\` table and wiki render the
**KGIS/DataMeet 243-ward** set. They are *different delimitations* with
*different numbering* — so civic spending was being shown under the wrong ward.
No public source maps one to the other. Kaun derives and maintains it.

## Sources (authoritative, cited)
| Set | Source | Carries |
|---|---|---|
| BBMP-Final-225 | opencity.in — *BBMP Final Wards Map 2023* (KML) | id, English/Kannada name, Assembly Constituency, population, polygon |
| DataMeet-243 | DataMeet \`Municipal_Spatial_Data/Bangalore/BBMP.geojson\` | KGISWardNo, KGISWardName, LGD ward code, polygon |

Numbering of the 225 KML was verified to match \`bbmp_work_orders.ward_no\`
exactly (1 Kempegowda · 3 Atturu · 5 Kogilu · 8 Amrutahalli · 9 Hebbal
Kempapura …).

## Method
Deterministic, geometry-based — **no name matching**. For each 225 ward we
sample its interior on an 18×18 grid and classify each interior point by the
243 ward polygon that contains it. The 243 ward holding the largest share is
the primary match. \`overlap_confidence\` is the primary share;
\`outside_share\` is the fraction outside all 243 polygons.

**Full split vector — no truncation.** Every overlapped 243 ward is recorded:
\`shares\` (JSON, machine-readable array of \`{datameet243_no, share}\`) and
\`split\` (the same data as a compact \`no:share\` string in the CSV). \`shares\`
sum + \`outside_share\` ≈ 1, so proportional consumers have the complete
distribution.

## Tiers (a split is expected, not an error)
225 and 243 are different boundary sets, so many 225 wards legitimately span
several 243 wards.
- **clean** (${clean}) — ≥70% of the 225 ward lies in one 243 ward → safe 1:1.
- **split-primary** (${primary}) — 50–70% in the top 243 ward; clear primary, full remainder in \`shares\`/\`split\`.
- **true-split** (${tie}) — <50% in any single 243 ward; no dominant target. Consumers pick a policy: Kaun uses **max-overlap assignment** for display and keeps \`shares\` for proportional use.

## Corrections
This is a living dataset. To report an error: open an issue at
\`github.com/kaun-city/kaun\` with label \`ward-crosswalk\`, citing the ward
numbers and your source. Accepted corrections bump \`version\` and are logged
in this file's history.

## Files (all regenerated by \`scripts/wardmap/build-crosswalk.mjs\`)
- \`data/ward-crosswalk/bbmp2023_225_to_datameet_243.csv\` — flat table
- \`data/ward-crosswalk/bbmp2023_225_to_datameet_243.json\` — + \`shares\` + provenance/caveats
- \`data/ward-crosswalk/METHODOLOGY.md\` — this file
- \`wiki/docs/bengaluru/ward-crosswalk/*.{csv,json}\` — public download copies,
  **auto-written by the builder; never hand-edit** (kept in lockstep so a
  correction can't leave the published files stale).
`)

  console.log("\n=== DONE ===")
  console.log(`Canonical crosswalk: ${rows.length} wards · clean ${clean} · split-primary ${primary} · true-split ${tie}`)
  console.log(`Artifact → data/ward-crosswalk/  (version ${CROSSWALK_VERSION})`)
}
main().catch(e => { console.error("FAILED:", e); process.exit(1) })
