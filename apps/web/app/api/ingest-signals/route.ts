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
  // ══ GBA 2025 ward names (369 wards across 5 corporations) ══
  // Central Corporation
  "ramaswamy palya": 126, "jayamahal": 127, "sampangirama nagar": 128,
  "bharathi nagar": 130, "k kamaraj ward": 131, "hoysala nagara central": 119,
  "old baiyappanahalli": 118, "kasturi nagar": 118, "krishnaiahnapalya": 117,
  "nagavarapalya": 117, "kaggadasapura": 123, "g.m palya": 123,
  "jeevan bhimanagar": 124, "kodihalli": 124, "konena agrahara": 124,
  "domluru": 178, "jogpalya": 179, "agaram": 180,
  "ashokanagar": 181, "vannarpet": 184, "ambedkarnagar": 180,
  "austin town": 184, "vinayakanagar": 183, "shanthinagar": 182,
  "silverjubilee park ward": 171, "dharmaraya swamy temple ward": 172, "d.v gundappa ward": 171,
  "someshwara nagara": 177, "bhel ward": 176, "kanakanapalya": 175,
  "venkat reddy nagara": 175, "ashoka pillar": 174, "v.v puram": 174,
  "sunkenahalli": 173, "devaraj urs ward": 173, "chamarajpet": 165,
  "k.r market": 165, "cheluvadi palya": 166, "ipd salappa ward": 167,
  "kasturbha nagar": 170, "jjr nagara": 168, "old guddadahalli": 169,
  "rayapuram": 167, "binnypete": 136, "bhuvaneshwari nagar": 136,
  "gopalpura": 134, "nehru nagar": 133, "seshadripuram": 132,
  "dattatreya ward": 132, "swatantra palya ward": 134,
  // East Corporation
  "k narayanapura": 81, "chellakere": 82, "babusab palya": 82,
  "hoysala nagara east": 83, "k chennasandra": 83, "anandapura": 86,
  "bhattarahalli": 87, "basavanapura": 88, "krishnanagar": 88,
  "devasandra": 88, "rajarajeshwari temple ward": 89, "k.r pura": 86,
  "kotthur": 86, "dooravaninagar": 84, "k.s. nissar ahmed ward": 91,
  "a narayanapura": 89, "uday nagar": 91, "sangama ward": 93,
  "vignananagara": 92, "l.b shastri nagar": 92, "jagadish nagar": 93,
  "vibhootipura": 93, "byrathi": 83, "hoodi": 106,
  "belathur": 105, "channasandra": 111, "s.m krishna ward": 105,
  "kaveri nagara": 106, "garudachar palya": 107, "bharath aikya ward": 108,
  "kundalahalli": 110, "hagaduru": 111, "varthur": 112,
  "munnenkolalu": 113, "priyadarshini ward": 109, "dodda nekkundi": 108,
  "ashwath nagar": 108, "yamalur": 115, "bellanduru": 115,
  "panathur": 113, "shivanasamudra ward": 116, "gunjur": 112,
  // North Corporation
  "raja kempegowda ward": 1, "aerocity": 1, "chowdeshwari ward": 2,
  "nyayanga badavane": 5, "doddabettahalli": 4, "attur": 4,
  "singapura": 15, "kuvempunagara": 15, "doddabommasandra": 13,
  "thindlu": 11, "rajiv gandhi nagar": 10, "amruthahalli": 9,
  "jakkur": 8, "sampigehalli": 6, "hbr layout": 94,
  "govindapura": 95, "samadhana nagar": 96, "k.g.halli": 97,
  "venkateshpuram": 97, "lingarajpura": 98, "kacharakanahalli": 99,
  "kalyan nagar": 99, "banaswadi": 100, "hrbr layout": 99,
  "subbayanapalya": 101, "maruthi seva nagara": 102, "jeevanahalli": 103,
  "shampura": 74, "kaval byrasandra": 74, "shakthi nagar": 75,
  "periyar nagar": 76, "aruna asif ali ward": 76, "varalakshmi nagar": 74,
  "doddanna nagar": 78, "kushal nagar": 76, "sagayapuram": 79,
  "pulakeshi nagar": 80, "s.k garden": 80, "jaya chamarajendra nagara": 73,
  "dinnur": 73, "manorayanapalya": 69, "vishwanatha nagenahalli": 68,
  "r.t nagar": 71, "gangenahalli": 73, "ganganagar": 72,
  "bhoopasandra": 67, "nagashettyhalli": 66, "geddalahalli": 66,
  "hmt ward": 40, "brundavana nagara": 38, "j.p park": 38,
  "yeshwanthpura": 37, "abbigere": 16, "kammagondanahalli": 16,
  "shettihalli": 17, "mallasandra": 20, "bagalagunte": 17,
  "manjunatha nagar": 18, "nele maheshwaramma temple ward": 21,
  // South Corporation
  "padmanabhanagara": 206, "kadirenahalli": 206, "yarab nagar": 203,
  "banashankari temple ward": 203, "kane muneshwara ward": 205, "gowdanapalya": 205,
  "byrasandra": 196, "tilak nagara": 196, "n.a.l layout": 195,
  "abdul kalam nagar": 194, "jayanagar east": 194, "pattabhirama nagara": 197,
  "marenahalli south": 198, "j.p nagar": 198, "shakambarinagara": 197,
  "sarakki": 199, "n.s palya": 193, "viswamanava kuvempu ward": 192,
  "new tavarekere": 192, "chikka adugodi": 190, "s.g palya": 189,
  "a adugodi": 188, "national games village": 186, "sri lakshmi devi ward": 185,
  "kormangala east": 186, "kormangala west": 187, "jakkasandra": 191,
  "kasavanahalli": 116, "naganathapura": 228, "chikkathoguru": 227,
  "vishwapriya nagara": 227, "beguru": 226, "yelenahalli": 226,
  "doddakammanahalli": 226, "anjanapura": 224, "kothanur": 223,
  "rbi layout": 222, "bheereshwara nagar": 222, "harinagar": 224,
  "yelachenahalli": 220, "chandranagara": 220, "vasanthapura": 219,
  "sarvabhouma nagar": 217, "talagattapura": 35, "jaraganahalli": 242,
  "kengal hanumanthaiah south": 241, "puttenahalli": 240, "doresanipalya": 239,
  "vijaya bank layout": 239, "bilekahalli": 237, "kodi chikkanahalli": 233,
  "devarachikkanahalli": 236, "hongasandra": 234, "garvebavi palya": 233,
  "bandepalya": 232, "mangammana palya": 231, "hosapalya": 229,
  "iblur": 229, "agara": 230,
  // West Corporation
  "nagasandra": 22, "chokkasandra": 22, "nelagadaranahalli": 23,
  "parvathi nagar": 24, "rajeshwarinagar": 25, "shivapura": 23,
  "rajagopala nagara": 25, "hegganahalli": 26, "srigandhanagar": 27,
  "sunkadakatte": 27, "dodda bidarakallu": 28, "andrahalli": 28,
  "nada prabhu kempegowda nagara": 29, "herohalli": 30, "byadarahalli": 31,
  "ullal": 31, "nagadevanahalli": 32, "kengal hanumanthaiah west": 34,
  "shivanapalya": 32, "kengeri kote ward": 35, "kengeri": 34,
  "bangarappa nagara": 49, "rajarajeshwari nagara": 49, "jnana bharathi ward": 48,
  "vinayaka layout": 48, "mallathahalli": 46, "srigandada kaval": 46,
  "kottegepalya": 45, "chowdeshwari nagar": 44, "kempegowda layout": 43,
  "freedom fighter ward": 43, "laggere": 42, "lakshmi devi nagar": 42,
  "goraguntepalya": 36, "nalwadi krishnaraja wadiyar ward": 50, "dr. puneeth rajkumar ward": 53,
  "nandini layout": 53, "jai maruthi nagar": 54, "mahalakshmipuram": 52,
  "raja mayura varma ward": 55, "kethamaranahalli": 51, "shankar mutt": 56,
  "shakthi ganapathi nagara": 57, "kamalanagara": 58, "vrishabhavathi nagar": 58,
  "aramane nagara": 60, "sadashiva nagara": 60, "rajamahal": 60,
  "kodandarampura": 64, "malleshwaram": 61, "subedarpalya": 61,
  "subramanyanagara": 62, "gayathri nagara": 63, "kuvempu ward": 63,
  "dayanand nagara": 139, "bandi reddy circle ward": 139, "prakash nagara": 140,
  "da.ra. bendre ward": 142, "rama mandira": 142, "rajajinagara": 143,
  "shivanagara": 143, "manjunath nagara": 141, "sane guruvana halli": 144,
  "basaveshwara nagara": 144, "agrahara dasarahalli": 147, "dr rajkumar ward": 146,
  "thimmenahalli": 146, "kaveripura": 149, "dr. vishnuvardhan ward": 148,
  "pattegar palya": 149, "marenahalli west": 150, "moodalapalya": 152,
  "maruthi mandira ward": 151, "anubhava nagara": 153, "chandra layout": 154,
  "nayanda halli": 155, "attigupe": 161, "hampi nagar": 161,
  "hosahalli": 159, "adi chunchanagiri ward": 158, "vidyaranyanagara": 157,
  "k.p agrahara": 157, "sangolli rayanna ward": 156, "bapuji nagara": 160,
  "krishnadevaraya ward": 159, "gali anjaneya temple ward": 162, "muneshwara block": 164,
  "avalahalli": 164, "deepanjali nagara": 163, "swamy vivekananda ward": 214,
  "kathriguppe": 215, "srinivasa nagara": 212, "ashoka nagara": 211,
  "t.r shamanna nagar": 211, "srinagar": 213, "kempambudhi ward": 211,
  "hanumanthanagar": 211, "n.r colony": 210, "thyagarajnagar": 216,
  "yediyuru": 200, "devagiri temple ward": 201, "dharmagiri ward": 201,
  "ganesh mandira ward": 202, "kamakya layout": 207, "chikkalasandra": 208,
  "ittamadu": 208, "hosakerehalli": 209,

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

