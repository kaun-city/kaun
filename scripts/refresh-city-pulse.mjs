#!/usr/bin/env node
/**
 * refresh-city-pulse.mjs — Scrape Bengaluru civic news from RSS feeds,
 * classify by topic, and populate city_pulse_facts table.
 *
 * Sources:
 *   - Deccan Herald (Bengaluru section)
 *   - The News Minute (Karnataka)
 *   - Citizen Matters (Bengaluru)
 *   - India Today (Bengaluru)
 *
 * Run:    node scripts/refresh-city-pulse.mjs
 * Cron:   Run daily via Vercel cron or system crontab
 * Env:    SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_MANAGEMENT_TOKEN
 */

import { dbQuery, upsertRows } from "./lib/db.mjs"

const RSS_FEEDS = [
  { name: "Deccan Herald",  url: "https://www.deccanherald.com/bengaluru/rss" },
  { name: "The News Minute", url: "https://www.thenewsminute.com/rss/karnataka" },
  { name: "Citizen Matters", url: "https://citizenmatters.in/feed" },
  { name: "India Today BLR", url: "https://www.indiatoday.in/rss/cities/bengaluru" },
]

// Keywords that indicate civic accountability stories
const CIVIC_KEYWORDS = {
  "PUBLIC MONEY": [
    "bbmp scam", "bbmp fraud", "crore misuse", "crore irregularit", "siphon", "fake bill",
    "ghost worker", "pourakarmika scam", "embezzl", "misappropriat", "disproportionate asset",
    "lokayukta raid", "acb raid", "ed raid bbmp", "corruption bbmp", "gba scam", "gba fraud",
  ],
  "ROAD SAFETY": [
    "pothole death", "pothole accident", "road death bengaluru", "road accident bbmp",
    "pedestrian death", "pedestrian killed", "road fatality", "road crash bengaluru",
  ],
  "CONTRACTORS": [
    "kridl", "blacklisted contractor", "contractor scam", "tender scam", "4(g)",
    "without tender", "contractor fraud", "work order irregularit",
  ],
  "ENVIRONMENT": [
    "lake encroach", "lake pollut", "sewage lake", "untreated sewage", "lake dead fish",
    "bellandur", "varthur", "foam lake", "kspcb action", "ngt bengaluru",
    "tree fell", "tree cut illegal", "green cover",
  ],
  "BUDGET": [
    "bbmp budget unspent", "bbmp budget gap", "gba budget", "fund unutilized",
    "budget allocation bbmp", "fiscal deficit bbmp",
  ],
  "ELECTED REPS": [
    "mla criminal", "mla arrested", "corporator arrested", "mla assets",
    "mla attendance", "ward committee", "council meeting",
  ],
  "WATER": [
    "bwssb", "water shortage", "water crisis bengaluru", "cauvery water",
    "borewell dry", "water supply bengaluru", "water tanker mafia",
  ],
  "WASTE": [
    "garbage crisis", "waste management bbmp", "landfill", "solid waste",
    "garbage contractor", "waste processing", "black spot",
  ],
}

// Severity assignment
const RED_CATEGORIES = new Set(["PUBLIC MONEY", "ROAD SAFETY", "CONTRACTORS", "ELECTED REPS"])

/**
 * Parse RSS XML into items. Minimal parser — no dependency needed.
 */
function parseRss(xml) {
  const items = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let match
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]
    const title = block.match(/<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/)?.[1] || block.match(/<title>(.*?)<\/title>/)?.[1] || ""
    const desc = block.match(/<description><!\[CDATA\[(.*?)\]\]>|<description>(.*?)<\/description>/)?.[1] || ""
    const link = block.match(/<link>(.*?)<\/link>/)?.[1] || ""
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || ""
    items.push({
      title: title.replace(/<[^>]+>/g, "").trim(),
      description: desc.replace(/<[^>]+>/g, "").trim(),
      link: link.trim(),
      pubDate: pubDate.trim(),
    })
  }
  return items
}

/**
 * Classify an article into a civic category based on keyword matching.
 * Returns null if not civic-relevant.
 */
function classifyArticle(title, description) {
  const text = `${title} ${description}`.toLowerCase()
  let bestCategory = null
  let bestScore = 0

  for (const [category, keywords] of Object.entries(CIVIC_KEYWORDS)) {
    let score = 0
    for (const kw of keywords) {
      if (text.includes(kw.toLowerCase())) score++
    }
    if (score > bestScore) {
      bestScore = score
      bestCategory = category
    }
  }

  return bestScore > 0 ? bestCategory : null
}

/**
 * Extract the most important sentence from the title as a headline.
 * RSS titles are often already good headlines.
 */
function extractHeadline(title) {
  // Clean up common RSS title artifacts
  return title
    .replace(/\s*\|.*$/, "")     // Remove | Site Name suffix
    .replace(/\s*-\s*$/, "")     // Remove trailing dash
    .replace(/\s{2,}/g, " ")     // Collapse whitespace
    .trim()
    .substring(0, 200)
}

