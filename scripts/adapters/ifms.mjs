#!/usr/bin/env node
// ifms.mjs — Ingest live work orders from BBMP IFMS PublicView.
// Usage: node scripts/adapters/ifms.mjs [--dry-run] [--ward <rid>] [--limit <N>]
// Env:   SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_MANAGEMENT_TOKEN
//
// The PublicView portal at accounts.bbmp.gov.in publishes every BBMP work
// bill the internal IFMS system processes — contractor code + name,
// division, budget head, start/end dates, order/SBR/BR references, and
// the current step in the 13-level approval chain. Citizens use this to
// see where any given work order is stuck in the payment pipeline.
//
// Flow:
//   1. GET /?l=1              → seed PHPSESSID + dgLanguage session
//   2. LoadCombo ward list    → all wards (legacy "o"/"oo" + new GBA)
//   3. For each new GBA ward: LoadPaymentGridData
//   4. Parse each row's jobcode + brdetails HTML blobs
//   5. Delete existing data_source='ifms_direct' rows, insert fresh batch

import { dbQuery, insertRows } from "../lib/db.mjs"

// BBMP's IFMS server ships an incomplete cert chain — leaf cert signed by
// GoDaddy G2 intermediate, but the intermediate itself is not served.
// Browsers fetch it from the AIA URL; Node's fetch does not. The fix is to
// add the intermediate to Node's trusted roots at startup via
// NODE_EXTRA_CA_CERTS — we ship the intermediate at scripts/adapters/ca/.
if (!process.env.NODE_EXTRA_CA_CERTS) {
  console.error("IFMS requires a CA bundle. Re-run with:")
  console.error("  NODE_EXTRA_CA_CERTS=scripts/adapters/ca/godaddy-g2.pem node scripts/adapters/ifms.mjs ...")
  process.exit(1)
}

const DRY_RUN = process.argv.includes("--dry-run")
const WARD_ARG = process.argv.includes("--ward")
  ? process.argv[process.argv.indexOf("--ward") + 1]
  : null
const LIMIT_ARG = process.argv.includes("--limit")
  ? parseInt(process.argv[process.argv.indexOf("--limit") + 1], 10)
  : null

const IFMS_BASE = "https://accounts.bbmp.gov.in/PublicView"
const HOME_URL = `${IFMS_BASE}/?l=1`
const DATA_URL = `${IFMS_BASE}/vss00CvStatusData.php`

const HEADERS_BASE = {
  "User-Agent": "Mozilla/5.0 (compatible; KaunBot/1.0; civic-transparency)",
  "Accept": "application/json, text/javascript, */*; q=0.01",
  "Referer": HOME_URL,
  "X-Requested-With": "XMLHttpRequest",
}

const MONTHS = { Jan:"01", Feb:"02", Mar:"03", Apr:"04", May:"05", Jun:"06",
                 Jul:"07", Aug:"08", Sep:"09", Oct:"10", Nov:"11", Dec:"12" }

function parseIfmsDate(s) {
  if (!s) return null
  const m = s.match(/(\d{1,2})-(\w{3})-(\d{4})/)
  if (!m) return null
  const mm = MONTHS[m[2]]
  if (!mm) return null
  return `${m[3]}-${mm}-${m[1].padStart(2, "0")}`
}

function between(haystack, startMarker, endChars = "<&") {
  const i = haystack.indexOf(startMarker)
  if (i < 0) return null
  const rest = haystack.slice(i + startMarker.length)
  const re = new RegExp(`[${endChars}]`)
  const m = rest.match(re)
  return (m ? rest.slice(0, m.index) : rest).trim() || null
}

function parseJobcode(jobcode) {
  if (!jobcode) return {}
  // Normalise HTML entities we actually use
  const h = jobcode.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
  return {
    start_date: parseIfmsDate(between(h, "Start :")),
    end_date: parseIfmsDate(between(h, "End :")),
    division: between(h, "Division :"),
    budget_head: between(h, "Budget :"),
    contractor_raw: between(h, "Contractor :"),
  }
}

function parseContractor(raw) {
  if (!raw) return { contractor_code: null, contractor_name: null }
  const m = raw.match(/^(\d{3,8})\s+(.+)$/)
  if (m) return { contractor_code: m[1], contractor_name: m[2].trim() }
  return { contractor_code: null, contractor_name: raw.trim() }
}

