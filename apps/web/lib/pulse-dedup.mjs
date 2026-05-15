/**
 * pulse-dedup.mjs — canonical headline normalization for CityPulse dedup.
 *
 * SINGLE SOURCE OF TRUTH. Imported by BOTH:
 *   - apps/web/app/api/refresh-pulse/route.ts  (live pipeline; writes dedup_key)
 *   - scripts/migrate-pulse-dedup.mjs          (backfills dedup_key for old rows)
 *
 * The DB enforces UNIQUE (dedup_key, city_id). If the runtime key and the
 * backfilled key ever diverged, the constraint would mis-collapse or stop
 * collapsing — so this MUST be the only place the rule is defined. Pure,
 * deterministic, idempotent (same headline → same key, always).
 *
 * Plain .mjs (not .ts) so the CI migration script can `node`-import it
 * directly with no build step. Types live in pulse-dedup.d.ts.
 */

/** How many significant tokens form the content signature. */
export const SIGNATURE_TOKENS = 10

/**
 * Below this many significant tokens we DON'T trust the signature (too little
 * content to discriminate), so we fall back to a near-exact key instead of
 * risking a false merge of two genuinely different short headlines.
 */
export const MIN_SIGNIFICANT_TOKENS = 4

/**
 * Grammatical function words + pure news-chrome noise. Deliberately small and
 * conservative: we strip only tokens that carry ~zero discriminating signal.
 * We do NOT strip place/outlet content words ("bengaluru", "india", "times")
 * from the body — that would risk merging distinct stories. Outlet *tags* are
 * removed structurally by the trailing-segment rule below instead.
 */
export const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "at", "for",
  "from", "by", "with", "as", "is", "are", "was", "were", "be", "been", "being",
  "that", "this", "these", "those", "it", "its", "into", "over", "amid", "after",
  "says", "said", "say", "new", "latest", "update", "updated", "updates",
  "news", "video", "watch", "photos", "photo", "report", "reports", "live",
])

/**
 * Strip a trailing outlet / section tag. Google News titles are
 * "<Story> - <Outlet>"; many feeds also use "<Story> | <Section>". The tag is
 * always the LAST " - " / " | " segment and is short. We only drop it when the
 * head is still substantial, so a mid-sentence dash never guts the headline.
 */
function stripTrailingTag(s) {
  for (const delim of [" | ", " - "]) {
    const idx = s.lastIndexOf(delim)
    if (idx <= 0) continue
    const head = s.slice(0, idx).trim()
    const tail = s.slice(idx + delim.length).trim()
    const headWords = head.split(/\s+/).filter(Boolean).length
    const tailWords = tail.split(/\s+/).filter(Boolean).length
    if (headWords >= 4 && tailWords > 0 && tailWords <= 5) s = head
  }
  return s
}

/** Collapse to lowercase alphanumeric words (drops emoji, punctuation, Kannada). */
function alnumWords(s) {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")  // URLs
    .replace(/[#@]\w+/g, " ")         // #hashtags / @mentions
    .replace(/[^a-z0-9 ]+/g, " ")     // anything else → space
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Derive the dedup key for a headline.
 *
 * lowercase → strip emoji/punctuation/URLs/tags → drop stopwords →
 * first 10 significant tokens = content signature. Falls back to a
 * near-exact key when there is too little signal to safely collapse.
 *
 * @param {string} headline
 * @returns {string} stable, non-empty dedup key
 */
export function dedupKey(headline) {
  const raw = String(headline ?? "")
  const untagged = stripTrailingTag(raw)
  const cleaned = alnumWords(untagged)

  const significant = cleaned
    .split(" ")
    .filter(t => t.length > 1 && !STOPWORDS.has(t))

  if (significant.length >= MIN_SIGNIFICANT_TOKENS) {
    return significant.slice(0, SIGNATURE_TOKENS).join(" ")
  }

  // Too few significant tokens to trust a signature: use a near-exact key so
  // we never over-collapse short / non-English / atypical headlines.
  const exactish = alnumWords(raw).slice(0, 200)
  return exactish || raw.toLowerCase().trim().slice(0, 200) || "∅"
}
