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

const BENGALURU_AREAS: Record<string, number> = {
  "koramangala": 151, "indiranagar": 81, "whitefield": 198, "bellandur": 115,
  "jp nagar": 177, "jayanagar": 171, "hebbal": 16, "yelahanka": 1,
  "malleswaram": 71, "rajajinagar": 120, "electronic city": 193,
  "marathahalli": 110, "hsr layout": 150, "btm layout": 155,
  "bannerghatta": 185, "banashankari": 179, "vijayanagar": 130,
  "nagarbhavi": 127, "mathikere": 48, "shivajinagar": 75,
  "chamrajapet": 165, "mahadevapura": 119, "kr puram": 103,
  "cv raman nagar": 92, "domlur": 85, "ulsoor": 79,
  "frazer town": 77, "cox town": 76, "shanthala nagar": 74,
  "gandhinagar": 73, "seshadripuram": 63, "sadashivanagar": 60,
  "gokula": 53, "byatarayanapura": 6, "dasarahalli": 30,
  "rajarajeshwari": 190, "uttarahalli": 183, "begur": 160,
  "bommanahalli": 148, "madiwala": 153, "ramamurthy nagar": 100,
  "hoodi": 109, "kadugodi": 204, "varthur": 208, "sarjapur": 214,
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

// ─── Google News RSS (works from cloud, no auth) ─────────────────────────────

interface NewsItem {
  title: string
  link: string
  pubDate: string
  source: string
}

const NEWS_QUERIES = [
  "Bengaluru+pothole", "Bengaluru+BBMP+road", "Bengaluru+flooding",
  "Bengaluru+traffic+signal", "Bengaluru+garbage", "Bengaluru+encroachment",
  "BBMP+ward+complaint", "Bengaluru+water+supply", "BESCOM+Bengaluru",
]

async function fetchGoogleNews(query: string): Promise<NewsItem[]> {
  try {
    const url = `https://news.google.com/rss/search?q=${query}+when:7d&hl=en-IN&gl=IN&ceid=IN:en`
    const res = await fetch(url, { headers: { "User-Agent": "kaun-city/1.0" } })
    if (!res.ok) return []
    const xml = await res.text()
    // Simple XML parse — extract <item> blocks
    const items: NewsItem[] = []
    const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? []
    for (const block of itemMatches.slice(0, 10)) {
      const title = block.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").trim() ?? ""
      const link  = block.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim()
        ?? block.match(/<link\s*\/>([\s\S]*?)(?=<)/)?.[1]?.trim() ?? ""
      const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? ""
      const source  = block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").trim() ?? "news"
      if (title) items.push({ title, link, pubDate, source })
    }
    return items
  } catch {
    return []
  }
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

  const results = { reddit: 0, news: 0, skipped: 0, errors: 0 }

  // ── Reddit (may fail from cloud IPs) ─────────────────────────────────
  const redditQueries = REDDIT_QUERIES.sort(() => Math.random() - 0.5).slice(0, 3)
  for (const query of redditQueries) {
    const posts = await fetchReddit("bangalore", query)
    for (const post of posts) {
      const text = `${post.title} ${post.selftext}`
      const ageHours = (Date.now() / 1000 - post.created_utc) / 3600
      if (ageHours > 168) { results.skipped++; continue }
      const cls = await classifySignal(openai, post.title, post.selftext)
      if (!cls.is_civic) { results.skipped++; continue }
      const geoFromHint = cls.ward_hint ? guessWardFromText(cls.ward_hint) : { ward_no: null, ward_name: null }
      const geoFromText = guessWardFromText(text)
      const { ward_no, ward_name } = geoFromHint.ward_no ? geoFromHint : geoFromText
      const { error } = await supabase.from("civic_signals").upsert({
        source: "reddit",
        source_id: post.id,
        url: `https://reddit.com${post.permalink}`,
        author: post.author,
        title: post.title,
        body: post.selftext.substring(0, 500),
        ward_no, ward_name,
        issue_type: cls.issue_type,
        upvotes: post.score,
        signal_at: new Date(post.created_utc * 1000).toISOString(),
      }, { onConflict: "source,source_id", ignoreDuplicates: true })
      if (error) results.errors++; else results.reddit++
    }
  }

  // ── Google News RSS (reliable from cloud) ───────────────────────────
  const newsQueries = NEWS_QUERIES.sort(() => Math.random() - 0.5).slice(0, 3)
  for (const query of newsQueries) {
    const items = await fetchGoogleNews(query)
    for (const item of items) {
      const cls = await classifySignal(openai, item.title, "")
      if (!cls.is_civic) { results.skipped++; continue }
      const geo = guessWardFromText(item.title)
      const geoHint = cls.ward_hint ? guessWardFromText(cls.ward_hint) : { ward_no: null, ward_name: null }
      const { ward_no, ward_name } = geoHint.ward_no ? geoHint : geo
      // Use title hash as source_id since news links can change
      const hashId = item.title.replace(/[^a-zA-Z0-9]/g, "").substring(0, 40).toLowerCase()
      const { error } = await supabase.from("civic_signals").upsert({
        source: "news",
        source_id: `gn_${hashId}`,
        url: item.link,
        author: item.source,
        title: item.title,
        body: null,
        ward_no, ward_name,
        issue_type: cls.issue_type,
        upvotes: 0,
        signal_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
      }, { onConflict: "source,source_id", ignoreDuplicates: true })
      if (error) results.errors++; else results.news++
    }
  }

  console.log("ingest-signals:", results)
  return Response.json({ ok: true, ...results })
}