// Returns ALL wards mentioned in text (deduped by ward_no)
function guessAllWardsFromText(text: string): Array<{ ward_no: number; ward_name: string }> {
  const lower = text.toLowerCase()
  const seen = new Set<number>()
  const results: Array<{ ward_no: number; ward_name: string }> = []
  for (const [area, wardNo] of Object.entries(BENGALURU_AREAS)) {
    if (lower.includes(area) && !seen.has(wardNo)) {
      seen.add(wardNo)
      results.push({ ward_no: wardNo, ward_name: area.split(" ").map(w => w[0].toUpperCase() + w.slice(1)).join(" ") })
    }
  }
  return results
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

  // Helper: upsert one news/RSS item — fans out to multiple rows if multiple wards mentioned
  async function upsertNewsItem(item: NewsItem, sourceKey: string) {
    const cls = await classifySignal(openai, item.title, "")
    if (!cls.is_civic) { results.skipped++; return }

    const hashId   = item.title.replace(/[^a-zA-Z0-9]/g, "").substring(0, 40).toLowerCase()
    const signalAt = item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString()
    const base     = { source: sourceKey, url: item.link || null, author: item.source, title: item.title, body: null, issue_type: cls.issue_type, upvotes: 0, signal_at: signalAt }

    // Find ALL wards mentioned in title + GPT hint
    const hintWards = cls.ward_hint ? guessAllWardsFromText(cls.ward_hint) : []
    const titleWards = guessAllWardsFromText(item.title)
    const allWards = [...hintWards, ...titleWards].filter((w, i, arr) => arr.findIndex(x => x.ward_no === w.ward_no) === i)

    if (allWards.length === 0) {
      // No specific ward — store once with null ward
      const { error } = await supabase.from("civic_signals").upsert(
        { ...base, source_id: `${sourceKey}_${hashId}`, ward_no: null, ward_name: null },
        { onConflict: "source,source_id", ignoreDuplicates: true }
      )
      if (error) results.errors++
      else if (sourceKey === "gnews") results.news++
      else results.civic_media++
    } else {
      // Fan out: one row per ward
      for (const { ward_no, ward_name } of allWards) {
        const { error } = await supabase.from("civic_signals").upsert(
          { ...base, source_id: `${sourceKey}_${hashId}_w${ward_no}`, ward_no, ward_name },
          { onConflict: "source,source_id", ignoreDuplicates: true }
        )
        if (error) results.errors++
        else if (sourceKey === "gnews") results.news++
        else results.civic_media++
      }
    }
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

  // ── Moderate pending ward_reports (AI runs here, not at submit time) ──
  const modResults = await moderatePendingReports(supabase, openai)
  console.log("ingest-signals:", results, "moderation:", modResults)
  return Response.json({ ok: true, ...results, moderated: modResults })
}

// ─── Report moderation (runs daily at 2am) ──────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function moderatePendingReports(
  supabase: any,
  openai: OpenAI
): Promise<{ approved: number; rejected: number; errors: number }> {
  const out = { approved: 0, rejected: 0, errors: 0 }

  const { data: pending } = await supabase
    .from("ward_reports")
    .select("id, photo_url, description, issue_type")
    .eq("status", "pending")
    .order("reported_at", { ascending: true })
    .limit(20)

  if (!pending || pending.length === 0) return out

  for (const report of pending) {
    try {
      let ai_label: string | null = null
      let ai_person: string | null = null
      let ai_party: string | null = null
      let ai_confidence = 0
      // Default to pending — must pass moderation checks to become approved
      let newStatus = "pending"

      // Text moderation on description
      if (report.description) {
        const modResult = await openai.moderations.create({ input: report.description })
        if (modResult.results[0]?.flagged) {
          await supabase.from("ward_reports").update({ status: "rejected", moderated_at: new Date().toISOString() }).eq("id", report.id)
          out.rejected++
          continue
        }
      }

      // Vision analysis if photo exists
      if (report.photo_url) {
        const prompt = `You are a civic issue moderator for Bengaluru, India. Analyse this photo and respond with raw JSON only:
{"is_civic_issue":bool,"issue_type":"hoarding|pothole|flooding|construction|encroachment|garbage|signal|other","confidence":0-100,"description":"one sentence","politician_name":string|null,"politician_party":string|null,"rejection_reason":string|null}`

        const vision = await openai.chat.completions.create({
          model: "gpt-4o",
          max_tokens: 300,
          messages: [{ role: "user", content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: report.photo_url, detail: "low" } }
          ]}]
        })

        try {
          const analysis = JSON.parse(vision.choices[0]?.message?.content ?? "{}")
          if (!analysis.is_civic_issue || analysis.confidence < 40) {
            newStatus = "rejected"
            const path = report.photo_url.split("report-photos/")[1]
            if (path) await supabase.storage.from("report-photos").move(path, path.replace("pending/", "rejected/"))
            await supabase.from("ward_reports").update({ status: "rejected", moderated_at: new Date().toISOString() }).eq("id", report.id)
            out.rejected++
            continue
          }
          ai_label      = analysis.description ?? null
          ai_person     = analysis.politician_name ?? null
          ai_party      = analysis.politician_party ?? null
          ai_confidence = analysis.confidence ?? 0
          newStatus     = ai_confidence >= 70 ? "approved" : "pending"

          if (newStatus === "approved" && report.photo_url) {
            const path = report.photo_url.split("report-photos/")[1]
            if (path) await supabase.storage.from("report-photos").move(path, path.replace("pending/", "approved/"))
            report.photo_url = report.photo_url.replace("pending/", "approved/")
          }
        } catch { newStatus = "pending" }
      } else if (report.description) {
        // Text-only — extract politician name
        try {
          const extract = await openai.chat.completions.create({
            model: "gpt-4o-mini", max_tokens: 150,
            messages: [
              { role: "system", content: "Extract structured data from civic complaints. Raw JSON only." },
              { role: "user", content: `{"politician_name":string|null,"politician_party":string|null,"summary":"one sentence"}\n\n${report.description}` }
            ]
          })
          const parsed = JSON.parse((extract.choices[0]?.message?.content ?? "{}").replace(/```json|```/g, "").trim())
          ai_person = parsed.politician_name ?? null
          ai_party  = parsed.politician_party ?? null
          ai_label  = parsed.summary ?? report.description
          ai_confidence = ai_person ? 75 : 50
          newStatus = "approved" // passed text moderation above
        } catch { ai_label = report.description }
      }

      await supabase.from("ward_reports").update({
        status:        newStatus,
        ai_label, ai_person, ai_party, ai_confidence,
        moderated_at:  new Date().toISOString(),
      }).eq("id", report.id)
      out.approved++

    } catch (e) {
      console.error("moderate report", report.id, e)
      out.errors++
    }
  }

  return out
}
