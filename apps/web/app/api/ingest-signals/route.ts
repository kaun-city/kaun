import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"

export const runtime  = "nodejs"
export const maxDuration = 60

// Vercel Cron guard - only allow cron runner or internal admin calls
function isAuthorized(req: Request): boolean {
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>
  const cronSecret = process.env.CRON_SECRET?.trim()
  const authHeader = req.headers.get("authorization") ?? ""
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true
  if (cronSecret && req.headers.get("x-cron-secret") === cronSecret) return true
  // Fallback: Vercel Cron also sets this header
  if (req.headers.get("x-vercel-cron")) return true
  return false
}

// ─── Reddit ──────────────────────────────────────────────────────────────────

const REDDIT_QUERIES = [
  "pothole", "bbmp", "traffic signal broken", "flooding", "garbage",
  "encroachment", "road damage", "water supply", "bescom", "bwssb",
]

interface RedditPost {
  id: string
  title: string
  selftext: string
  url: string
  author: string
  score: number
  created_utc: number
  permalink: string
}

async function fetchReddit(subreddit: string, query: string): Promise<RedditPost[]> {
  // Try old.reddit.com first (less aggressive bot blocking from cloud IPs)
  const urls = [
    `https://old.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&sort=new&limit=10&t=week`,
    `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&sort=new&limit=10&t=week`,
  ]
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "kaun-city-civic-bot/1.0 (https://kaun.city; civic accountability tool)" },
      })
      if (!res.ok) continue
      const text = await res.text()
      // Reddit sometimes returns HTML instead of JSON when blocking
      if (!text.startsWith("{") && !text.startsWith("[")) continue
      const data = JSON.parse(text)
      const posts = (data?.data?.children ?? []).map((c: { data: RedditPost }) => c.data)
      if (posts.length > 0) return posts
    } catch { continue }
  }
  return []
}

// ─── GPT classification ───────────────────────────────────────────────────────

const ISSUE_TYPES = ["pothole", "flooding", "signal", "garbage", "encroachment", "construction", "water", "power", "other"]

// All 243 BBMP ward names (lowercase, stripped suffixes) → ward_no
// Plus common aliases/spellings used in news articles
const BENGALURU_AREAS: Record<string, number> = {
  // ── Ward names from DB ────────────────────────────────────────────────
  "kempegowda": 1, "chowdeswari": 2, "someshwara": 3, "atturu": 4,
  "yelahanka satellite town": 5, "kogilu": 6, "thanisandra": 7, "jakkuru": 8,
  "amrutahalli": 9, "kempapura": 10, "byatarayanapura": 11, "kodigehalli": 12,
  "vidyaranyapura": 14, "kuvempunagar": 15, "bagalakunte": 18,
  "t dasarahalli": 21, "peenya": 41, "jnana bharathi": 48,
  "rajarajeshwari nagar": 49, "nagapura": 51, "mahalakshimpuram": 52,
  "malleswaram": 61, "kadu malleshwara": 64, "rajamahal guttahalli": 65,
  "hebbala": 70, "horamavu": 81, "kalkere": 83, "ramamurthy nagara": 84,
  "vijinapura": 85, "k r puram": 86, "mahadevapura": 90, "vijnana": 92,
  "hennur": 94, "nagavara": 95, "kadugondanahalli": 96, "hrbr": 99,
  "banasavadi": 100, "kammanahalli": 101, "lingarajapura": 102,
  "kadugodi": 104, "aecs layout": 109, "whitefield": 110, "varthuru": 112,
  "marathahalli": 114, "bellandur": 115, "c v raman nagar": 117,
  "new bayappanahalli": 119, "old thippasandra": 121, "new thippasandra": 122,
  "vasanth nagar": 128, "sampangiram nagar": 129, "ulsoor": 131,
  "gandhinagar": 133, "okalipuram": 135, "binnipete": 136, "cottonpete": 137,
  "chickpete": 138, "rajaji nagar": 141, "basaveshwara nagar": 144,
  "kamakshipalya": 145, "govindaraja nagar": 148, "nagarabhavi": 153,
  "nayandahalli": 155, "vijayanagar": 157, "chamrajapet": 165,
  "padarayanapura": 168, "azad nagar": 170, "vishveshwara puram": 174,
  "hombegowda nagara": 177, "domlur": 178, "shantala nagar": 181,
  "shanthi nagar": 182, "neelasandra": 183, "ejipura": 185,
  "koramangala": 186, "adugodi": 187, "lakkasandra": 188, "madivala": 190,
  "btm layout": 192, "j p nagar": 198, "banashankari temple": 203,
  "kumaraswamy layout": 204, "padmanabha nagar": 206, "basavanagudi": 210,
  "hanumanth nagar": 211, "srinivasa nagar": 212, "girinagar": 214,
  "uttarahalli": 217, "subramanyapura": 218, "vasanthpura": 219,
  "konanakunte": 221, "gottigere": 225, "begur": 227, "ibluru": 229,
  "hsr - singasandra": 232, "bommanahalli": 235, "arakere": 238,
  "hulimavu": 239, "kudlu": 243,
  // ── Common aliases & spellings used in news/social media ─────────────
  "yelahanka": 1, "yelahanka new town": 5,
  "hebbal": 16, "hebbal lake": 16,
  "dasarahalli": 21, "t. dasarahalli": 21,
  "mathikere": 59, "mattikere": 59,
  "sadashivanagar": 60, "sadashiva nagar": 60,
  "shivajinagar": 75, "shivaji nagar": 75,
  "indiranagar": 81, "indira nagar": 81,
  "cv raman nagar": 117, "c.v. raman nagar": 117,
  "kr puram": 86, "k.r. puram": 86, "krishnarajapuram": 86,
  "white field": 110,
  "maratahalli": 114,
  "hsr layout": 232, "hsr": 232, "singasandra": 232,
  "btm": 192, "btm 2nd stage": 192,
  "jp nagar": 198, "j.p. nagar": 198, "jayanagar": 182,
  "jayanagar 4th block": 182, "jayanagar 9th block": 175,
  "bannerghatta": 238, "bannerghatta road": 238,
  "banashankari": 203, "bsk": 203,
  "rajarajeshwari": 49, "rr nagar": 148, "rajajinagar": 141,
  "nagarbhavi": 153,
  "electronics city": 234, "electronic city phase 1": 234, "electronic city phase 2": 234,
  "bellandur lake": 115,
  "sarjapur road": 229,
  "indiranagar domlur": 178,
  "hoodi circle": 109,
  "frazer town": 77, "fraser town": 77,
  "cox town": 76, "cooke town": 76,
  "ulsoor lake": 131, "halasuru": 131,
  "richmond town": 181, "richmond road": 181,
  "cubbon park": 129, "mg road": 129,
  "koramangala 5th block": 186, "koramangala 7th block": 186,
  "madiwala": 190,
  "bommasandra": 13, "begur road": 227,
  "kengeri satellite town": 33,
  "uttrahalli": 217,
  "jalahalli": 22, "peenya industrial area": 41,
  "yeshwanthpur": 144, "yeshwantpur": 144,
  "majestic": 136, "city market": 138, "chickpet": 138,
}

