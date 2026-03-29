#!/usr/bin/env node
/**
 * scrape-blacklists.mjs — Cross-reference contractor profiles against
 * every publicly accessible debarment/blacklist source.
 *
 * Sources scraped:
 *   1. GeM (Government e-Marketplace) suspended sellers archive PDF
 *   2. World Bank debarment list via OpenSanctions API
 *   3. CPPP (Central Public Procurement Portal) debarment list
 *   4. KPCL (Karnataka Power Corp) blacklisted firms page
 *   5. BBMP registered contractors list (for positive cross-ref)
 *
 * The script:
 *   - Downloads/parses each source
 *   - Fuzzy-matches against contractor_profiles by name
 *   - Flags matches in contractor_profiles.blacklist_flags[]
 *   - Generates a human-readable report of flagged contractors
 *
 * This is public interest civic accountability work.
 * All sources are government-published public records.
 *
 * Run:    node scripts/scrape-blacklists.mjs
 * Env:    SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_MANAGEMENT_TOKEN
 */

import { dbQuery, upsertRows, selectRows } from "./lib/db.mjs"

// ─── Fuzzy name matching ──────────────────────────────────────
function normalize(name) {
  if (!name) return ""
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "")
    .replace(/\b(M\/S|MR|MRS|SMT|SRI|SHRI|PVT|LTD|LIMITED|PRIVATE|INDIA|BANGALORE|BENGALURU)\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function nameDistance(a, b) {
  const na = normalize(a)
  const nb = normalize(b)
  if (!na || !nb) return 1

  // Exact normalized match
  if (na === nb) return 0

  // One contains the other
  if (na.includes(nb) || nb.includes(na)) return 0.1

  // Token overlap (Jaccard similarity)
  const tokensA = new Set(na.split(" ").filter(t => t.length > 2))
  const tokensB = new Set(nb.split(" ").filter(t => t.length > 2))
  if (tokensA.size === 0 || tokensB.size === 0) return 1
  const intersection = [...tokensA].filter(t => tokensB.has(t)).length
  const union = new Set([...tokensA, ...tokensB]).size
  const jaccard = intersection / union
  return 1 - jaccard
}

function findMatches(blacklistName, profiles, threshold = 0.4) {
  const matches = []
  for (const p of profiles) {
    const allNames = [p.canonical_name, ...(p.aliases || [])]
    for (const alias of allNames) {
      const dist = nameDistance(blacklistName, alias)
      if (dist <= threshold) {
        matches.push({ profile: p, alias, distance: dist })
        break
      }
    }
  }
  return matches
}

// ─── Source 1: GeM Suspended Sellers (PDF → text extraction) ──
async function scrapeGemSuspended() {
  console.log("\n── GeM Suspended Sellers ──")
  const pdfUrl = "https://assets-bg.gem.gov.in/resources/pdf/Sellers_Suspended_Archive_List.pdf"

  try {
    // Fetch the PDF and extract text (GeM also has an HTML page)
    // Try the HTML suspended sellers page first
    const htmlUrl = "https://gem.gov.in/suspendedSellers"
    const res = await fetch(htmlUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KaunBot/1.0; civic-transparency)" },
    })

    if (!res.ok) {
      console.log(`  GeM HTML page returned ${res.status}, trying PDF...`)
      // PDF parsing would require a library; for now, log and skip
      console.log(`  PDF at: ${pdfUrl}`)
      console.log(`  Manual download required for PDF parsing. Skipping automated extraction.`)
      return []
    }

    const html = await res.text()

    // Extract seller names from HTML table
    const sellers = []
    // GeM typically has a table with seller names and GST numbers
    const nameRe = /<td[^>]*>([^<]+)<\/td>/g
    let match
    while ((match = nameRe.exec(html)) !== null) {
      const text = match[1].trim()
      // Filter for likely company names (skip short strings, dates, etc.)
      if (text.length > 5 && !text.match(/^\d/) && !text.includes("@")) {
        sellers.push(text)
      }
    }

    console.log(`  Extracted ${sellers.length} potential seller names from GeM`)
    return sellers.map(name => ({ name, source: "GeM Suspended Sellers" }))
  } catch (e) {
    console.error(`  GeM scrape failed:`, e.message)
    return []
  }
}