function parseBrDetails(brdetails) {
  if (!brdetails) return {}
  const h = brdetails.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
  // The brdetails blob looks like: "Order : X<br/>SBR : Y<br/>BR : Z<br/><br/>Payment : P"
  // Split on <br/> and look for labelled segments so "BR" doesn't collide with "SBR".
  const segments = h.split(/<br\s*\/?>/i).map(s => s.trim()).filter(Boolean)
  const grab = (label) => {
    const hit = segments.find(s => s.startsWith(label))
    if (!hit) return null
    return hit.slice(label.length).trim() || null
  }
  return {
    order_ref: grab("Order :"),
    sbr_ref: grab("SBR :"),
    bill_ref: grab("BR :"),
    payment_status: grab("Payment :"),
  }
}

function deriveFy(wcname) {
  // wcname like "001-26-000006" → FY ending in 2026 → "2025-26"
  const m = wcname?.match(/^\d+-(\d{2})-/)
  if (!m) return null
  const yy = parseInt(m[1], 10)
  const fullEnd = 2000 + yy
  return `${fullEnd - 1}-${String(yy).padStart(2, "0")}`
}

function parseWardNo(rname) {
  // rname examples: "001 Kempegowda", "o017 Shettihalli", "oo194 Gottigere"
  const m = rname.match(/^o*(\d+)\s/)
  return m ? parseInt(m[1], 10) : null
}

function isNewGbaWard(w) {
  if (w.rid === "300") return false           // "000 Common" bucket
  if (/^o+\d/i.test(w.rname)) return false    // legacy wards prefixed with one or more 'o's
  return true
}

async function handshake() {
  const res = await fetch(HOME_URL, { headers: { "User-Agent": HEADERS_BASE["User-Agent"] } })
  if (!res.ok) throw new Error(`Handshake failed: ${res.status}`)
  const setCookie = res.headers.get("set-cookie") ?? ""
  const phpMatch = setCookie.match(/PHPSESSID=([^;]+)/)
  if (!phpMatch) throw new Error("No PHPSESSID from handshake")
  await res.text() // drain body so session state sticks
  return `PHPSESSID=${phpMatch[1]}`
}