async function main() {
  console.log(`[${new Date().toISOString()}] City Pulse refresh started`)

  // Step 1: Create table if needed
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS city_pulse_facts (
      id          SERIAL PRIMARY KEY,
      city_id     TEXT NOT NULL DEFAULT 'bengaluru',
      category    TEXT NOT NULL,
      severity    TEXT NOT NULL DEFAULT 'yellow',
      headline    TEXT NOT NULL,
      detail      TEXT,
      source_name TEXT,
      source_url  TEXT,
      published_at TIMESTAMPTZ,
      expires_at  TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
      is_active   BOOLEAN DEFAULT TRUE,
      is_editorial BOOLEAN DEFAULT FALSE,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (headline, city_id)
    );
  `)
  console.log("Table city_pulse_facts ready.")

  // Step 2: Seed editorial baseline facts (always present, don't expire)
  const editorialFacts = [
    { category: "PUBLIC MONEY",  severity: "red",    headline: "Rs 934 Cr siphoned via 6,600 ghost sanitation workers over 10 years", source_name: "The News Minute", is_editorial: true },
    { category: "ROAD SAFETY",   severity: "red",    headline: "20 pothole deaths in 2023 — worst among 18 metro cities. Zero compensated.", source_name: "Deccan Herald", is_editorial: true },
    { category: "ELECTED REPS",  severity: "red",    headline: "55% of Karnataka MLAs face criminal charges. Avg assets: Rs 64 Cr.", source_name: "ADR / MyNeta", is_editorial: true },
    { category: "ENVIRONMENT",   severity: "yellow", headline: "172 of 187 Bengaluru lakes fail water quality. 550 MLD untreated sewage daily.", source_name: "CPCB", is_editorial: true },
    { category: "BUDGET",        severity: "yellow", headline: "Rs 2,154 Cr unspent in 2024-25. Education: only 43.7% spent.", source_name: "OpenCity / BBMP", is_editorial: true },
    { category: "PEDESTRIANS",   severity: "red",    headline: "292 pedestrian deaths in 2023 — highest among 53 Indian cities.", source_name: "NCRB", is_editorial: true },
  ]

  for (const fact of editorialFacts) {
    await upsertRows("city_pulse_facts", [{
      city_id: "bengaluru",
      category: fact.category,
      severity: fact.severity,
      headline: fact.headline,
      source_name: fact.source_name,
      is_editorial: true,
      is_active: true,
      expires_at: "2099-12-31T00:00:00Z",  // Never expire
    }], "headline,city_id").catch(() => {})  // Skip if already exists
  }
  console.log(`Seeded ${editorialFacts.length} editorial baseline facts`)

  // Step 3: Scrape RSS feeds
  let totalNew = 0
  for (const feed of RSS_FEEDS) {
    console.log(`\nScraping ${feed.name}...`)
    try {
      const res = await fetch(feed.url, {
        headers: {
          "User-Agent": "kaun-civic/1.0 (civic-transparency-project)",
          "Accept": "application/rss+xml, application/xml, text/xml",
        },
      })
      if (!res.ok) {
        console.log(`  ${feed.name}: HTTP ${res.status}, skipping`)
        continue
      }
      const xml = await res.text()
      const items = parseRss(xml)
      console.log(`  ${feed.name}: ${items.length} items`)

      let classified = 0
      for (const item of items) {
        const category = classifyArticle(item.title, item.description)
        if (!category) continue

        classified++
        const headline = extractHeadline(item.title)
        const severity = RED_CATEGORIES.has(category) ? "red" : "yellow"
        const pubDate = item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString()

        try {
          await upsertRows("city_pulse_facts", [{
            city_id: "bengaluru",
            category,
            severity,
            headline,
            detail: item.description?.substring(0, 500) || null,
            source_name: feed.name,
            source_url: item.link || null,
            published_at: pubDate,
            is_active: true,
            is_editorial: false,
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          }], "headline,city_id")
          totalNew++
        } catch {
          // Duplicate headline, skip
        }
      }
      console.log(`  Classified ${classified} civic articles`)

      // Rate limit between feeds
      await new Promise(r => setTimeout(r, 1000))
    } catch (e) {
      console.error(`  ${feed.name} FAILED:`, e.message)
    }
  }

  // Step 4: Deactivate expired facts
  await dbQuery(`
    UPDATE city_pulse_facts
    SET is_active = FALSE
    WHERE expires_at < NOW() AND is_editorial = FALSE;
  `)

  // Step 5: Summary
  const stats = await dbQuery(`
    SELECT
      COUNT(*) FILTER (WHERE is_active) as active,
      COUNT(*) FILTER (WHERE is_editorial) as editorial,
      COUNT(*) FILTER (WHERE NOT is_editorial AND is_active) as from_feeds,
      COUNT(DISTINCT category) FILTER (WHERE is_active) as categories
    FROM city_pulse_facts
    WHERE city_id = 'bengaluru';
  `)
  console.log(`\n${totalNew} new facts from feeds`)
  console.log("DB state:", stats[0])
  console.log(`[${new Date().toISOString()}] City Pulse refresh done.`)
}

main().catch(e => { console.error("Fatal:", e); process.exit(1) })
