/**
 * Unit tests for pulse-ingest.mjs — CityPulse category, source and headline
 * labelling — and the one-off relabel in scripts/cleanup-pulse-labels.mjs.
 *
 * Fixtures are real items from the ticker and the live feeds (Sept 2026).
 *
 * Run: node --test --experimental-strip-types tests/pulse-ingest.test.mjs
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  buildPulseFact,
  classifyPulse,
  cleanHeadline,
  parseRssItems,
  severityFor,
  sourceName,
  stripEmoji,
} from "../apps/web/lib/pulse-ingest.mjs"
import { planRow, recoverPublisher } from "../scripts/cleanup-pulse-labels.mjs"

const GN = "https://news.google.com/rss/articles/CBMiVEFVX3lxTE1uSHV1bGJwX0hHLXM2RXNUYzBRWk1ZNjlhRWF5Wm1CZHJwVkg4NC0xVWJQeC0zMmhZT2lhcS1ibDVZYzhmbzRuUkpOT0ZZWVdwY3ByeA?oc=5"
const EMOJI = /\p{Extended_Pictographic}/u

// ─── Classification ─────────────────────────────────────────────

test("a rain story about flooded roads is FLOODING, not ROAD SAFETY (the ticker bug)", () => {
  const headline = "Today’s Bengaluru rain: Evening showers. Same flooded roads. Same crater potholes. Brand Bengaluru: lights, slogans, “image.” One shower later: Broken Bengaluru."
  assert.equal(classifyPulse(headline), "FLOODING")
  assert.equal(severityFor("FLOODING"), "yellow")
})

test("potholes in the rain stay ROAD SAFETY when someone was hurt", () => {
  assert.equal(classifyPulse("A biker had a narrow escape after his motorcycle fell into a rainwater-filled pothole near Bengaluru’s Gunjur"), "ROAD SAFETY")
  assert.equal(classifyPulse("Rain-hit Bengaluru: woman injured after scooter skids on waterlogged pothole on Varthur Road"), "ROAD SAFETY")
})

test("potholes without rain are ROAD SAFETY", () => {
  assert.equal(classifyPulse("Techie develops AI app to identify potholes"), "ROAD SAFETY")
  // "drain" is not "rain": no weather here, so the pothole leads
  assert.equal(classifyPulse("Dangerous pothole above the storm water drain near SMV Layout 1st Block"), "ROAD SAFETY")
})

test("weather on its own is not a civic fact", () => {
  assert.equal(classifyPulse("IMD issues yellow alert as heavy rain and thunderstorms likely in Bengaluru"), null)
  assert.equal(classifyPulse("Bengaluru weather: cloudy skies, temperature to dip to 19°C"), null)
})

test("a power cut is POWER, whatever the weather and whichever search found it", () => {
  assert.equal(classifyPulse("Is there any solution for Power Cut ?"), "POWER")
  assert.equal(classifyPulse("Hardly rained here but @NammaBESCOM as usual power cut near 2nd Hutchins road"), "POWER")
  assert.equal(classifyPulse("BESCOM Power Cut Today: Areas In Bengaluru, Other Karnataka Districts To Face Power Outage Amid Rainfall Alert"), "POWER")
  assert.equal(severityFor("POWER"), "red")
})

test("a monsoon water-supply story is WATER, not FLOODING", () => {
  assert.equal(classifyPulse("Poor monsoon could trigger drinking water shortage in Bengaluru, BWSSB warns"), "WATER")
})

test("hashtags, handles and fancy letters still count as keywords", () => {
  assert.equal(classifyPulse("Every road here is a crater #BengaluruPotholes"), "ROAD SAFETY")
  assert.equal(classifyPulse("𝐁𝐖𝐒𝐒𝐁 𝐰𝐚𝐭𝐞𝐫 𝐬𝐮𝐩𝐩𝐥𝐲 disruption tomorrow"), "WATER")
})

test("non-civic stories get no category", () => {
  assert.equal(classifyPulse("Kannada cinema veteran Anant Nag conferred Dadasaheb Phalke Award"), null)
})

// ─── Source naming ──────────────────────────────────────────────

test("a Google News link is credited to its publisher via Google News, never an X/ search label", () => {
  assert.equal(sourceName({ link: GN, source: { name: "x.com", url: "https://x.com" } }), "X via Google News")
  assert.equal(sourceName({ link: GN, source: { name: "Deccan Herald", url: "https://www.deccanherald.com" } }), "Deccan Herald via Google News")
  assert.equal(sourceName({ link: GN, source: { name: "bangaloremirror.indiatimes.com", url: "https://bangaloremirror.indiatimes.com" } }), "Bangalore Mirror via Google News")
  assert.equal(sourceName({ link: GN, source: null }), "Google News")
})

test("a direct link is credited to the publisher its host names", () => {
  assert.equal(sourceName({ link: "https://www.thenewsminute.com/karnataka/bengaluru-hebbal-tunnel", source: null }), "The News Minute")
  assert.equal(sourceName({ link: "https://citizenmatters.in/protect-wetlands/", source: null }), "Citizen Matters")
  assert.equal(sourceName({ link: "https://x.com/NammaBESCOM/status/1", source: null }), "X")
  assert.equal(sourceName({ link: "https://www.goodreturns.in/news/bescom-power-cut.html", source: null }), "goodreturns.in")
})

test("source_name only says X when the link goes to X, and always says Google News when it goes there", () => {
  const links = [GN, "https://x.com/a/status/1", "https://twitter.com/a/status/1", "https://www.thenewsminute.com/a", "https://example.org/a"]
  const sources = [null, { name: "x.com", url: "https://x.com" }, { name: "X" }, { name: "Deccan Herald", url: "https://www.deccanherald.com" }, { name: "Google News", url: "https://news.google.com" }]
  for (const link of links) {
    for (const source of sources) {
      const label = sourceName({ link, source })
      const host = new URL(link).hostname
      assert.doesNotMatch(label, /^X\s*\//, `${link} + ${JSON.stringify(source)} → ${label}`)
      if (host === "news.google.com") assert.match(label, /(^| via )Google News$/, label)
      if (label === "X") assert.match(host, /(^|\.)(x|twitter)\.com$/, `${label} for ${link}`)
    }
  }
})

// ─── Headlines ──────────────────────────────────────────────────

test("emoji are stripped; text symbols, Indic joiners and the words stay", () => {
  const raw = "🚨 BENGALURU ENGINEER TURNS AI INTO A POTHOLE-FIGHTING TOOL! 🤖🛣️ A Bengaluru-based engineer"
  assert.equal(stripEmoji(raw), "BENGALURU ENGINEER TURNS AI INTO A POTHOLE-FIGHTING TOOL! A Bengaluru-based engineer")
  assert.equal(stripEmoji("🇮🇳 Ward 1️⃣ gets ₹5 crore → roads 👍🏽 👨‍👩‍👧 ©BBMP™"), "Ward 1 gets ₹5 crore → roads ©BBMP™")
  // ZWNJ inside a Kannada word shapes it; it must survive
  assert.equal(stripEmoji("ಬೆಂಗಳೂರಿಗರಿಗೆ ಗುಡ್‌ನ್ಯೂಸ್ 💧"), "ಬೆಂಗಳೂರಿಗರಿಗೆ ಗುಡ್‌ನ್ಯೂಸ್")
  assert.doesNotMatch(cleanHeadline("💧 Water cut in Jayanagar tomorrow ✅⚠️"), EMOJI)
})

test("headline cleanup removes publisher tags and tag clutter without eating words", () => {
  const inshorts = { name: "Inshorts", url: "https://inshorts.com" }
  assert.equal(cleanHeadline("Bengaluru water cut on August 28 | Tap to know more | Inshorts - Inshorts", inshorts), "Bengaluru water cut on August 28 | Tap to know more")
  assert.equal(cleanHeadline("Techie develops AI app to identify potholes - The Hans India", { name: "The Hans India" }), "Techie develops AI app to identify potholes")
  assert.equal(cleanHeadline("BWSSB &amp; BMRCL should finish road works - x.com"), "BWSSB & BMRCL should finish road works")
  assert.equal(
    cleanHeadline("@GBA_office @ICCCBengaluru There's a big uncovered pothole at palace ground gate no.07 #Bengaluru #BBMP"),
    "There's a big uncovered pothole at palace ground gate no.07",
  )
  assert.equal(cleanHeadline("BBMP is waiting for some big #accident to happen"), "BBMP is waiting for some big accident to happen")
  assert.equal(cleanHeadline("𝐓𝐮𝐫𝐧 𝐨𝐟𝐟 𝐭𝐡𝐞 𝐭𝐚𝐩 when it is not needed"), "Turn off the tap when it is not needed")
})

// ─── RSS → fact ─────────────────────────────────────────────────

const GOOGLE_NEWS_XML = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>
<item><title>🚨Is there any solution for Power Cut ? BESCOM &amp; GBA silent - x.com</title><link>${GN}</link><guid isPermaLink="false">CBMi</guid><pubDate>Tue, 15 Sep 2026 13:36:26 GMT</pubDate><description>&lt;a href="${GN}" target="_blank"&gt;🚨Is there any solution for Power Cut ? BESCOM &amp;amp; GBA silent&lt;/a&gt;&amp;nbsp;&amp;nbsp;&lt;font color="#6f6f6f"&gt;x.com&lt;/font&gt;</description><source url="https://x.com">x.com</source></item>
<item><title>"#GarbageFee" - Results on X | Live Posts &amp; Updates - x.com</title><link>${GN}</link><pubDate>Tue, 15 Sep 2026 10:00:00 GMT</pubDate><description></description><source url="https://x.com">x.com</source></item>
</channel></rss>`

const WORDPRESS_XML = `<rss version="2.0"><channel><item>
		<title>Protect wetlands and prevent flooding: Citizen&#8217;s Charter for Bellandur</title>
		<link>https://citizenmatters.in/protect-wetlands-prevent-flooding/</link>
		<pubDate>Tue, 15 Sep 2026 05:36:17 +0000</pubDate>
		<description><![CDATA[<p>Residents demand that encroached
stormwater drains be cleared before the next monsoon.</p>]]></description>
</item></channel></rss>`

test("parses Google News items with their <source> publisher and decoded text", () => {
  const [item] = parseRssItems(GOOGLE_NEWS_XML)
  assert.equal(item.title, "🚨Is there any solution for Power Cut ? BESCOM & GBA silent - x.com")
  assert.equal(item.link, GN)
  assert.deepEqual(item.source, { name: "x.com", url: "https://x.com" })
  assert.equal(item.description, "Is there any solution for Power Cut ? BESCOM & GBA silent x.com")
})

test("parses WordPress items with multi-line CDATA descriptions", () => {
  const [item] = parseRssItems(WORDPRESS_XML)
  assert.equal(item.title, "Protect wetlands and prevent flooding: Citizen’s Charter for Bellandur")
  assert.equal(item.description, "Residents demand that encroached stormwater drains be cleared before the next monsoon.")
  assert.equal(item.source, null)
})

test("an X post found through a Google News search becomes a correctly labelled fact", () => {
  const [item] = parseRssItems(GOOGLE_NEWS_XML)
  assert.deepEqual(buildPulseFact(item), {
    fact: {
      category: "POWER",
      severity: "red",
      headline: "Is there any solution for Power Cut ? BESCOM & GBA silent",
      detail: null,
      source_name: "X via Google News",
      source_url: GN,
    },
  })
})

test("a publisher's own feed item keeps its summary as detail", () => {
  const { fact } = buildPulseFact(parseRssItems(WORDPRESS_XML)[0])
  assert.equal(fact.category, "FLOODING")
  assert.equal(fact.source_name, "Citizen Matters")
  assert.equal(fact.detail, "Residents demand that encroached stormwater drains be cleared before the next monsoon.")
})

test("skips X search-result pages, non-civic items, fragments and items without a link", () => {
  assert.deepEqual(buildPulseFact(parseRssItems(GOOGLE_NEWS_XML)[1]), { skip: "search-page" })
  assert.deepEqual(buildPulseFact({ title: "Kannada cinema veteran Anant Nag conferred Dadasaheb Phalke Award", link: "https://www.thenewsminute.com/a" }), { skip: "not-civic" })
  assert.deepEqual(buildPulseFact({ title: "#BESCOM power cut 😡", link: GN, source: { name: "x.com" } }), { skip: "too-short" })
  assert.deepEqual(buildPulseFact({ title: "BESCOM power cut across Jayanagar for six hours today", link: "" }), { skip: "no-link" })
})

// ─── Cleanup of stored rows ─────────────────────────────────────

const LEGACY_DETAIL = `&lt;a href="${GN}" target="_blank"&gt;Is there any solution for Power Cut ?&lt;/a&gt;&amp;nbsp;&amp;nbsp;&lt;font color="#6f6f6f"&gt;x.com&lt;/font&gt;`

test("recovers an old row's publisher from detail, the X search, or the title tag", () => {
  const row = { headline: "Is there any solution for Power Cut ?", source_url: GN }
  assert.deepEqual(recoverPublisher({ ...row, source_name: "X/Pothole", detail: LEGACY_DETAIL }).source, { name: "x.com" })
  assert.deepEqual(recoverPublisher({ ...row, source_name: "X/Pothole", detail: LEGACY_DETAIL.slice(0, 120) }).source, { name: "X", url: "https://x.com" })
  assert.deepEqual(recoverPublisher({ ...row, source_name: "Google News BBMP", detail: null, headline: "Bengaluru Electricity Bill Update! Power Bills May Rise - Goodreturns" }).source, { name: "Goodreturns" })
  assert.equal(recoverPublisher({ ...row, source_name: "Google News BBMP", detail: null }).source, null)
  assert.equal(recoverPublisher({ ...row, source_name: "The News Minute", source_url: "https://www.thenewsminute.com/a" }).source, null)
})

test("the power cut filed under X/Pothole is relabelled, and a second pass changes nothing", () => {
  const row = {
    id: 1968, city_id: "bengaluru", category: "POWER", severity: "red", is_active: true, is_editorial: false,
    headline: "Is there any solution for Power Cut ?", detail: LEGACY_DETAIL,
    source_name: "X/Pothole", source_url: GN, dedup_key: "is there any solution for power cut",
  }
  const { next } = planRow(row)
  assert.deepEqual(next, { source_name: "X via Google News" })
  assert.deepEqual(planRow({ ...row, ...next }).next, {})
})

test("the rain story is re-filed as FLOODING with emoji and entities cleaned, idempotently", () => {
  const row = {
    id: 1967, city_id: "bengaluru", category: "ROAD SAFETY", severity: "red", is_active: true, is_editorial: false,
    headline: "Today’s Bengaluru rain: Evening showers. Same flooded roads. Same crater potholes 🌧️ &amp; no fix",
    detail: null, source_name: "X/Pothole", source_url: GN, dedup_key: "x",
  }
  const { next } = planRow(row)
  assert.deepEqual(next, {
    source_name: "X via Google News",
    headline: "Today’s Bengaluru rain: Evening showers. Same flooded roads. Same crater potholes & no fix",
    category: "FLOODING",
    severity: "yellow",
  })
  assert.deepEqual(planRow({ ...row, ...next }).next, {})
})