async function ifmsGet(path, cookie) {
  const res = await fetch(`${DATA_URL}?${path}`, {
    headers: { ...HEADERS_BASE, Cookie: cookie },
  })
  if (!res.ok) throw new Error(`${path.slice(0, 80)}: ${res.status}`)
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Non-JSON response for ${path.slice(0, 80)}: ${text.slice(0, 120)}`)
  }
}

async function fetchWardList(cookie) {
  const data = await ifmsGet("pAction=LoadCombo&pTableName=vssmasters.vss20toward", cookie)
  if (data.rError) throw new Error(`Ward list: ${data.rError}`)
  return data
}

async function fetchWardGrid(cookie, rid) {
  const params = new URLSearchParams({
    pAction: "LoadPaymentGridData",
    pCriteria: "", pDateFrom: "", pDateTo: "", pDateType: "",
    pOrderBy: "", pFinancialYearID: "", pBudgetHeadID: "", pDDOIDs: "",
    pWardIDs: rid, pDateFilterYN: "N", pWardID: rid,
  })
  const data = await ifmsGet(params.toString(), cookie)
  if (data?.rError) {
    console.warn(`  ward ${rid}: ${data.rError}`)
    return []
  }
  return Array.isArray(data) ? data : []
}

function rowToDb(row, wardNo, wardName) {
  const job = parseJobcode(row.jobcode)
  const { contractor_code, contractor_name } = parseContractor(job.contractor_raw)
  const br = parseBrDetails(row.brdetails)
  const amount = row.amount ? parseFloat(row.amount) : null
  return {
    work_order_id: row.wcname,
    ward_no: wardNo,
    description: (row.nameofwork ?? "").trim().substring(0, 500),
    contractor_name,
    contractor_code,
    contractor_phone: null,
    sanctioned_amount: amount,
    net_paid: null,
    deduction: null,
    fy: deriveFy(row.wcname),
    division: job.division,
    budget_head: job.budget_head,
    start_date: job.start_date,
    end_date: job.end_date,
    order_ref: br.order_ref,
    sbr_ref: br.sbr_ref,
    bill_ref: br.bill_ref,
    payment_status: br.payment_status,
    data_source: "ifms_direct",
    ifms_wbid: row.wbid ? parseInt(row.wbid, 10) : null,
    source_ward_name: wardName,
  }
}

async function ensureSchema() {
  if (DRY_RUN) return
  const cols = [
    ["contractor_code", "text"],
    ["division", "text"],
    ["budget_head", "text"],
    ["start_date", "date"],
    ["end_date", "date"],
    ["order_ref", "text"],
    ["sbr_ref", "text"],
    ["bill_ref", "text"],
    ["payment_status", "text"],
    ["data_source", "text"],
    ["ifms_wbid", "bigint"],
    ["source_ward_name", "text"],
  ]
  for (const [name, type] of cols) {
    try {
      await dbQuery(`ALTER TABLE bbmp_work_orders ADD COLUMN IF NOT EXISTS ${name} ${type};`)
    } catch (e) {
      console.warn(`  could not add column ${name} (${type}):`, e.message)
    }
  }
}

async function main() {
  const startedAt = new Date().toISOString()
  console.log(`[${startedAt}] IFMS refresh started${DRY_RUN ? " (dry-run)" : ""}${WARD_ARG ? ` ward=${WARD_ARG}` : ""}${LIMIT_ARG ? ` limit=${LIMIT_ARG}` : ""}`)

  await ensureSchema()

  const cookie = await handshake()
  console.log(`  session established`)

  const allWards = await fetchWardList(cookie)
  const targets = WARD_ARG
    ? allWards.filter(w => w.rid === WARD_ARG)
    : allWards.filter(isNewGbaWard)
  console.log(`  ${allWards.length} wards in IFMS, targeting ${targets.length}${WARD_ARG ? "" : " (new GBA only)"}`)

  let totalRows = 0, wardsWithData = 0, failed = 0
  const allRows = []

  const list = LIMIT_ARG ? targets.slice(0, LIMIT_ARG) : targets
  for (let i = 0; i < list.length; i++) {
    const w = list[i]
    const wardNo = parseWardNo(w.rname)
    try {
      const rows = await fetchWardGrid(cookie, w.rid)
      if (rows.length) {
        wardsWithData++
        for (const r of rows) {
          const dbRow = rowToDb(r, wardNo, w.rname)
          if (dbRow.work_order_id) allRows.push(dbRow)
        }
        totalRows += rows.length
      }
      if ((i + 1) % 20 === 0 || i === list.length - 1) {
        console.log(`  [${i + 1}/${list.length}] ${w.rname}: ${rows.length} rows (running total: ${totalRows})`)
      }
    } catch (e) {
      failed++
      console.warn(`  ${w.rname} FAILED: ${e.message}`)
    }
    await new Promise(r => setTimeout(r, 250))
  }

  console.log(`  Done scraping: ${allRows.length} rows kept from ${wardsWithData}/${list.length} wards (${failed} failures)`)

  if (DRY_RUN) {
    console.log("Dry-run sample row:")
    console.log(JSON.stringify(allRows[0] ?? {}, null, 2))
    return
  }

  // Guard against accidental wipeout: only proceed if we have real rows in
  // hand. A zero-row ingest most likely means the session broke — keep the
  // existing data rather than delete it.
  if (allRows.length === 0) {
    console.warn("Zero rows parsed — not touching bbmp_work_orders.")
    return
  }

  // `bbmp_work_orders` has no unique constraint on work_order_id, so an
  // ON CONFLICT upsert isn't possible. Delete-then-insert scoped to
  // data_source='ifms_direct' is clean, idempotent, and leaves the legacy
  // opencity-sourced rows alone.
  console.log(`  Deleting existing IFMS rows...`)
  await dbQuery("DELETE FROM bbmp_work_orders WHERE data_source = 'ifms_direct';")

  for (let i = 0; i < allRows.length; i += 200) {
    await insertRows("bbmp_work_orders", allRows.slice(i, i + 200))
  }
  console.log(`[${new Date().toISOString()}] Done. Inserted ${allRows.length} IFMS work orders.`)
}

main().catch(e => { console.error("Fatal:", e); process.exit(1) })