// ─── Source 2: World Bank via OpenSanctions ───────────────────
async function scrapeWorldBank() {
  console.log("\n── World Bank Debarment (via OpenSanctions) ──")

  try {
    // OpenSanctions API — search for India-based debarred entities
    const url = "https://api.opensanctions.org/search/default?q=india&schema=LegalEntity&countries=in&limit=100"
    const res = await fetch(url, {
      headers: {
        "User-Agent": "kaun-civic/1.0 (civic-transparency-project)",
        "Accept": "application/json",
      },
    })

    if (!res.ok) {
      console.log(`  OpenSanctions API returned ${res.status}`)
      // Fallback: try direct World Bank search
      return await scrapeWorldBankDirect()
    }

    const data = await res.json()
    const entities = (data.results || []).map(r => ({
      name: r.caption || r.properties?.name?.[0] || "",
      source: `World Bank Debarment (${r.datasets?.join(", ") || "sanctions"})`,
    })).filter(e => e.name)

    console.log(`  Found ${entities.length} India-related sanctioned entities`)
    return entities
  } catch (e) {
    console.error(`  OpenSanctions failed:`, e.message)
    return await scrapeWorldBankDirect()
  }
}

async function scrapeWorldBankDirect() {
  console.log("  Trying World Bank direct...")
  try {
    const url = "https://www.worldbank.org/en/projects-operations/procurement/debarred-firms"
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KaunBot/1.0; civic-transparency)" },
    })
    if (!res.ok) return []
    const html = await res.text()
    // Extract firm names from the debarment table
    const firms = []
    const re = /India[^<]*<\/td>\s*<td[^>]*>([^<]+)/g
    let m
    while ((m = re.exec(html)) !== null) {
      firms.push({ name: m[1].trim(), source: "World Bank Debarment" })
    }
    console.log(`  Found ${firms.length} India-related debarred firms`)
    return firms
  } catch (e) {
    console.error(`  World Bank direct failed:`, e.message)
    return []
  }
}

// ─── Source 3: CPPP National Debarment List ──────────────────
async function scrapeCPPP() {
  console.log("\n── CPPP National Debarment List ──")

  try {
    const url = "https://eprocure.gov.in/eprocure/app?page=FrontEndDebarmentList&service=page"
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KaunBot/1.0; civic-transparency)" },
    })

    if (!res.ok) {
      console.log(`  CPPP returned ${res.status}`)
      return []
    }

    const html = await res.text()
    const firms = []

    // Extract from table rows — typically: org name, contractor name, debarment period
    const rowRe = /<tr[^>]*>\s*<td[^>]*>(\d+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)/g
    let m
    while ((m = rowRe.exec(html)) !== null) {
      const org = m[2].trim()
      const contractor = m[3].trim()
      if (contractor.length > 3) {
        firms.push({ name: contractor, source: `CPPP Debarment (by ${org})` })
      }
    }

    console.log(`  Found ${firms.length} debarred contractors from CPPP`)
    return firms
  } catch (e) {
    console.error(`  CPPP scrape failed:`, e.message)
    return []
  }
}

// ─── Source 4: KPCL Karnataka Blacklisted Firms ──────────────
async function scrapeKPCL() {
  console.log("\n── KPCL Blacklisted Firms ──")

  try {
    const url = "https://kpcl.karnataka.gov.in/info-4/Blacklisted+Firms/en"
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KaunBot/1.0; civic-transparency)" },
    })

    if (!res.ok) {
      console.log(`  KPCL returned ${res.status}`)
      return []
    }

    const html = await res.text()
    const firms = []

    // Extract firm names from the page content
    const tdRe = /<td[^>]*>([^<]+)<\/td>/g
    let m
    while ((m = tdRe.exec(html)) !== null) {
      const text = m[1].trim()
      if (text.length > 5 && !text.match(/^\d+$/) && !text.match(/^Sl/) && !text.includes("Period")) {
        firms.push({ name: text, source: "KPCL Blacklisted Firms (Karnataka)" })
      }
    }

    console.log(`  Found ${firms.length} blacklisted firms from KPCL`)
    return firms
  } catch (e) {
    console.error(`  KPCL scrape failed:`, e.message)
    return []
  }
}