function guessWardFromText(text: string): { ward_no: number | null; ward_name: string | null } {
  const lower = text.toLowerCase()
  for (const [area, wardNo] of Object.entries(BENGALURU_AREAS)) {
    if (lower.includes(area)) {
      return { ward_no: wardNo, ward_name: area.split(" ").map(w => w[0].toUpperCase() + w.slice(1)).join(" ") }
    }
  }
  return { ward_no: null, ward_name: null }
}

async function classifySignal(openai: OpenAI, title: string, body: string): Promise<{
  is_civic: boolean; issue_type: string; ward_hint: string | null
}> {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 80,
      messages: [
        { role: "system", content: `You classify Bengaluru civic complaints. Reply with raw JSON only: {"is_civic": bool, "issue_type": "${ISSUE_TYPES.join("|")}", "ward_hint": "area name or null"}` },
        { role: "user", content: `Title: ${title}\nBody: ${body.substring(0, 300)}` },
      ],
    })
    const raw = (res.choices[0]?.message?.content ?? "{}").replace(/```json|```/g, "").trim()
    return JSON.parse(raw)
  } catch {
    return { is_civic: false, issue_type: "other", ward_hint: null }
  }
}

// ─── RSS feeds ───────────────────────────────────────────────────────────────

interface NewsItem {
  title: string
  link: string
  pubDate: string
  source: string
}

// Generic RSS parser — handles standard RSS 2.0 and Atom feeds
async function fetchRSS(url: string, sourceName: string, limit = 15): Promise<NewsItem[]> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "kaun-city/1.0 (https://kaun.city; civic accountability)" },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const xml = await res.text()
    if (!xml.includes("<item") && !xml.includes("<entry")) return []
    const items: NewsItem[] = []
    // Support both RSS <item> and Atom <entry>
    const blocks = xml.match(/<item>([\s\S]*?)<\/item>/g)
      ?? xml.match(/<entry>([\s\S]*?)<\/entry>/g)
      ?? []
    for (const block of blocks.slice(0, limit)) {
      const title   = block.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim() ?? ""
      // RSS: <link>url</link>  Atom: <link href="url"/>
      const link    = block.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim()
        ?? block.match(/<link[^>]+href="([^"]+)"/)?.[1]?.trim() ?? ""
      const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim()
        ?? block.match(/<published>([\s\S]*?)<\/published>/)?.[1]?.trim() ?? ""
      if (title.length > 10) items.push({ title, link, pubDate, source: sourceName })
    }
    return items
  } catch {
    return []
  }
}

