/**
 * pulse-ingest.mjs — how a raw RSS item becomes a labelled CityPulse fact.
 *
 * SINGLE SOURCE OF TRUTH for category, severity, headline and source_name.
 * Imported by BOTH:
 *   - apps/web/app/api/refresh-pulse/route.ts  (live daily pipeline)
 *   - scripts/cleanup-pulse-labels.mjs         (one-off relabel of old rows)
 * so a freshly ingested item and a relabelled old row can never disagree.
 *
 * Plain .mjs (not .ts) for the same reason as pulse-dedup.mjs: the cleanup
 * script and the tests `node`-import it with no build step. Types live in
 * pulse-ingest.d.ts.
 *
 * Three rules this module exists to enforce:
 *   1. A category comes from what the story is about. A rain story that
 *      mentions potholes is FLOODING, not ROAD SAFETY, unless someone was
 *      hurt; weather on its own is not a civic fact at all.
 *   2. source_name names the publisher, never the search that found the item.
 *      Google News searches are how we find items, not who published them, so
 *      a Google News link reads "<Publisher> via Google News".
 *   3. No emoji in stored text.
 */

// ─── Text ───────────────────────────────────────────────────────

const NAMED_ENTITIES = { quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " }

/** Decode the XML/HTML entities feeds leave in titles. `&amp;` goes last so `&amp;lt;` stays literal. */
export function decodeEntities(text) {
  return String(text ?? "")
    .replace(/&#(\d+);/g, (m, code) => codePoint(Number(code), m))
    .replace(/&#x([0-9a-f]+);/gi, (m, code) => codePoint(parseInt(code, 16), m))
    .replace(/&(quot|apos|lt|gt|nbsp);/g, (_, name) => NAMED_ENTITIES[name])
    .replace(/&amp;/g, "&")
}

function codePoint(n, fallback) {
  return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : fallback
}

// Arrows and the ©/®/™ marks are Extended_Pictographic but they are text, not
// decoration, so they stay (same carve-out as the ticker's display filter).
const EMOJI = /(?![\u00A9\u00AE\u2122\u2190-\u21FF])[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/gu
const EMOJI_MODIFIERS = /[\u{FE0E}\u{FE0F}\u{200B}\u{20E3}\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]/gu
// A zero-width joiner left beside a gap belonged to an emoji sequence. One
// between two letters is Kannada/Indic shaping and stays.
const ORPHAN_ZWJ = /\u200D(?=\s|$)|(?<=\s|^)\u200D/gu

/** Remove emoji, their modifiers and the joiners that glued them; collapse whitespace. */
export function stripEmoji(text) {
  return String(text ?? "")
    .replace(EMOJI, " ")
    .replace(EMOJI_MODIFIERS, "")
    .replace(ORPHAN_ZWJ, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** Replace tags with spaces; drop a tag cut off by truncation. */
function stripTags(html) {
  return String(html ?? "").replace(/<[^>]+>/g, " ").replace(/<[^>]*$/, " ")
}

/** Feed description → plain text. Google News escapes its HTML, so decode, strip, decode again. */
export function descriptionText(raw) {
  return stripEmoji(decodeEntities(stripTags(decodeEntities(raw))))
}

// ─── Sources ────────────────────────────────────────────────────

/** Hosts whose links are an aggregator's redirect, not the publisher's page. */
const AGGREGATORS = { "news.google.com": "Google News" }

/** Canonical publisher names for hosts that feeds and Google News label inconsistently. */
const PUBLISHERS = {
  "x.com": "X",
  "twitter.com": "X",
  "mobile.twitter.com": "X",
  "thenewsminute.com": "The News Minute",
  "citizenmatters.in": "Citizen Matters",
  "deccanherald.com": "Deccan Herald",
  "thehindu.com": "The Hindu",
  "bangaloremirror.indiatimes.com": "Bangalore Mirror",
  "timesofindia.indiatimes.com": "The Times of India",
  "newindianexpress.com": "The New Indian Express",
  "indianexpress.com": "The Indian Express",
  "indiatoday.in": "India Today",
  "hindustantimes.com": "Hindustan Times",
  "ndtv.com": "NDTV",
}

/** Lowercase hostname without `www.`, or "" when the value is not an http(s) URL. */
export function hostOf(url) {
  try {
    const u = new URL(String(url ?? "").trim())
    if (u.protocol !== "http:" && u.protocol !== "https:") return ""
    return u.hostname.toLowerCase().replace(/^www\./, "")
  } catch {
    return ""
  }
}

function publisherLabel(name, url) {
  const host = hostOf(url)
  if (PUBLISHERS[host]) return PUBLISHERS[host]
  const clean = stripEmoji(decodeEntities(name))
  if (clean) return PUBLISHERS[clean.toLowerCase().replace(/^www\./, "")] ?? clean
  return AGGREGATORS[host] ? "" : host
}

/**
 * The source_name for an item: its publisher, from the feed's own attribution
 * (`<source url="…">Name</source>` on Google News) or the link's host. Items
 * reached through an aggregator say so, because that is where the link goes.
 * Feed and search labels ("X/Pothole", "Google News BWSSB") are never used.
 *
 * @param {{ link: string, source?: { name?: string, url?: string } | null }} item
 */
export function sourceName({ link, source }) {
  const host = hostOf(link)
  const aggregator = AGGREGATORS[host]
  if (aggregator) {
    const publisher = source ? publisherLabel(source.name, source.url) : ""
    return publisher && publisher !== aggregator ? `${publisher} via ${aggregator}` : aggregator
  }
  // A direct link is the publisher's own page: its host decides, and a
  // <source> name is only trusted when it describes that same host.
  const sameHost = source && hostOf(source.url) === host
  return publisherLabel(sameHost ? source.name : "", link)
}

// ─── Headlines ──────────────────────────────────────────────────

// Outlet tags the route has always stripped, for items with no <source> element.
const KNOWN_OUTLET_TAG = /\s*[-|]\s*(MSN|x\.com|Deccan Herald|The Hindu|Asianet Newsable|Times of India|NDTV|Hindustan Times|Economic Times|The News Minute|Citizen Matters|New Indian Express|Bangalore Mirror|India Today).*$/i

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Drop trailing " - <Publisher>" / " | <Publisher>" tags. Google News appends
 * one to every title, sometimes after the outlet's own ("… | Inshorts - Inshorts").
 */
export function stripPublisherTag(title, source) {
  const tags = [source?.name, hostOf(source?.url)].map(t => stripEmoji(decodeEntities(t))).filter(Boolean)
  if (!tags.length) return title
  const trailing = new RegExp(`\\s+[-|]\\s+(?:${tags.map(escapeRegex).join("|")})\\s*$`, "i")
  let s = title
  while (trailing.test(s)) s = s.replace(trailing, "")
  return s
}

// A #hashtag or @mention (Kannada included: its vowel signs are \p{M}).
const TAG = String.raw`(?<![\p{L}\p{M}\p{N}_])[#@][\p{L}\p{M}\p{N}_]+`
const EDGE_TAGS = new RegExp(String.raw`^(?:${TAG}[\s,&]*)+|(?:[\s,&]*${TAG})+$`, "gu")
const TAG_SIGIL = new RegExp(String.raw`(?<![\p{L}\p{M}\p{N}_])[#@](?=[\p{L}\p{M}\p{N}_])`, "gu")

/**
 * Tags as they read in a sentence: the tags a post opens or closes with are
 * dropped ("@GBA_office @ICCCBengaluru This road…"); a tag mid-sentence keeps
 * its word ("waiting for a big #accident" → "a big accident").
 */
function stripHashtags(text) {
  return text.replace(EDGE_TAGS, "").replace(TAG_SIGIL, "").replace(/^[\s,&;:|-]+/, "")
}

/**
 * The stored headline: entities decoded, emoji removed, fancy letters made
 * plain, publisher tag and hashtag/mention clutter dropped, capped at 200
 * characters.
 */
export function cleanHeadline(title, source) {
  const text = stripHashtags(
    stripPublisherTag(plainLetters(stripEmoji(decodeEntities(title))), source)
      .replace(KNOWN_OUTLET_TAG, "")
      .replace(/\s*[-|]\s*$/, ""),
  )
    .replace(/\s{2,}/g, " ")
    .trim()
  return Array.from(text).slice(0, 200).join("").trim()
}

// ─── Classification ─────────────────────────────────────────────

/** Severity per category. Red is for money, safety, representatives and power. */
export const CATEGORY_SEVERITY = {
  "PUBLIC MONEY": "red",
  "CONTRACTORS": "red",
  "ELECTED REPS": "red",
  "ROAD SAFETY": "red",
  "POWER": "red",
  "FLOODING": "yellow",
  "WATER": "yellow",
  "WASTE": "yellow",
  "ENVIRONMENT": "yellow",
  "BUDGET": "yellow",
}

/**
 * Keywords, matched as substrings of the lowercased text so hashtags and
 * handles count ("#BengaluruPotholes", "@NammaBESCOM"). These are the route's
 * original lists plus FLOODING. Object order breaks ties: FLOODING sits after
 * the water and waste stories it overlaps and ahead of the power cuts rain
 * causes.
 */
const CATEGORY_KEYWORDS = {
  "PUBLIC MONEY": ["bbmp scam", "bbmp fraud", "crore misuse", "crore irregularit", "siphon", "fake bill", "ghost worker", "pourakarmika scam", "embezzl", "misappropriat", "lokayukta raid", "acb raid", "ed raid bbmp", "corruption bbmp", "gba scam"],
  "ROAD SAFETY": ["pothole", "road death", "road accident", "pedestrian death", "pedestrian killed", "road fatality", "road crash", "cave in", "cave-in", "road damage", "footpath broken", "signal broken"],
  "CONTRACTORS": ["kridl", "blacklisted contractor", "contractor scam", "tender scam", "4(g)", "without tender", "contractor fraud", "bbmp contractor"],
  "ENVIRONMENT": ["lake encroach", "lake pollut", "sewage", "untreated sewage", "lake dead fish", "bellandur foam", "kspcb action", "ngt bengaluru", "tree fell", "tree cut illegal", "sewage overflow"],
  "BUDGET": ["bbmp budget", "gba budget", "fund unutilized", "budget allocation", "unspent fund"],
  "ELECTED REPS": ["mla criminal", "mla arrested", "corporator arrested", "mla assets", "mla attendance", "corporator complaint"],
  "WATER": ["bwssb", "water shortage", "water crisis", "cauvery water", "borewell dry", "water tanker", "water supply", "water problem", "water cut"],
  "WASTE": ["garbage", "waste management", "landfill", "solid waste", "garbage contractor", "waste pickup", "trash"],
  "FLOODING": ["flood", "waterlog", "water log", "water-log", "inundat", "submerged", "stormwater drain", "storm water drain", "storm-water drain", "rajakaluve", "desilt", "de-silt", "overflowing drain"],
  "POWER": ["bescom", "power cut", "power outage", "electricity", "transformer"],
}

// Common words ("rain" is inside "drain", "dead" inside "deadline"), so these
// match whole words only.
const wordRegex = term => new RegExp(`(?<![a-z0-9])(?:${term})(?![a-z0-9])`, "i")

/** Someone was hurt. Keeps a rain story with potholes in ROAD SAFETY. */
const HARM = ["accidents?", "killed", "died", "dies", "deaths?", "dead", "injur\\w*", "fatal\\w*", "skid\\w*", "narrow escape", "fell into", "run over", "rammed", "crushed", "lost (?:her|his|their) li(?:fe|ves)"].map(wordRegex)

/** Weather. Never a category on its own. */
const WEATHER = ["rain\\w*", "showers?", "drizzl\\w*", "downpours?", "thunder\\w*", "monsoons?", "imd", "weather", "forecasts?", "cyclones?", "(?:yellow|orange|red) alert", "heat ?waves?", "temperatures?", "hailstorms?", "lightning", "cloudbursts?"].map(wordRegex)

/** Mathematical bold/italic letters (X's "fancy text") → plain letters. */
export function plainLetters(text) {
  return String(text ?? "").replace(/[\u{1D400}-\u{1D7FF}]/gu, c => c.normalize("NFKC"))
}

/**
 * Pick the civic category for an item, or null when it is not a civic story.
 * Each keyword found anywhere in title + description scores 1; the highest
 * score wins.
 *
 * @param {string} title
 * @param {string} [description]
 * @returns {string | null}
 */
export function classifyPulse(title, description = "") {
  const text = plainLetters(stripEmoji(decodeEntities(`${title} ${description}`))).toLowerCase()

  const scores = new Map(Object.entries(CATEGORY_KEYWORDS).map(([category, keywords]) => [category, keywords.filter(kw => text.includes(kw)).length]))

  // A rain story about flooded roads is a flooding story even when it
  // mentions potholes. It stays ROAD SAFETY only if someone was hurt.
  const rain = WEATHER.some(r => r.test(text))
  const hurt = HARM.some(r => r.test(text))
  if (rain && scores.get("FLOODING") > 0 && !hurt) scores.set("ROAD SAFETY", 0)

  let best = null
  let bestScore = 0
  for (const [category, score] of scores) {
    if (score > bestScore) { best = category; bestScore = score }
  }
  return best
}

/** @param {string} category */
export function severityFor(category) {
  return CATEGORY_SEVERITY[category] ?? "yellow"
}

// ─── RSS ────────────────────────────────────────────────────────

const unwrapCdata = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")

function tagText(block, tag) {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`))
  return m ? unwrapCdata(m[1]) : ""
}

/**
 * Parse RSS 2.0 `<item>`s. Keeps Google News's `<source url>` attribution,
 * which is the only place the real publisher of a Google News item appears.
 *
 * @param {string} xml
 */
export function parseRssItems(xml) {
  const items = []
  for (const [, block] of String(xml ?? "").matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/g)) {
    const title = decodeEntities(stripTags(tagText(block, "title"))).replace(/\s+/g, " ").trim()
    if (!title) continue
    const sourceTag = block.match(/<source(\s[^>]*)?>([\s\S]*?)<\/source>/)
    items.push({
      title,
      description: descriptionText(tagText(block, "description")),
      link: decodeEntities(tagText(block, "link")).trim(),
      pubDate: tagText(block, "pubDate").trim(),
      source: sourceTag
        ? {
            name: decodeEntities(unwrapCdata(sourceTag[2])).trim(),
            url: decodeEntities(sourceTag[1]?.match(/url="([^"]*)"/)?.[1] ?? "").trim(),
          }
        : null,
    })
  }
  return items
}

// ─── Item → fact ────────────────────────────────────────────────

const X_SEARCH_PAGE = /Results on X\s*\|\s*Live Posts/i

/** Headlines shorter than this are account names or fragments, not stories. */
export const MIN_HEADLINE_LENGTH = 30

const alnum = s => s.replace(/[#@]\w+/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")

/**
 * Every label for one feed item: category (null when it is not a civic
 * story), severity, headline, detail and source. Pure; the caller adds
 * city_id, dedup_key, dates and flags.
 *
 * @param {{ title: string, description?: string, link: string, source?: { name?: string, url?: string } | null }} item
 */
export function labelPulseItem(item) {
  const untagged = stripPublisherTag(plainLetters(stripEmoji(decodeEntities(item.title))), item.source)
  const description = plainLetters(descriptionText(item.description))
  const category = classifyPulse(untagged, description)

  // Google News descriptions only repeat the title and publisher.
  const [d, t] = [alnum(description), alnum(untagged)]
  const repeatsTitle = d.includes(t.slice(0, 40)) || t.includes(d.slice(0, 40))

  return {
    category,
    severity: category ? severityFor(category) : null,
    headline: cleanHeadline(item.title, item.source),
    detail: description && !repeatsTitle ? Array.from(description).slice(0, 500).join("") : null,
    source_name: sourceName(item),
    source_url: String(item.link ?? "").trim(),
  }
}

/**
 * Label one feed item for ingestion, or say why it is skipped.
 *
 * @param {{ title: string, description?: string, link: string, source?: { name?: string, url?: string } | null }} item
 */
export function buildPulseFact(item) {
  if (!hostOf(item.link)) return { skip: "no-link" }
  // X search-result pages ("#tag" - Results on X | Live Posts & Updates) are not posts.
  if (X_SEARCH_PAGE.test(decodeEntities(item.title))) return { skip: "search-page" }
  const labels = labelPulseItem(item)
  if (!labels.category) return { skip: "not-civic" }
  if (labels.headline.length < MIN_HEADLINE_LENGTH) return { skip: "too-short" }
  return { fact: labels }
}
