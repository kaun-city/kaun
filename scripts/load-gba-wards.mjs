#!/usr/bin/env node
/**
 * Load the checked-in final GBA ward layer used by pin_lookup enrichment.
 * Dry-run is the default; --apply requires SUPABASE_MANAGEMENT_TOKEN.
 */

import { readFile } from "node:fs/promises"

const APPLY = process.argv.includes("--apply")
const PROJECT_ID = "xgygxfyfsvccqqmtboeu"
const DATA_URL = new URL("../apps/web/public/bengaluru-gba-369.geojson", import.meta.url)
const TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN

const sqlText = value => value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`
const sqlNumber = value => Number.isFinite(value) ? String(value) : "NULL"

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS gba_wards (
  gba_corporation_id integer NOT NULL,
  gba_ward_no integer NOT NULL,
  gba_ward_name text NOT NULL,
  gba_ward_name_kn text,
  gba_corporation text NOT NULL,
  gba_ac text,
  gba_ac_no integer,
  gba_zone text,
  gba_zone_name text,
  gba_population integer,
  gba_division text,
  gba_subdivision text,
  source_url text NOT NULL,
  source_updated text NOT NULL,
  geom geometry(MultiPolygon, 4326) NOT NULL,
  PRIMARY KEY (gba_corporation_id, gba_ward_no)
);
CREATE INDEX IF NOT EXISTS gba_wards_geom_idx ON gba_wards USING gist (geom);
ALTER TABLE gba_wards ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON gba_wards TO anon, authenticated, service_role;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='gba_wards' AND policyname='gba_wards_public_read') THEN
    CREATE POLICY gba_wards_public_read ON gba_wards FOR SELECT USING (true);
  END IF;
END $$;
`.trim()

async function query(sql) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_ID}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  })
  if (!response.ok) throw new Error(`Database ${response.status}: ${(await response.text()).slice(0, 500)}`)
  return response.json()
}

function valuesRow(feature, collection) {
  const p = feature.properties
  return `(${[
    sqlNumber(p.corporation_id), sqlNumber(p.ward_no), sqlText(p.ward_name), sqlText(p.ward_name_kn),
    sqlText(p.corporation), sqlText(p.assembly_constituency), sqlNumber(p.assembly_no), sqlText(p.zone),
    sqlText(p.zone_name), sqlNumber(p.population), sqlText(p.division), sqlText(p.subdivision),
    sqlText(collection.source), sqlText(collection.source_updated),
    `ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${sqlText(JSON.stringify(feature.geometry))}), 4326))`,
  ].join(",")})`
}

function upsertSql(features, collection) {
  return `INSERT INTO gba_wards (
    gba_corporation_id, gba_ward_no, gba_ward_name, gba_ward_name_kn, gba_corporation,
    gba_ac, gba_ac_no, gba_zone, gba_zone_name, gba_population, gba_division,
    gba_subdivision, source_url, source_updated, geom
  ) VALUES ${features.map(f => valuesRow(f, collection)).join(",")}
  ON CONFLICT (gba_corporation_id, gba_ward_no) DO UPDATE SET
    gba_ward_name=EXCLUDED.gba_ward_name, gba_ward_name_kn=EXCLUDED.gba_ward_name_kn,
    gba_corporation=EXCLUDED.gba_corporation, gba_ac=EXCLUDED.gba_ac,
    gba_ac_no=EXCLUDED.gba_ac_no, gba_zone=EXCLUDED.gba_zone,
    gba_zone_name=EXCLUDED.gba_zone_name, gba_population=EXCLUDED.gba_population,
    gba_division=EXCLUDED.gba_division, gba_subdivision=EXCLUDED.gba_subdivision,
    source_url=EXCLUDED.source_url, source_updated=EXCLUDED.source_updated, geom=EXCLUDED.geom;`
}

async function main() {
  const collection = JSON.parse(await readFile(DATA_URL, "utf8"))
  const keys = new Set(collection.features.map(f => `${f.properties.corporation_id}:${f.properties.ward_no}`))
  const corporations = [...new Set(collection.features.map(f => f.properties.corporation))].sort()
  if (collection.features.length !== 369 || keys.size !== 369 || corporations.length !== 5) {
    throw new Error("Refusing to load: expected 369 unique wards across five corporations")
  }
  console.log(`Validated ${collection.features.length} wards across ${corporations.join(", ")}`)
  if (!APPLY) {
    console.log("Dry run complete. No database calls made; pass --apply in CI to write.")
    return
  }
  if (!TOKEN) throw new Error("SUPABASE_MANAGEMENT_TOKEN is required for --apply")

  await query(SCHEMA_SQL)
  for (let i = 0; i < collection.features.length; i += 20) {
    await query(upsertSql(collection.features.slice(i, i + 20), collection))
    console.log(`Loaded ${Math.min(i + 20, collection.features.length)}/${collection.features.length}`)
  }
  const result = await query("SELECT count(*)::int AS wards, count(DISTINCT gba_corporation_id)::int AS corporations FROM gba_wards;")
  console.log("Post-state:", JSON.stringify(result))
}

main().catch(error => { console.error(error); process.exit(1) })
