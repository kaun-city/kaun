import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const maxDuration = 300 // 5 min — this is a heavy one-time operation

/**
 * GET /api/seed-contractors?secret=CRON_SECRET
 *
 * One-time endpoint to:
 * 1. Download BBMP 2024-25 work orders from opencity.in (all 243 wards)
 * 2. Extract contractor names + phone numbers
 * 3. Upsert into bbmp_work_orders with contractor_name and contractor_phone
 * 4. Build contractor_profiles via SQL aggregation
 *
 * Protected by CRON_SECRET. Run once then disable or delete.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const secret = url.searchParams.get("secret")
  const cronSecret = process.env.CRON_SECRET?.trim()
  if (!cronSecret) {
    return Response.json({ error: "CRON_SECRET env var is not set on this deployment" }, { status: 401 })
  }
  if (secret !== cronSecret) {
    return Response.json({ error: "Secret mismatch", hint: `Expected length: ${cronSecret.length}, received length: ${secret?.length ?? 0}` }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const log: string[] = []
  const addLog = (msg: string) => { log.push(msg); console.log(msg) }

  try {
    // Step 1: Ensure columns exist
    addLog("Ensuring contractor columns exist...")
    for (const col of ["contractor_raw", "contractor_name", "contractor_phone"]) {
      await supabase.rpc("exec_sql", {
        query: `ALTER TABLE bbmp_work_orders ADD COLUMN IF NOT EXISTS ${col} TEXT;`
      }).then(() => {})
    }

    // Step 2: Download 2024-25 work orders
    addLog("Downloading 2024-25 work orders from opencity.in...")
    const csvUrl = "https://data.opencity.in/dataset/4e539082-aca3-4df0-b676-dc1655cf17d2/resource/67637545-30aa-4a6c-80fa-b46bc22bdc24/download"
    const csvRes = await fetch(csvUrl, {
      headers: { "User-Agent": "kaun-civic/1.0 (civic-transparency-project)" },
    })
    if (!csvRes.ok) throw new Error(`CSV download failed: ${csvRes.status}`)
    const csvText = await csvRes.text()

    // Parse CSV
    const lines = csvText.trim().split("\n")
    const headers = parseRow(lines[0])
    const rows = lines.slice(1).map(line => {
      const values = parseRow(line)
      return Object.fromEntries(headers.map((h, i) => [h.trim(), (values[i] ?? "").trim()]))
    }).filter(row => Object.values(row).some(v => v))

    addLog(`Parsed ${rows.length} work order rows`)

    // Step 3: Normalize and upsert
    const PHONE_RE = /(\d{10})$/
    const seen = new Map<string, Record<string, unknown>>()

    for (const raw of rows) {
      const woId = raw["wo num"] || raw["Work Order Reference Number"] || raw.id?.toString() || ""
      const contractorRaw = raw.contractor || raw["Contractor Name & Phone"] || ""
      const desc = raw.wodetails || raw["Work Order Code & Description"] || ""
      const amount = parseFloat(raw.amount || raw.Amount || "0")
      const nett = parseFloat(raw.nett || raw.Nett || raw["Amount Paid"] || "0")
      const deduction = parseFloat(raw.deduction || raw.Deduction || raw.Balance || "0") || Math.max(0, amount - nett)

      // Extract phone
      let contractorName = contractorRaw.trim()
      let phone: string | null = null
      const phoneMatch = PHONE_RE.exec(contractorName)
      if (phoneMatch) {
        phone = phoneMatch[1]
        contractorName = contractorName.slice(0, -10).trim()
      }
      contractorName = contractorName.replace(/^\d{6}\s*/, "").replace(/^(M\/[Ss]\.?\s*|Sri\.?\s*|Smt\.?\s*)/, "").replace(/[.,/]+$/, "").trim()

      // Ward from WO number
      const woWardMatch = woId.match(/^(\d+)-/)
      const rawWard = raw.Ward || raw.ward || raw.ward_no || raw["ward no"]
      const wardNo = (woWardMatch ? parseInt(woWardMatch[1], 10) : null) || (rawWard ? parseInt(rawWard, 10) : null)

      if (!woId || !wardNo) continue
      const key = `${woId}|${wardNo}`
      seen.set(key, {
        work_order_id: woId.trim(),
        ward_no: wardNo,
        description: desc.substring(0, 1000),
        contractor: contractorRaw.substring(0, 500),
        contractor_raw: contractorRaw.substring(0, 500),
        contractor_name: contractorName.substring(0, 300) || null,
        contractor_phone: phone,
        sanctioned_amount: amount,
        net_paid: nett,
        deduction,
        fy: "2024-25",
        city_id: "bengaluru",
      })
    }

    const dbRows = Array.from(seen.values())
    addLog(`Deduped to ${dbRows.length} unique work orders`)

    // Batch upsert
    for (let i = 0; i < dbRows.length; i += 200) {
      const batch = dbRows.slice(i, i + 200)
      const { error } = await supabase.from("bbmp_work_orders").upsert(batch, { onConflict: "work_order_id,ward_no" })
      if (error) addLog(`Upsert batch ${i}: ${error.message}`)
    }
    addLog(`Upserted ${dbRows.length} work orders`)

    // Step 4: Build contractor profiles
    addLog("Building contractor profiles...")
    await supabase.rpc("exec_sql", {
      query: `
        CREATE TABLE IF NOT EXISTS contractor_profiles (
          id                SERIAL PRIMARY KEY,
          entity_id         TEXT UNIQUE NOT NULL,
          canonical_name    TEXT NOT NULL,
          aliases           TEXT[] DEFAULT '{}',
          phone             TEXT,
          total_contracts   INTEGER DEFAULT 0,
          total_value_lakh  NUMERIC DEFAULT 0,
          total_paid_lakh   NUMERIC DEFAULT 0,
          total_deduction_lakh NUMERIC DEFAULT 0,
          avg_deduction_pct NUMERIC DEFAULT 0,
          ward_count        INTEGER DEFAULT 0,
          wards             INTEGER[] DEFAULT '{}',
          first_seen        TEXT,
          last_seen         TEXT,
          is_govt_entity    BOOLEAN DEFAULT FALSE,
          blacklist_flags   TEXT[] DEFAULT '{}',
          city_id           TEXT DEFAULT 'bengaluru',
          updated_at        TIMESTAMPTZ DEFAULT NOW()
        );
      `
    }).then(() => {})

    // Aggregate profiles via SQL
    const { data: profiles } = await supabase.rpc("exec_sql", {
      query: `
        INSERT INTO contractor_profiles (entity_id, canonical_name, aliases, phone, total_contracts, total_value_lakh, total_paid_lakh, total_deduction_lakh, avg_deduction_pct, ward_count, wards, first_seen, last_seen, is_govt_entity, city_id, updated_at)
        SELECT
          COALESCE('ph_' || contractor_phone, 'nm_' || LOWER(TRIM(contractor_name))) as entity_id,
          MODE() WITHIN GROUP (ORDER BY contractor_name) as canonical_name,
          ARRAY_AGG(DISTINCT contractor_name) FILTER (WHERE contractor_name IS NOT NULL) as aliases,
          contractor_phone as phone,
          COUNT(*)::int as total_contracts,
          ROUND(SUM(sanctioned_amount)::numeric / 100000, 2) as total_value_lakh,
          ROUND(SUM(net_paid)::numeric / 100000, 2) as total_paid_lakh,
          ROUND(SUM(deduction)::numeric / 100000, 2) as total_deduction_lakh,
          ROUND(CASE WHEN SUM(sanctioned_amount) > 0 THEN (SUM(deduction) * 100.0 / SUM(sanctioned_amount))::numeric ELSE 0 END, 2) as avg_deduction_pct,
          COUNT(DISTINCT ward_no)::int as ward_count,
          ARRAY_AGG(DISTINCT ward_no) FILTER (WHERE ward_no IS NOT NULL) as wards,
          MIN(fy) as first_seen,
          MAX(fy) as last_seen,
          BOOL_OR(UPPER(contractor_name) LIKE '%KRIDL%' OR UPPER(contractor_name) LIKE '%KARNATAKA RURAL INFRASTRUCTURE%') as is_govt_entity,
          'bengaluru' as city_id,
          NOW() as updated_at
        FROM bbmp_work_orders
        WHERE contractor_name IS NOT NULL AND city_id = 'bengaluru'
        GROUP BY COALESCE('ph_' || contractor_phone, 'nm_' || LOWER(TRIM(contractor_name))), contractor_phone
        ON CONFLICT (entity_id) DO UPDATE SET
          canonical_name = EXCLUDED.canonical_name,
          aliases = EXCLUDED.aliases,
          total_contracts = EXCLUDED.total_contracts,
          total_value_lakh = EXCLUDED.total_value_lakh,
          total_paid_lakh = EXCLUDED.total_paid_lakh,
          total_deduction_lakh = EXCLUDED.total_deduction_lakh,
          avg_deduction_pct = EXCLUDED.avg_deduction_pct,
          ward_count = EXCLUDED.ward_count,
          wards = EXCLUDED.wards,
          first_seen = EXCLUDED.first_seen,
          last_seen = EXCLUDED.last_seen,
          is_govt_entity = EXCLUDED.is_govt_entity,
          updated_at = NOW();
      `
    })
    addLog("Contractor profiles built")

    // Step 5: Flag KRIDL (known blacklisted)
    const { error: flagErr } = await supabase
      .from("contractor_profiles")
      .update({
        blacklist_flags: ["BBMP blacklisted (2010) + Social Welfare Dept blacklisted (2018) — received Rs 4,700 crore via Section 4(g) tender exemption"]
      })
      .ilike("canonical_name", "%KRIDL%")
    if (!flagErr) addLog("Flagged KRIDL entities")

    // Also flag any Karnataka Rural Infrastructure variant
    await supabase
      .from("contractor_profiles")
      .update({
        blacklist_flags: ["BBMP blacklisted (2010) + Social Welfare Dept blacklisted (2018) — received Rs 4,700 crore via Section 4(g) tender exemption"]
      })
      .ilike("canonical_name", "%Karnataka Rural Infrastructure%")

    // Summary
    const { count: woCount } = await supabase.from("bbmp_work_orders").select("*", { count: "exact", head: true })
    const { count: cpCount } = await supabase.from("contractor_profiles").select("*", { count: "exact", head: true })
    const { count: flagCount } = await supabase.from("contractor_profiles").select("*", { count: "exact", head: true }).neq("blacklist_flags", "{}")

    addLog(`Done. Work orders: ${woCount}, Contractor profiles: ${cpCount}, Flagged: ${flagCount}`)

    return Response.json({ ok: true, work_orders: woCount, contractor_profiles: cpCount, flagged: flagCount, log })
  } catch (e) {
    addLog(`FATAL: ${e instanceof Error ? e.message : String(e)}`)
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e), log }, { status: 500 })
  }
}

function parseRow(line: string): string[] {
  const values: string[] = []
  let cur = ""
  let inQuote = false
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote }
    else if (ch === "," && !inQuote) { values.push(cur); cur = "" }
    else cur += ch
  }
  values.push(cur)
  return values
}
