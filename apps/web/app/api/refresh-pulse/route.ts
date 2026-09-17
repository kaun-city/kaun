import { createClient } from "@supabase/supabase-js"
import { CRON_JOBS, recordCronRun, runSucceeded } from "@/lib/cron-runs"
import { dedupKey } from "@/lib/pulse-dedup"
import { buildPulseFact, parseRssItems } from "@/lib/pulse-ingest"

export const runtime = "nodejs"
export const maxDuration = 60

// Vercel Cron guard
function isAuthorized(req: Request): boolean {
  // Vercel strips x-vercel-cron from external requests; only its scheduler can set it
  if (req.headers.get("x-vercel-cron")) return true
  const cronSecret = process.env.CRON_SECRET?.trim()
  if (!cronSecret) return false
  const authHeader = req.headers.get("authorization") ?? ""
  if (authHeader === `Bearer ${cronSecret}`) return true
  if (req.headers.get("x-cron-secret") === cronSecret) return true
  return false
}

// ─── Feeds ──────────────────────────────────────────────────────
// `name` identifies the search in error logs only. What an item is labelled
// with (category, source_name) comes from @/lib/pulse-ingest, never from here.
const RSS_FEEDS = [
  { name: "Google News BBMP",  url: "https://news.google.com/rss/search?q=BBMP+bengaluru+when:7d&hl=en-IN&gl=IN&ceid=IN:en" },
  { name: "Google News BDA",   url: "https://news.google.com/rss/search?q=BDA+bengaluru+when:7d&hl=en-IN&gl=IN&ceid=IN:en" },
  { name: "Google News BWSSB", url: "https://news.google.com/rss/search?q=BWSSB+bengaluru+when:7d&hl=en-IN&gl=IN&ceid=IN:en" },
  { name: "The News Minute",   url: "https://www.thenewsminute.com/feed" },
  { name: "Citizen Matters",   url: "https://citizenmatters.in/feed" },
  // Twitter/X civic signals via Google News RSS
  { name: "X search BBMP",     url: "https://news.google.com/rss/search?q=site:x.com+BBMP+Bengaluru+when:7d&hl=en-IN&gl=IN&ceid=IN:en" },
  { name: "X search pothole",  url: "https://news.google.com/rss/search?q=site:x.com+pothole+Bengaluru+when:7d&hl=en-IN&gl=IN&ceid=IN:en" },
  { name: "X search BWSSB",    url: "https://news.google.com/rss/search?q=site:x.com+BWSSB+water+when:7d&hl=en-IN&gl=IN&ceid=IN:en" },
  { name: "X search BESCOM",   url: "https://news.google.com/rss/search?q=site:x.com+BESCOM+power+cut+when:7d&hl=en-IN&gl=IN&ceid=IN:en" },
]

// dedup_key normalization is the shared single source of truth
// (apps/web/lib/pulse-dedup.mjs) — identical to what the migration
// backfilled and what UNIQUE (dedup_key, city_id) enforces.

// ─── Handler ────────────────────────────────────────────────────
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  let totalNew = 0
  let skipped = 0
  let writesTried = 0
  let writeErrors = 0
  const errors: string[] = []

  // Seed the in-run dedup set from existing rows. The DB UNIQUE
  // (dedup_key, city_id) is the real guarantee; this just avoids
  // pointless upsert round-trips. dedup_key is preferred; fall back to
  // recomputing for any row left null during the deploy gap.
  const { data: existing } = await supabase
    .from("city_pulse_facts")
    .select("headline,dedup_key")
  const seenKeys = new Set(
    (existing ?? []).map(f => f.dedup_key ?? dedupKey(f.headline)),
  )

  for (const feed of RSS_FEEDS) {
    try {
      const res = await fetch(feed.url, {
        headers: { "User-Agent": "kaun-civic/1.0 (civic-transparency-project)" },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) { errors.push(`${feed.name}: HTTP ${res.status}`); continue }

      const xml = await res.text()
      const items = parseRssItems(xml)

      for (const item of items) {
        const built = buildPulseFact(item)
        if (built.skip === "not-civic") continue
        // No link, or too short to be more than an account name
        if (built.skip) { skipped++; continue }
        const { fact } = built

        // Skip if a syndicated variant of this story already exists
        const key = dedupKey(fact.headline)
        if (seenKeys.has(key)) { skipped++; continue }
        seenKeys.add(key)

        const published = new Date(item.pubDate)

        const { error } = await supabase.from("city_pulse_facts").upsert({
          city_id: "bengaluru",
          ...fact,
          dedup_key: key,
          published_at: (Number.isNaN(published.getTime()) ? new Date() : published).toISOString(),
          is_active: true,
          is_editorial: false,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }, { onConflict: "dedup_key,city_id", ignoreDuplicates: true })

        writesTried++
        if (error) writeErrors++
        else totalNew++
      }
    } catch (e) {
      errors.push(`${feed.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Deactivate expired
  await supabase
    .from("city_pulse_facts")
    .update({ is_active: false })
    .lt("expires_at", new Date().toISOString())
    .eq("is_editorial", false)

  // errors holds one entry per feed that could not be read or parsed.
  const succeeded = runSucceeded([
    { tried: RSS_FEEDS.length, failed: errors.length },
    { tried: writesTried, failed: writeErrors },
  ])
  await recordCronRun(supabase, CRON_JOBS.refreshPulse, succeeded, {
    new_facts: totalNew, skipped, write_errors: writeErrors, feed_errors: errors,
  })

  return Response.json({ ok: true, succeeded, new_facts: totalNew, skipped, write_errors: writeErrors, errors })
}