// ─── Source 5: Known BBMP blacklisting cases (from reporting) ─
function getKnownBlacklisted() {
  // Documented cases from investigative reporting and RTI responses
  return [
    { name: "KRIDL", source: "BBMP blacklisted (twice) per BNP/RTI — continued to receive Rs 4,700 crore via Section 4(g) exemption" },
    { name: "Karnataka Rural Infrastructure Development Limited", source: "BBMP blacklisted (twice) — same as KRIDL" },
  ]
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  console.log(`[${new Date().toISOString()}] Blacklist cross-reference started`)

  // Load contractor profiles from DB
  let profiles = []
  try {
    profiles = await dbQuery(`
      SELECT entity_id, canonical_name, aliases, phone, total_value_lakh, ward_count
      FROM contractor_profiles
      WHERE city_id = 'bengaluru'
      ORDER BY total_value_lakh DESC;
    `)
    console.log(`Loaded ${profiles.length} contractor profiles from DB`)
  } catch (e) {
    console.error("Failed to load profiles:", e.message)
    console.log("Run seed-work-orders-full.mjs first to generate contractor profiles.")
    process.exit(1)
  }

  // Scrape all sources
  const allBlacklisted = [
    ...getKnownBlacklisted(),
    ...await scrapeGemSuspended(),
    ...await scrapeWorldBank(),
    ...await scrapeCPPP(),
    ...await scrapeKPCL(),
  ]

  console.log(`\n── Cross-referencing ${allBlacklisted.length} blacklisted entities against ${profiles.length} contractor profiles ──`)

  const flagged = new Map() // entity_id -> Set of flag strings

  for (const bl of allBlacklisted) {
    const matches = findMatches(bl.name, profiles)
    for (const match of matches) {
      const eid = match.profile.entity_id
      if (!flagged.has(eid)) flagged.set(eid, new Set())
      flagged.get(eid).add(bl.source)
    }
  }

  console.log(`\nFLAGGED: ${flagged.size} contractor profiles matched against blacklists`)

  // Update DB
  for (const [entityId, flags] of flagged) {
    const flagArr = [...flags]
    const profile = profiles.find(p => p.entity_id === entityId)
    console.log(`  ${profile?.canonical_name || entityId}: ${flagArr.join(" | ")}`)

    await dbQuery(`
      UPDATE contractor_profiles
      SET blacklist_flags = ARRAY[${flagArr.map(f => `'${f.replace(/'/g, "''")}'`).join(",")}],
          updated_at = NOW()
      WHERE entity_id = '${entityId.replace(/'/g, "''")}';
    `)
  }

  // Summary report
  console.log("\n═══════════════════════════════════════════════")
  console.log("CONTRACTOR ACCOUNTABILITY REPORT — BENGALURU")
  console.log("═══════════════════════════════════════════════")

  if (flagged.size === 0) {
    console.log("No matches found. This could mean:")
    console.log("  - Blacklisted entities operate under different names")
    console.log("  - The blacklist sources were not accessible")
    console.log("  - Contractor profiles need enrichment (more data)")
  } else {
    for (const [entityId, flags] of flagged) {
      const p = profiles.find(p => p.entity_id === entityId)
      if (!p) continue
      console.log(`\n  ${p.canonical_name}`)
      console.log(`  Total value: Rs ${p.total_value_lakh} lakh | Wards: ${p.ward_count} | Contracts: ${p.total_contracts || "?"}`)
      console.log(`  Blacklist flags:`)
      for (const f of flags) {
        console.log(`    ▸ ${f}`)
      }
    }
  }

  console.log(`\n[${new Date().toISOString()}] Blacklist cross-reference done.`)
}

main().catch(e => { console.error("Fatal:", e); process.exit(1) })
