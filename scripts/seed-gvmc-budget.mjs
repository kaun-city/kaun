#!/usr/bin/env node
/**
 * seed-gvmc-budget.mjs — Seed GVMC (Visakhapatnam) annual budget summary into city_budgets.
 *
 * Loads data/gvmc-budget-2024-25.json (or another --file) and upserts into a
 * city-agnostic `city_budgets` table (totals row) and `city_budget_heads`
 * (line-item rows). Designed to mirror BBMP's `budget_summary` RPC pattern so
 * downstream queries can be unified once the schema settles.
 *
 * Source: GVMC General Body resolution + Open Budgets India.
 *
 * Run:    node scripts/seed-gvmc-budget.mjs
 *         node scripts/seed-gvmc-budget.mjs --file=data/gvmc-budget-2024-25.json
 * Env:    SUPABASE_MANAGEMENT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join, isAbsolute } from "node:path"
import { dbQuery, upsertRows } from "./lib/db.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const fileArg = args.find(a => a.startsWith("--file="))?.split("=")[1]
  ?? "data/gvmc-budget-2024-25.json"
const filePath = isAbsolute(fileArg) ? fileArg : join(__dirname, "..", fileArg)

const payload = JSON.parse(readFileSync(filePath, "utf8"))
const { city_id: cityId, fy, totals, heads } = payload
if (!cityId || !fy || !totals || !Array.isArray(heads)) {
  console.error(`Budget JSON missing required fields. Got: city_id=${cityId} fy=${fy}`)
  process.exit(1)
}

console.log(`GVMC budget seed: city=${cityId} fy=${fy}, ${heads.length} line items`)

await dbQuery(`
  CREATE TABLE IF NOT EXISTS city_budgets (
    city_id        TEXT NOT NULL,
    fy             TEXT NOT NULL,
    receipts_cr    NUMERIC,
    payments_cr    NUMERIC,
    surplus_cr     NUMERIC,
    source         TEXT,
    updated_at     TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (city_id, fy)
  );
`)

await dbQuery(`
  CREATE TABLE IF NOT EXISTS city_budget_heads (
    city_id    TEXT NOT NULL,
    fy         TEXT NOT NULL,
    head       TEXT NOT NULL,
    type       TEXT NOT NULL CHECK (type IN ('receipt','payment')),
    amount_cr  NUMERIC NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (city_id, fy, head)
  );
`)

await upsertRows("city_budgets", [{
  city_id: cityId,
  fy,
  receipts_cr: totals.receipts_cr,
  payments_cr: totals.payments_cr,
  surplus_cr: totals.surplus_cr,
  source: payload._meta?.source ?? null,
  updated_at: new Date().toISOString(),
}], "city_id,fy")

const headRows = heads.map(h => ({
  city_id: cityId,
  fy,
  head: h.head,
  type: h.type,
  amount_cr: h.amount_cr,
  updated_at: new Date().toISOString(),
}))

for (let i = 0; i < headRows.length; i += 50) {
  await upsertRows("city_budget_heads", headRows.slice(i, i + 50), "city_id,fy,head")
}

console.log(`Upserted 1 totals row + ${headRows.length} head rows.`)

const check = await dbQuery(`
  SELECT type, ROUND(SUM(amount_cr)::numeric, 2) AS total_cr, COUNT(*) AS rows
  FROM city_budget_heads
  WHERE city_id = '${cityId}' AND fy = '${fy}'
  GROUP BY type
  ORDER BY type;
`)
console.log("Per-type totals:", check)