// Direct RSS feeds — civic-focused Bengaluru sources
const DIRECT_RSS_FEEDS: Array<{ url: string; name: string }> = [
  // Best: hyper-local Bengaluru civic journalism
  { url: "https://citizenmatters.in/feed",                                                        name: "Citizen Matters" },
  // Mainstream Bengaluru news
  { url: "https://www.deccanherald.com/rss/city.rss",                                             name: "Deccan Herald" },
  { url: "https://www.thehindu.com/news/cities/bangalore/?service=rss",                           name: "The Hindu Bengaluru" },
  { url: "https://bangaloremirror.indiatimes.com/rssfeeds/1564615/list.cms",                       name: "Bangalore Mirror" },
  // BBMP / civic beat
  { url: "https://www.newindianexpress.com/rss/states/karnataka.xml",                             name: "New Indian Express" },
]

// Google News RSS — query-based, catches anything the direct feeds miss
const GOOGLE_NEWS_QUERIES = [
  "Bengaluru+pothole+BBMP", "Bengaluru+flooding+ward",
  "Bengaluru+garbage+BBMP", "Bengaluru+traffic+signal+broken",
  "BBMP+road+repair", "Bengaluru+encroachment+complaint",
  "Bengaluru+water+supply+shortage", "BESCOM+power+cut+Bengaluru",
]

async function fetchGoogleNews(query: string): Promise<NewsItem[]> {
  return fetchRSS(
    `https://news.google.com/rss/search?q=${query}+when:7d&hl=en-IN&gl=IN&ceid=IN:en`,
    "Google News",
    10,
  )
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

  const results = { reddit: 0, news: 0, civic_media: 0, skipped: 0, errors: 0 }

  // Helper: upsert one news/RSS item
  async function upsertNewsItem(item: NewsItem, sourceKey: string) {
    const cls = await classifySignal(openai, item.title, "")
    if (!cls.is_civic) { results.skipped++; return }
    const geo     = guessWardFromText(item.title)
    const geoHint = cls.ward_hint ? guessWardFromText(cls.ward_hint) : { ward_no: null, ward_name: null }
    const { ward_no, ward_name } = geoHint.ward_no ? geoHint : geo
    const hashId  = item.title.replace(/[^a-zA-Z0-9]/g, "").substring(0, 40).toLowerCase()
    const { error } = await supabase.from("civic_signals").upsert({
      source: sourceKey,
      source_id: `${sourceKey}_${hashId}`,
      url: item.link || null,
      author: item.source,
      title: item.title,
      body: null,
      ward_no, ward_name,
      issue_type: cls.issue_type,
      upvotes: 0,
      signal_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
    }, { onConflict: "source,source_id", ignoreDuplicates: true })
    if (error) results.errors++
    else if (sourceKey === "gnews") results.news++
    else results.civic_media++
  }

  // ── Reddit (may fail from cloud IPs — keeping for future OAuth upgrade) ──
  const redditQueries = REDDIT_QUERIES.sort(() => Math.random() - 0.5).slice(0, 2)
  for (const query of redditQueries) {
    const posts = await fetchReddit("bangalore", query)
    for (const post of posts) {
      const text = `${post.title} ${post.selftext}`
      const ageHours = (Date.now() / 1000 - post.created_utc) / 3600
      if (ageHours > 168) { results.skipped++; continue }
      const cls = await classifySignal(openai, post.title, post.selftext)
      if (!cls.is_civic) { results.skipped++; continue }
      const geoHint = cls.ward_hint ? guessWardFromText(cls.ward_hint) : { ward_no: null, ward_name: null }
      const geoText = guessWardFromText(text)
      const { ward_no, ward_name } = geoHint.ward_no ? geoHint : geoText
      const { error } = await supabase.from("civic_signals").upsert({
        source: "reddit", source_id: post.id,
        url: `https://reddit.com${post.permalink}`,
        author: post.author, title: post.title,
        body: post.selftext.substring(0, 500),
        ward_no, ward_name, issue_type: cls.issue_type,
        upvotes: post.score,
        signal_at: new Date(post.created_utc * 1000).toISOString(),
      }, { onConflict: "source,source_id", ignoreDuplicates: true })
      if (error) results.errors++; else results.reddit++
    }
  }

  // ── Direct civic RSS feeds (citizenmatters, Deccan Herald, The Hindu, etc.) ──
  // All feeds run every day — ignoreDuplicates handles seen items
  const feedResults = await Promise.allSettled(
    DIRECT_RSS_FEEDS.map(f => fetchRSS(f.url, f.name))
  )
  for (const result of feedResults) {
    if (result.status !== "fulfilled") continue
    for (const item of result.value) {
      await upsertNewsItem(item, "civic_media")
    }
  }

  // ── Google News RSS — 2 random civic queries ─────────────────────────
  const gnQueries = GOOGLE_NEWS_QUERIES.sort(() => Math.random() - 0.5).slice(0, 2)
  for (const query of gnQueries) {
    const items = await fetchGoogleNews(query)
    for (const item of items) {
      await upsertNewsItem(item, "gnews")
    }
  }

  console.log("ingest-signals:", results)
  return Response.json({ ok: true, ...results })
}
