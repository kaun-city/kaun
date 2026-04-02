import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const maxDuration = 60

// Vercel Cron guard
function isAuthorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim()
  const authHeader = req.headers.get("authorization") ?? ""
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true
  if (cronSecret && req.headers.get("x-cron-secret") === cronSecret) return true
  if (req.headers.get("x-vercel-cron")) return true
  return false
}

// ─── RSS parsing ────────────────────────────────────────────────
const RSS_FEEDS = [
  { name: "Deccan Herald",   url: "https://www.deccanherald.com/bengaluru/rss" },
  { name: "The News Minute", url: "https://www.thenewsminute.com/rss/karnataka" },
  { name: "Citizen Matters",  url: "https://citizenmatters.in/feed" },
  { name: "India Today BLR",  url: "https://www.indiatoday.in/rss/cities/bengaluru" },
]

const CIVIC_KEYWORDS: Record<string, string[]> = {
  "PUBLIC MONEY": ["bbmp scam", "bbmp fraud", "crore misuse", "crore irregularit", "siphon", "fake bill", "ghost worker", "pourakarmika scam", "embezzl", "misappropriat", "lokayukta raid", "acb raid", "ed raid bbmp", "corruption bbmp", "gba scam"],
  "ROAD SAFETY": ["pothole death", "pothole accident", "road death bengaluru", "road accident bbmp", "pedestrian death", "pedestrian killed", "road fatality", "road crash bengaluru"],
  "CONTRACTORS": ["kridl", "blacklisted contractor", "contractor scam", "tender scam", "4(g)", "without tender", "contractor fraud"],
  "ENVIRONMENT": ["lake encroach", "lake pollut", "sewage lake", "untreated sewage", "lake dead fish", "bellandur foam", "kspcb action", "ngt bengaluru", "tree fell", "tree cut illegal"],
  "BUDGET": ["bbmp budget unspent", "bbmp budget gap", "gba budget", "fund unutilized", "budget allocation bbmp"],
  "ELECTED REPS": ["mla criminal", "mla arrested", "corporator arrested", "mla assets", "mla attendance"],
  "WATER": ["bwssb", "water shortage", "water crisis bengaluru", "cauvery water", "borewell dry", "water tanker mafia"],
  "WASTE": ["garbage crisis", "waste management bbmp", "landfill", "solid waste", "garbage contractor"],
}

const RED_CATEGORIES = new Set(["PUBLIC MONEY", "ROAD SAFETY", "CONTRACTORS", "ELECTED REPS"])

function parseRss(xml: string): { title: string; description: string; link: string; pubDate: string }[] {
  const items: { title: string; description: string; link: string; pubDate: string }[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let match
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]
    const title = (block.match(/<title><!\[CDATA\[(.*?)\]\]>/)?.[1] || block.match(/<title>(.*?)<\/title>/)?.[1] || "").replace(/<[^>]+>/g, "").trim()
    const desc = (block.match(/<description><!\[CDATA\[(.*?)\]\]>/)?.[1] || block.match(/<description>(.*?)<\/description>/)?.[1] || "").replace(/<[^>]+>/g, "").trim()
    const link = block.match(/<link>(.*?)<\/link>/)?.[1]?.trim() || ""
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim() || ""
    if (title) items.push({ title, description: desc, link, pubDate })
  }
  return items
}

function classifyArticle(title: string, description: string): string | null {
  const text = `${title} ${description}`.toLowerCase()
  let bestCategory: string | null = null
  let bestScore = 0
  for (const [category, keywords] of Object.entries(CIVIC_KEYWORDS)) {
    let score = 0
    for (const kw of keywords) if (text.includes(kw)) score++
    if (score > bestScore) { bestScore = score; bestCategory = category }
  }
  return bestScore > 0 ? bestCategory : null
}

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
  const errors: string[] = []

  for (const feed of RSS_FEEDS) {
    try {
      const res = await fetch(feed.url, {
        headers: { "User-Agent": "kaun-civic/1.0 (civic-transparency-project)" },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) { errors.push(`${feed.name}: HTTP ${res.status}`); continue }

      const xml = await res.text()
      const items = parseRss(xml)

      for (const item of items) {
        const category = classifyArticle(item.title, item.description)
        if (!category) continue

        const headline = item.title.replace(/\s*\|.*$/, "").replace(/\s*-\s*$/, "").trim().substring(0, 200)
        const severity = RED_CATEGORIES.has(category) ? "red" : "yellow"

        const { error } = await supabase.from("city_pulse_facts").upsert({
          city_id: "bengaluru",
          category,
          severity,
          headline,
          detail: item.description?.substring(0, 500) || null,
          source_name: feed.name,
          source_url: item.link || null,
          published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
          is_active: true,
          is_editorial: false,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }, { onConflict: "headline,city_id", ignoreDuplicates: true })

        if (!error) totalNew++
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

  return Response.json({ ok: true, new_facts: totalNew, errors })
}
