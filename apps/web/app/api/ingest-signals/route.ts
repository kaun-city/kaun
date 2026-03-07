import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"

export const runtime  = "nodejs"
export const maxDuration = 60

// Vercel Cron guard - only allow cron runner or internal admin calls
function isAuthorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.get("x-cron-secret") === cronSecret) return true
  // Vercel Cron sets this header automatically
  if (req.headers.get("x-vercel-cron") === "1") return true
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
  try {
    const url = `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&sort=new&limit=10&t=week`
    const res = await fetch(url, {
      headers: { "User-Agent": "kaun-city-civic-bot/1.0 (civic accountability)" },
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data?.data?.children ?? []).map((c: { data: RedditPost }) => c.data)
  } catch {
    return []
  }
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

  const results = { reddit: 0, skipped: 0, errors: 0 }

  // Pick 3 random queries to avoid hitting Reddit too hard each run
  const queries = REDDIT_QUERIES.sort(() => Math.random() - 0.5).slice(0, 3)

  for (const query of queries) {
    const posts = await fetchReddit("bangalore", query)

    for (const post of posts) {
      const text = `${post.title} ${post.selftext}`

      // Skip low-effort / very old posts
      const ageHours = (Date.now() / 1000 - post.created_utc) / 3600
      if (ageHours > 168) { results.skipped++; continue } // older than 7 days

      // Classify
      const cls = await classifySignal(openai, post.title, post.selftext)
      if (!cls.is_civic) { results.skipped++; continue }

      // Geolocate to ward
      const geoFromHint = cls.ward_hint ? guessWardFromText(cls.ward_hint) : { ward_no: null, ward_name: null }
      const geoFromText = guessWardFromText(text)
      const { ward_no, ward_name } = geoFromHint.ward_no ? geoFromHint : geoFromText

      // Upsert (UNIQUE on source+source_id prevents duplicates)
      const { error } = await supabase.from("civic_signals").upsert({
        source: "reddit",
        source_id: post.id,
        url: `https://reddit.com${post.permalink}`,
        author: post.author,
        title: post.title,
        body: post.selftext.substring(0, 500),
        ward_no,
        ward_name,
        issue_type: cls.issue_type,
        upvotes: post.score,
        signal_at: new Date(post.created_utc * 1000).toISOString(),
      }, { onConflict: "source,source_id", ignoreDuplicates: true })

      if (error) { results.errors++; console.error("upsert error:", error) }
      else results.reddit++
    }
  }

  console.log("ingest-signals:", results)
  return Response.json({ ok: true, ...results })
}
