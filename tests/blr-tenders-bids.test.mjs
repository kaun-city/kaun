/**
 * Vonter's blr-tenders-bids dataset (ODbL 1.0) loaded into procurement_tenders
 * and procurement_tender_winners. The fixture is five real rows from the
 * 2026-08-21 snapshot; its contact column is a placeholder.
 *
 * Run: node --test --experimental-strip-types tests/blr-tenders-bids.test.mjs
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  MIN_ROW_SHARE, TABLE_COLUMNS, dollarQuote, liveState, planLoad, readDataset, replaceRows, stageSql, swapSql, toRows,
} from "../scripts/adapters/blr-tenders-bids.mjs"

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
const fixture = () => {
  const buffer = readFileSync(new URL("./fixtures/blr-tenders-bids/sample.parquet", import.meta.url))
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

// ── Reading the dataset ─────────────────────────────────────

test("a KPPP award keeps its winner, award time and portal ids", async () => {
  const { generatedAt, rows } = await readDataset(fixture())
  assert.equal(generatedAt, "2026-08-21T16:32:42.350Z")
  assert.equal(rows.length, 5)
  assert.deepEqual(rows[0], {
    source: "kppp",
    tender_number: "BCCC/2026-27/EL/WORK_INDENT376",
    title: "Annual Electrical maintenance to Kallahalli Electrical Crematorium in ward no. 10 Under BCCC, POW 2026-27.",
    department: "Bengaluru Central City Corporation",
    category: "WORKS",
    status: "AWARDED",
    status_label: "Awarded",
    procurement_method: "OPEN",
    location: "BCCC Electrical Division",
    published_at: "2026-07-09T09:03:32.000Z",
    closes_at: "2026-07-17T09:30:00.000Z",
    awarded_at: "2026-08-13T07:17:10.000Z",
    estimated_value_inr: 1694376.7,
    award_amount_inr: null,
    awarded_bidders: ["S NAGARAJAPPA( SHREE GANAPATHI ENGINEERS )"],
    is_retendered: null,
    call_number: 1,
    notice_id: 312479,
    tender_id: 312434,
    dataset_generated_at: "2026-08-21T16:32:42.350Z",
  })
  for (const row of rows) assert.deepEqual(Object.keys(row), TABLE_COLUMNS, "every row has exactly the table's columns")
})

test("eProc award amounts are rupees to the paisa, and tenders without winners load too", async () => {
  const { rows } = await readDataset(fixture())
  const byNumber = Object.fromEntries(rows.map(row => [row.tender_number, row]))

  const award = byNumber["EE ELE S TEN 04 2023-24"]
  assert.equal(award.source, "eproc")
  assert.equal(award.award_amount_inr, 217883.5, "the dataset stores 217883.50000000003")
  assert.deepEqual(award.awarded_bidders, ["DEVI ELECTRICALS"])
  assert.equal(award.notice_id, null, "eProc has no KPPP ids")

  assert.deepEqual(byNumber["ELN/Central/PR/55/2023-24"].awarded_bidders, [])
  assert.equal(byNumber["BMTC/2026-27/SE1361/CALL-2"].is_retendered, true)
  assert.deepEqual(byNumber["BMTC/2025-26/IND0264"].awarded_bidders, [
    "Mohammed Abdul Qursheed( Sun International Trading )",
    "SANDIP RAJNIKANT MEHTA( Hengst Filtration Private Limited )",
  ], "several winners keep the dataset's order")

  const loaded = JSON.stringify(rows)
  assert.doesNotMatch(loaded, /0000000000/, "contact details are never loaded")
})

test("rows that would make an ambiguous load are refused", () => {
  const at = "2026-08-21T16:32:42.350Z"
  const row = { source: "kppp", tender_number: "BDA/2026-27/SE0001", awarded_bidders: [" A ", "A", ""] }
  assert.deepEqual(toRows([row], at)[0].awarded_bidders, ["A"], "names are trimmed, blanks dropped, repeats removed")
  assert.throws(() => toRows([row, { ...row }], at), /duplicate tender kppp BDA\/2026-27\/SE0001/)
  assert.throws(() => toRows([{ ...row, source: "cppp" }], at), /unknown source "cppp"/)
  assert.throws(() => toRows([{ ...row, tender_number: " " }], at), /has no tender_number/)
  assert.equal(toRows([{ ...row, tender_number: "BDA/1" }, { ...row, source: "eproc", tender_number: "BDA/1" }], at).length, 2,
    "the same number on both portals is two tenders")
})

// ── Deciding whether to load ────────────────────────────────

test("a snapshot loads only when it is newer and not much smaller", () => {
  const snapshot = (generatedAt, count) => ({ generatedAt, count })
  const aug = "2026-08-21T16:32:42.350Z"
  const sep = "2026-09-14T10:00:00.000Z"

  assert.equal(planLoad(snapshot(aug, 131551), { generatedAt: null, count: 0 }).load, true)
  assert.match(planLoad(snapshot(aug, 131551), snapshot(aug, 131551)).reason, /unchanged/)
  assert.equal(planLoad(snapshot(aug, 131551), snapshot(aug, 131551)).load, false)
  assert.equal(planLoad(snapshot(aug, 131551), snapshot(sep, 132003)).load, false, "never go back to an older snapshot")
  assert.equal(planLoad(snapshot(sep, 132003), snapshot(aug, 131551)).load, true)
  assert.equal(planLoad(snapshot(aug, 131552), snapshot(aug, 131551)).load, true, "same time, different rows: reload")

  const shrunk = Math.floor(131551 * MIN_ROW_SHARE) - 1
  assert.throws(() => planLoad(snapshot(sep, shrunk), snapshot(aug, 131551)), /fewer than 90%/)
  assert.equal(planLoad(snapshot(sep, shrunk), snapshot(aug, 131551), { force: true }).load, true)
  assert.equal(planLoad(snapshot(aug, 131551), snapshot(aug, 131551), { force: true }).load, true)
  assert.throws(() => planLoad(snapshot(sep, 0), { generatedAt: null, count: 0 }, { force: true }), /empty/)
})

test("the loaded snapshot is read back at millisecond precision, and a missing table stops the run", async () => {
  const state = await liveState(async sql => /to_regclass/.test(sql)
    ? [{ ready: true }]
    : [{ n: 131551, generated_epoch: 1787329962.350372 }])
  assert.deepEqual(state, { count: 131551, generatedAt: "2026-08-21T16:32:42.350Z" })
  assert.deepEqual(await liveState(async sql => /to_regclass/.test(sql) ? [{ ready: true }] : [{ n: 0, generated_epoch: null }]),
    { count: 0, generatedAt: null })
  await assert.rejects(liveState(async () => [{ ready: false }]), /apply migration 20260921_procurement_tenders\.sql/)
})

// ── Writing ─────────────────────────────────────────────────

test("staged rows are dollar-quoted and swapped in by one transaction", () => {
  assert.equal(dollarQuote("a $tenders$ b"), "$tendersx$a $tenders$ b$tendersx$")
  assert.match(stageSql([{ title: "it's" }]), /^INSERT INTO public\.procurement_tenders_staging \(row\) SELECT jsonb_array_elements\(\$tenders\$\[\{"title":"it's"\}\]\$tenders\$::jsonb\);$/)

  const sql = swapSql()
  assert.equal(sql.match(/BEGIN;/g).length, 1)
  assert.ok(sql.trim().endsWith("COMMIT;"))
  const winnersDeleted = sql.indexOf("DELETE FROM public.procurement_tender_winners;")
  assert.ok(winnersDeleted >= 0 && winnersDeleted < sql.indexOf("DELETE FROM public.procurement_tenders;"),
    "winners go first, so deleting tenders has nothing to cascade")
  for (const column of TABLE_COLUMNS) assert.ok(sql.includes(`r."${column}"`), `${column} is copied`)
  assert.match(sql, /lower\(regexp_replace\(w\.supplier_name, '\[\^\[:alnum:\]\]\+', '', 'g'\)\)/)
  assert.match(sql, /unnest\(t\.awarded_bidders\) WITH ORDINALITY AS w\(supplier_name, position\)/)
})

test("replaceRows swaps only after every row is staged, then checks both tables", async () => {
  const rows = Array.from({ length: 1201 }, (_, i) => ({ tender_number: `T${i}`, awarded_bidders: i % 3 ? [] : ["A", "B"] }))
  const winners = rows.reduce((sum, row) => sum + row.awarded_bidders.length, 0)

  const log = []
  const counts = { staging: rows.length, tenders: rows.length, winners }
  const query = async sql => {
    log.push(sql.startsWith("INSERT INTO public.procurement_tenders_staging") ? "stage" : sql.split("\n")[0])
    if (/count\(\*\).*procurement_tenders_staging/.test(sql)) return [{ n: counts.staging }]
    if (/count\(\*\).*procurement_tender_winners/.test(sql)) return [{ n: counts.winners }]
    if (/count\(\*\).*procurement_tenders;/.test(sql)) return [{ n: counts.tenders }]
    return []
  }
  const quiet = console.log
  console.log = () => {}
  try {
    await replaceRows(query, rows)
    assert.deepEqual(log, [
      "TRUNCATE public.procurement_tenders_staging;",
      "stage", "stage", "stage",
      "SELECT count(*)::int AS n FROM public.procurement_tenders_staging;",
      "BEGIN;",
      "SELECT count(*)::int AS n FROM public.procurement_tenders;",
      "SELECT count(*)::int AS n FROM public.procurement_tender_winners;",
      "TRUNCATE public.procurement_tenders_staging;",
    ])

    log.length = 0
    counts.staging = rows.length - 1
    await assert.rejects(replaceRows(query, rows), /staged 1200 of 1201 rows; the loaded snapshot is unchanged/)
    assert.ok(!log.includes("BEGIN;"), "a short staging never swaps")

    counts.staging = rows.length
    counts.winners = winners - 1
    await assert.rejects(replaceRows(query, rows), new RegExp(`expected 1201 tenders and ${winners} winners`))
  } finally {
    console.log = quiet
  }
})

// ── Schema, schedule and credit ─────────────────────────────

test("the migration's table matches the loader, is public-read only, and carries the licence", () => {
  const migration = read("supabase/migrations/20260921_procurement_tenders.sql")
  const table = migration.match(/CREATE TABLE IF NOT EXISTS public\.procurement_tenders \(([\s\S]*?)\n\);/)[1]
  const columns = table.split("\n").map(line => line.trim().match(/^([a-z_]+)\s/)?.[1]).filter(Boolean)
  assert.deepEqual(columns, TABLE_COLUMNS)
  assert.match(table, /PRIMARY KEY \(source, tender_number\)/)

  for (const name of ["procurement_tenders", "procurement_tender_winners", "procurement_tenders_staging"]) {
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${name} ENABLE ROW LEVEL SECURITY;`))
  }
  assert.match(migration, /REVOKE ALL ON public\.procurement_tenders, public\.procurement_tender_winners, public\.procurement_tenders_staging\s+FROM anon, authenticated;/)
  assert.match(migration, /GRANT SELECT ON public\.procurement_tenders, public\.procurement_tender_winners\s+TO anon, authenticated;/)
  assert.doesNotMatch(migration, /GRANT[^;]*procurement_tenders_staging/)
  assert.match(migration, /COMMENT ON TABLE public\.procurement_tenders IS\s+'[^']*Vonter[^']*Open Database License 1\.0/)
})

test("the weekly job applies on schedule, dry-runs by default by hand, and credits the source", () => {
  const workflow = read(".github/workflows/refresh-tenders-bids.yml")
  assert.match(workflow, /cron: '30 5 \* \* 0'/)
  assert.match(workflow, /default: dry-run/)
  assert.match(workflow, /github\.event\.inputs\.mode \|\| 'apply'/)
  assert.match(workflow, /npm ci --no-audit --no-fund --ignore-scripts/)
  for (const secret of ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "SUPABASE_MANAGEMENT_TOKEN"]) {
    assert.match(workflow, new RegExp(`${secret}: \\$\\{\\{ secrets\\.${secret} \\}\\}`))
  }
  const pkg = JSON.parse(read("package.json"))
  assert.ok(pkg.devDependencies.hyparquet && pkg.devDependencies["hyparquet-compressors"], "ZSTD Parquet needs both")

  const source = read("wiki/docs/bengaluru/sources/blr-tenders-bids.md")
  assert.match(source, /Open Database License/)
  assert.match(source, /github\.com\/Vonter\/blr-tenders-bids/)
  assert.match(read("wiki/mkdocs.yml"), /bengaluru\/sources\/blr-tenders-bids\.md/)
  assert.match(read("apps/web/app/data/page.tsx"), /Vonter\/blr-tenders-bids \(ODbL 1\.0\)/)
})
