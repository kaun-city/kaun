import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import type { CivicProject, CivicProjectMetric, CivicProjectRecord, CivicProjectSignal } from "@/lib/civic-projects"

export type ResearchOrigin = "kaun_record" | "published_research" | "recent_research" | "live_research"

export interface ResearchSource {
  title: string
  url: string
}

export interface ReusableResearchResult {
  answer: string
  sources: ResearchSource[]
  searched_at: string
  can_submit: boolean
  origin: ResearchOrigin
}

/** What the research endpoint returns: the result plus the exact question and, when proposable, a server signature. */
export interface ResearchResponse extends ReusableResearchResult {
  question: string
  signature?: string
}

const STOP_WORDS = new Set([
  "a", "about", "an", "and", "are", "as", "at", "be", "been", "can", "could", "did", "do", "does",
  "for", "from", "has", "have", "how", "i", "in", "is", "it", "me", "of", "on", "or", "our", "please",
  "project", "road", "should", "tell", "that", "the", "their", "there", "they", "this", "to", "was", "we",
  "were", "what", "when", "where", "which", "who", "why", "with", "would", "you",
])

const TERM_ALIASES: Record<string, string> = {
  builder: "contractor",
  company: "contractor",
  complete: "deadline",
  construction: "progress",
  completed: "deadline",
  completion: "deadline",
  finish: "deadline",
  finished: "deadline",
  finishing: "deadline",
  lawsuit: "court",
  contractors: "contractor",
  costs: "cost",
  deadlines: "deadline",
  delays: "delay",
  open: "deadline",
  opening: "deadline",
  paid: "payment",
  payments: "payment",
  penalise: "penalty",
  penalised: "penalty",
  penalize: "penalty",
  penalized: "penalty",
  penalties: "penalty",
  petition: "court",
  petitions: "court",
  price: "cost",
  properties: "property",
  ready: "deadline",
  records: "record",
  responsible: "agency",
  spent: "cost",
  tender: "contractor",
  vendor: "contractor",
}

/** Own-property lookup, so words such as "constructor" never resolve to Object.prototype members. */
function aliasOf(token: string): string {
  return Object.hasOwn(TERM_ALIASES, token) ? TERM_ALIASES[token] : token
}

/**
 * Project-accountability topics (compared after TERM_ALIASES). Generic civic
 * words such as "public", "record", "ward" or "government" are deliberately
 * absent: on their own they say nothing about this project.
 */
const ACCOUNTABILITY_TERMS = new Set([
  "acquisition", "agency", "approval", "approved", "audit", "bill", "bills", "blacklist", "blacklisted", "budget",
  "cabinet", "compensation", "contract", "contractor", "cost", "court", "crore", "deadline", "delay", "delayed",
  "demolition", "dpr", "elevated", "engineer", "estimate", "eviction", "extension", "extensions", "flyover", "fund",
  "funds", "inspection", "land", "legal", "litigation", "milestone", "milestones", "overrun", "payment", "penalty",
  "progress", "property", "rti", "sanction", "sanctioned", "scope", "stay", "tdr", "timeline", "widening",
])

const ACCOUNTABILITY_PHRASES = [
  "detailed project report", "land acquisition", "latest update", "progress report", "project status", "status update",
  "tree felling", "utility shifting", "work order",
]

/** Words in project names that do not identify a specific project on their own. */
const GENERIC_PROJECT_WORDS = new Set([
  "authority", "bangalore", "bengaluru", "board", "central", "city", "corporation", "corridor", "department",
  "development", "east", "elevated", "greater", "karnataka", "limited", "ltd", "north", "south", "ward", "west",
  "widening",
])

const CLEARLY_OUT_OF_SCOPE = new Set([
  "astrology", "bitcoin", "celebrity", "cricket", "crypto", "cryptocurrency", "dating", "essay", "football",
  "horoscope", "ipl", "joke", "jokes", "lottery", "lyrics", "movie", "movies", "poem", "recipe", "sensex", "shopping",
  "stock", "stocks", "trades", "trading", "vacation", "weather",
])

const OUT_OF_SCOPE_SUBJECT_PHRASES = ["cost of living", "share market", "share price", "stock market", "stock price"]

const PROMPT_ATTACK_PHRASES = [
  "ignore previous", "ignore your instructions", "reveal prompt", "system prompt", "developer message", "jailbreak",
  "act as an", "act as a", "write malware",
]

const OUT_OF_SCOPE_PHRASES = [
  "give me a recipe", "plan a trip", "tell me a joke", "write a poem", "write an essay", "write code",
]

export function normalizeProjectQuestion(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9₹\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function questionTokens(value: string): string[] {
  return [...new Set(normalizeProjectQuestion(value)
    .split(/[\s-]+/)
    .filter(token => token.length > 1 && !STOP_WORDS.has(token))
    .map(aliasOf))]
}

// ---------------------------------------------------------------------------
// Reuse matching. A cached or published answer is only reused for a question
// that is near-identical, never for one that merely shares a keyword.
// ---------------------------------------------------------------------------

export const PROJECT_QUESTION_REUSE_THRESHOLD = 0.8
const MIN_SHARED_CONTENT_TOKENS = 3
const INTERROGATIVES = new Set(["how", "what", "when", "where", "which", "who", "whom", "whose", "why"])
const NEGATIONS = new Set(["never", "no", "nor", "not", "without"])
const FILLER_WORDS = new Set(["a", "an", "are", "is", "kindly", "please", "s", "the"])

function stemToken(token: string): string {
  if (/\d/.test(token)) return token
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`
  if (token.length > 3 && token.endsWith("s") && !/(ss|us|is)$/.test(token)) return token.slice(0, -1)
  return token
}

function comparableWords(value: string): string[] {
  return normalizeProjectQuestion(value.replace(/n['’]t\b/gi, " not"))
    .split(/[\s-]+/)
    .filter(Boolean)
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every(token => b.has(token))
}

/**
 * 1 for the same question up to case, punctuation, articles and plurals; the
 * token-set Jaccard score when two longer questions are near-identical; 0
 * otherwise. Near-identical means at least three shared content words, a
 * Jaccard score of at least 0.8, and the same question words, negations and
 * numbers, so "who"/"why", "paid"/"not paid" and 2025/2026 never collapse.
 */
export function projectQuestionSimilarity(first: string, second: string): number {
  const a = comparableWords(first)
  const b = comparableWords(second)
  if (a.length === 0 || b.length === 0) return 0

  const compact = (words: string[]) => words.filter(word => !FILLER_WORDS.has(word)).map(stemToken).join(" ")
  if (compact(a) === compact(b)) return 1

  const kind = (words: string[], set: Set<string>) => new Set(words.filter(word => set.has(word)))
  if (!sameSet(kind(a, INTERROGATIVES), kind(b, INTERROGATIVES))) return 0
  if (!sameSet(kind(a, NEGATIONS), kind(b, NEGATIONS))) return 0
  const numbers = (words: string[]) => new Set(words.filter(word => /\d/.test(word)))
  if (!sameSet(numbers(a), numbers(b))) return 0

  const content = (words: string[]) => new Set(words
    .filter(word => word.length > 1 && !STOP_WORDS.has(word) && !INTERROGATIVES.has(word) && !NEGATIONS.has(word))
    .map(stemToken))
  const contentA = content(a)
  const contentB = content(b)
  const shared = [...contentA].filter(word => contentB.has(word)).length
  if (shared < MIN_SHARED_CONTENT_TOKENS) return 0
  const union = new Set([...contentA, ...contentB]).size
  const score = shared / union
  return score >= PROJECT_QUESTION_REUSE_THRESHOLD ? score : 0
}

// ---------------------------------------------------------------------------
// Scope gate. Live research costs a paid web search and this page names
// agencies and contractors, so a question must be about THIS project. It is in
// scope when it
//   1. names the project, its area, road or agency (Varthur, Gunjur, Kodi,
//      SH-35, KRDCL, "the elevated corridor", "the flyover"), or
//   2. points at the project ("the contractor", "this project", "the road",
//      "the deadline", "deadline extensions", "land acquisition") while asking
//      about an accountability topic.
// A topic word alone is never enough. A question that names a politician,
// party, or a person, place, company or project absent from the record is out
// of scope even when it also uses project words: politicians' records belong
// to other parts of Kaun, not to this desk.
// ---------------------------------------------------------------------------

const OFF_TOPIC_REASON = "Ask about this project’s work, agency, contractor, cost, deadlines, land, court record or public documents."

/** Generic nouns that name this project on their own, unless an unfamiliar word qualifies them ("hebbal flyover"). */
const PROJECT_NAME_NOUNS = new Set(["corridor", "flyover"])

/** After "the", "this" or "its", these nouns point at this project. Compared after plural stemming. */
const PROJECT_REFERENCE_NOUNS = new Set([
  "acquisition", "agency", "bill", "budget", "compensation", "completion", "construction", "contract", "contractor",
  "corridor", "cost", "court", "deadline", "delay", "dpr", "estimate", "extension", "flyover", "land", "milestone",
  "payment", "petition", "progress", "project", "road", "scope", "stretch", "tender", "timeline", "widening", "work",
])

const DETERMINERS = new Set(["its", "that", "the", "these", "this", "those"])
const ARTICLES = new Set(["a", "an", "its", "that", "the", "this"])

/** Words that can sit between a determiner and its noun without changing which project is meant. */
const PROJECT_DESCRIPTORS = new Set([
  "approved", "civil", "completion", "construction", "current", "delayed", "elevated", "entire", "estimated", "extended",
  "final", "high", "incomplete", "km", "lane", "latest", "main", "new", "official", "ongoing", "original", "overall",
  "pending", "planned", "proposed", "public", "reported", "revised", "sanctioned", "shifting", "stalled", "supreme",
  "total", "unfinished", "utility", "whole",
])

/** "the cost of living", "the deadline for filing taxes": after these, the reference only counts if the object is project vocabulary. */
const QUALIFYING_PREPOSITIONS = new Set(["at", "for", "in", "near", "of"])

/** People a project reference may be qualified by without leaving the project ("the cost for taxpayers"). */
const PROJECT_AUDIENCE_WORDS = new Set(["citizen", "commuter", "owner", "resident", "taxpayer", "traffic"])

/** Phrases that only make sense about a construction project, so they point at this one without a determiner. */
const PROJECT_ONLY_PHRASES = [
  "deadline extension", "deadline extensions", "detailed project report", "land acquisition", "tree felling",
  "utility shifting", "work order",
]

/** "Penalties", with or without "the", point at this project only beside delay, deadline, contractor or work vocabulary. */
const PENALTY_CONTEXT = new Set(["contractor", "deadline", "delay", "extension", "milestone", "work"])

/** Politicians, parties, elections and personal criminal records: never this desk's business. */
const POLITICAL_TERMS = new Set([
  "aap", "bjp", "cm", "congress", "constituency", "corporator", "councillor", "councilor", "criminal", "dcm", "election",
  "electoral", "jds", "legislator", "minister", "mla", "mlc", "mp", "mps", "neta", "party", "political", "politician", "vote",
  "voter",
])

/** Civic phrases that contain a political word without being political. */
const NON_POLITICAL_PHRASES = ["indian roads congress", "third party"]

/**
 * Lower-case backstop for names the capitalisation check cannot see (a
 * question typed in lower case, or one that opens with the name): other
 * cities and states, other Bengaluru projects, and companies not in the record.
 */
const OTHER_ENTITY_TERMS = new Set([
  "adani", "ahmedabad", "ambani", "bmrcl", "bombay", "calcutta", "chennai", "delhi", "dubai", "ejipura", "expressway",
  "goa", "gujarat", "hebbal", "hyderabad", "kerala", "kolkata", "london", "madras", "maharashtra", "mangalore",
  "mangaluru", "metro", "mumbai", "mysore", "mysuru", "paris", "pune", "reliance", "singapore", "telangana",
])

const OTHER_ENTITY_PHRASES = [
  "coastal road", "new york", "ring road", "silk board", "suburban rail", "tamil nadu", "tunnel road",
]

/** Everyday words a question may use or capitalise; none of them names a person, party, place or company. */
const COMMON_WORDS = new Set([
  ...STOP_WORDS,
  "according", "after", "again", "all", "also", "any", "anyone", "anything", "apart", "before", "being", "besides",
  "but", "by", "check", "compare", "dear", "describe", "does", "done", "even", "explain", "find", "first", "give", "had",
  "hello", "one", "second", "third", "three", "two",
  "hey", "hi", "if", "info", "information", "into", "its", "just", "kindly", "list", "long", "many", "may", "might",
  "more", "much", "must", "my", "near", "news", "no", "nor", "not", "now", "ok", "okay", "over", "regarding", "s",
  "sir", "so", "some", "status", "still", "summarise", "summarize", "thanks", "these", "those", "under", "update",
  "updates", "whether", "whom", "whose", "will", "yes", "yet", "your",
])

/** Capitalised words that are ordinary in a Bengaluru civic question: months, public bodies, courts, units. */
const CIVIC_CAPITALISED_WORDS = new Set([
  "apr", "april", "aug", "august", "authority", "bangalore", "bbmp", "bda", "bengaluru", "bescom", "bwssb", "cabinet",
  "cag", "chief", "commissioner", "corporation", "court", "cr", "crore", "dec", "december", "department", "deputy",
  "director", "dpr", "engineer", "executive", "feb", "february", "fir", "friday", "gba", "government", "govt", "green",
  "high", "india", "indian", "inr", "jan", "january", "jul", "july", "jun", "june", "karnataka", "kaun", "km", "lakh",
  "limited", "lokayukta", "ltd", "managing", "mar", "march", "md", "monday", "national", "ngt", "nov", "november",
  "oct", "october", "officer", "pil", "pwd", "rs", "rti", "saturday", "sep", "sept", "september", "sh", "state",
  "sunday", "supreme", "tdr", "thursday", "tribunal", "tuesday", "wednesday",
])

function spacedPhraseText(normalized: string): string {
  return ` ${normalized.replace(/-/g, " ")} `
}

function hasPhrase(spaced: string, phrase: string): boolean {
  return spaced.includes(` ${phrase} `)
}

function compactCodes(normalized: string): string {
  // "SH-35" and "sh 35" both become "sh35".
  return normalized.replace(/\b([a-z]{2,3})[\s-]+(\d{1,4})\b/g, "$1$2")
}

export function projectReferenceTerms(project: CivicProject): Set<string> {
  const text = [
    project.title,
    project.shortTitle,
    project.routeName,
    project.road,
    project.ownerAgency,
    ...project.affectedWardNames,
  ].join(" ")
  const words = [
    ...questionTokens(text),
    ...compactCodes(normalizeProjectQuestion(text)).split(/[\s-]+/),
  ]
  return new Set(words.filter(word =>
    word.length > 2 && !/^\d+$/.test(word) && !STOP_WORDS.has(word) && !GENERIC_PROJECT_WORDS.has(word)))
}

const projectVocabularies = new WeakMap<CivicProject, Set<string>>()

/** Every word in the project record plus everyday civic words, used to tell ordinary capitals from unfamiliar names. */
function projectVocabulary(project: CivicProject): Set<string> {
  const cached = projectVocabularies.get(project)
  if (cached) return cached
  const recordText = [
    project.title, project.shortTitle, project.routeName, project.projectType, project.road, project.statusNote,
    project.ownerAgency, project.ownerAgencyShort, project.nextTarget, project.wardSignalNote, project.summary,
    project.alert, ...project.affectedWardNames, ...project.affectedWardLabels, ...project.suggestedQuestions,
    ...project.metrics.flatMap(metric => [metric.label, metric.value, metric.note]),
    ...project.records.flatMap(record => [record.dateLabel, record.title, record.body]),
    ...project.signals.flatMap(signal => [signal.label, signal.value, signal.explanation]),
    ...project.sources.flatMap(source => [source.title, source.publisher]),
  ].join(" ")
  const vocabulary = new Set([
    ...comparableWords(recordText).flatMap(word => [word, stemToken(word)]),
    ...COMMON_WORDS, ...INTERROGATIVES, ...NEGATIONS, ...FILLER_WORDS, ...CIVIC_CAPITALISED_WORDS,
    ...ACCOUNTABILITY_TERMS, ...PROJECT_REFERENCE_NOUNS, ...PROJECT_DESCRIPTORS, ...Object.keys(TERM_ALIASES),
  ])
  projectVocabularies.set(project, vocabulary)
  return vocabulary
}

/**
 * Capitalised words in the question that appear nowhere in the project record
 * or everyday civic vocabulary: "Paris", "Adani", "Mahadevapura", "NHAI". The
 * first word of a sentence counts too unless it looks like an ordinary opener
 * ("Considering…", "Reportedly…"). Title Case and ALL-CAPS questions carry no
 * capitalisation signal, so they rely on the lower-case lists instead.
 */
function unfamiliarNames(project: CivicProject, question: string): string[] {
  const vocabulary = projectVocabulary(project)
  const known = (word: string) => {
    const lower = word.toLowerCase()
    return vocabulary.has(lower) || vocabulary.has(stemToken(lower))
  }
  const names: string[] = []
  let considered = 0
  let capitalised = 0
  for (const sentence of question.normalize("NFKD").split(/[.?!;:\n]+/)) {
    const words = sentence.match(/[A-Za-z][A-Za-z0-9]*/g) ?? []
    words.forEach((word, index) => {
      if (word.length < 2) return
      const isCapitalised = /^[A-Z]/.test(word)
      if (index > 0) {
        considered += 1
        if (isCapitalised) capitalised += 1
      }
      if (!isCapitalised || known(word)) return
      if (index === 0 && /(ing|ly|ed)$/i.test(word)) return
      names.push(word)
    })
  }
  if (considered >= 3 && capitalised / considered >= 0.6) return []
  return names
}

function isFamiliarModifier(word: string, projectTerms: Set<string>): boolean {
  const stem = stemToken(word)
  return /\d/.test(word)
    || COMMON_WORDS.has(word) || INTERROGATIVES.has(word) || NEGATIONS.has(word) || DETERMINERS.has(word)
    || PROJECT_DESCRIPTORS.has(word) || projectTerms.has(word)
    || PROJECT_REFERENCE_NOUNS.has(stem) || ACCOUNTABILITY_TERMS.has(aliasOf(word)) || ACCOUNTABILITY_TERMS.has(stem)
}

function isProjectContextWord(word: string, projectTerms: Set<string>): boolean {
  const stem = stemToken(word)
  return /\d/.test(word) || projectTerms.has(word) || PROJECT_DESCRIPTORS.has(word)
    || PROJECT_NAME_NOUNS.has(stem) || PROJECT_REFERENCE_NOUNS.has(stem) || PROJECT_AUDIENCE_WORDS.has(stem)
    || ACCOUNTABILITY_TERMS.has(aliasOf(word)) || ACCOUNTABILITY_TERMS.has(stem)
}

/** Rule 1: Varthur, Gunjur, Kodi, SH-35, KRDCL, or "corridor"/"flyover" not qualified by an unfamiliar word. */
function namesThisProject(words: string[], compactWords: string[], projectTerms: Set<string>): boolean {
  if ([...words, ...compactWords].some(word => projectTerms.has(word))) return true
  return words.some((word, index) => PROJECT_NAME_NOUNS.has(stemToken(word))
    && (index === 0 || isFamiliarModifier(words[index - 1], projectTerms)))
}

/** Rule 2's reference: "the contractor", "this project", "its deadline", "deadline extensions", "land acquisition". */
function pointsAtThisProject(words: string[], spaced: string, tokens: string[], projectTerms: Set<string>): boolean {
  if (PROJECT_ONLY_PHRASES.some(phrase => hasPhrase(spaced, phrase))) return true
  const stems = words.map(stemToken)
  if (tokens.includes("penalty") && [...tokens, ...stems].some(word => PENALTY_CONTEXT.has(word))) return true

  return words.some((word, index) => {
    if (!DETERMINERS.has(word)) return false
    for (let next = index + 1; next < Math.min(words.length, index + 4); next += 1) {
      if (PROJECT_REFERENCE_NOUNS.has(stems[next])) {
        if (!QUALIFYING_PREPOSITIONS.has(words[next + 1] ?? "")) return true
        let object = next + 2
        while (ARTICLES.has(words[object] ?? "")) object += 1
        return words[object] === undefined || isProjectContextWord(words[object], projectTerms)
      }
      const candidate = words[next]
      const describesProject = PROJECT_DESCRIPTORS.has(candidate) || /\d/.test(candidate) || projectTerms.has(candidate)
        || ACCOUNTABILITY_TERMS.has(aliasOf(candidate))
      if (!describesProject) return false
    }
    return false
  })
}

function asksAboutAccountability(tokens: string[], spaced: string): boolean {
  return tokens.some(token => ACCOUNTABILITY_TERMS.has(token) || ACCOUNTABILITY_TERMS.has(stemToken(token)))
    || ACCOUNTABILITY_PHRASES.some(phrase => hasPhrase(spaced, phrase))
}

/** Politicians and parties, or a person, place, company or project that is not in this record. */
function namesSomeoneElse(project: CivicProject, question: string, spaced: string): boolean {
  const withoutCivicPhrases = NON_POLITICAL_PHRASES.reduce((text, phrase) => text.split(` ${phrase} `).join(" "), spaced)
  const words = withoutCivicPhrases.trim().split(/\s+/)
  if (words.some(word => POLITICAL_TERMS.has(word) || POLITICAL_TERMS.has(stemToken(word)) || OTHER_ENTITY_TERMS.has(word))) {
    return true
  }
  if (OTHER_ENTITY_PHRASES.some(phrase => hasPhrase(spaced, phrase))) return true
  const questionWithoutCivicPhrases = NON_POLITICAL_PHRASES.reduce(
    (text, phrase) => text.replace(new RegExp(`\\b${phrase.split(" ").join("[\\s-]+")}\\b`, "gi"), " "),
    question.normalize("NFKD"),
  )
  return unfamiliarNames(project, questionWithoutCivicPhrases).length > 0
}

export function assessProjectQuestion(project: CivicProject, question: string): { relevant: boolean; reason?: string } {
  const normalized = normalizeProjectQuestion(question)
  if (PROMPT_ATTACK_PHRASES.some(phrase => normalized.includes(phrase))) {
    return { relevant: false, reason: "Ask about the project itself—not Kaun’s instructions or system." }
  }
  if (OUT_OF_SCOPE_PHRASES.some(phrase => normalized.includes(phrase))) {
    return { relevant: false, reason: "That request is outside this civic research desk." }
  }

  const tokens = questionTokens(question)
  const spaced = spacedPhraseText(normalized)
  const words = spaced.trim().split(/\s+/).filter(Boolean)
  const compactWords = compactCodes(normalized).split(/[\s-]+/)
  if (
    [...tokens, ...words].some(word => CLEARLY_OUT_OF_SCOPE.has(word))
    || OUT_OF_SCOPE_SUBJECT_PHRASES.some(phrase => hasPhrase(spaced, phrase))
  ) {
    return { relevant: false, reason: "That question is outside this civic project record." }
  }
  if (namesSomeoneElse(project, question, spaced)) return { relevant: false, reason: OFF_TOPIC_REASON }

  const projectTerms = projectReferenceTerms(project)
  if (namesThisProject(words, compactWords, projectTerms)) return { relevant: true }
  if (pointsAtThisProject(words, spaced, tokens, projectTerms) && asksAboutAccountability(tokens, spaced)) {
    return { relevant: true }
  }
  return { relevant: false, reason: OFF_TOPIC_REASON }
}

// ---------------------------------------------------------------------------
// Server signatures. Only research this server produced can enter the review
// queue; the signature binds the exact answer, sources and search time.
// ---------------------------------------------------------------------------

export interface SignedResearchFields {
  slug: string
  question: string
  answer: string
  sources: ResearchSource[]
  searched_at: string
  origin: ResearchOrigin
}

const SIGNATURE_VERSION = "v1"
const SIGNATURE_CONTEXT = "kaun.project-research.v1"

/** PROJECT_RESEARCH_SIGNING_SECRET, falling back to the service-role key; null when neither is set. */
export function projectResearchSigningSecret(env: Record<string, string | undefined> = process.env): string | null {
  return env.PROJECT_RESEARCH_SIGNING_SECRET?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null
}

/** Canonical JSON: fixed key order, sources reduced to { title, url } in their given order. */
export function canonicalResearchPayload(fields: SignedResearchFields): string {
  return JSON.stringify({
    answer: fields.answer,
    origin: fields.origin,
    question: fields.question,
    searched_at: fields.searched_at,
    slug: fields.slug,
    sources: fields.sources.map(source => ({ title: source.title, url: source.url })),
  })
}

export function signProjectResearch(fields: SignedResearchFields, secret: string): string {
  const digest = createHmac("sha256", secret)
    .update(`${SIGNATURE_CONTEXT}\n${canonicalResearchPayload(fields)}`)
    .digest("base64url")
  return `${SIGNATURE_VERSION}.${digest}`
}

/** Constant-time comparison that also hides length differences. */
export function timingSafeStringEqual(actual: string, expected: string): boolean {
  const a = createHash("sha256").update(actual).digest()
  const b = createHash("sha256").update(expected).digest()
  return timingSafeEqual(a, b)
}

export function verifyProjectResearchSignature(fields: SignedResearchFields, signature: unknown, secret: string): boolean {
  if (typeof signature !== "string" || signature.length > 200) return false
  return timingSafeStringEqual(signature, signProjectResearch(fields, secret))
}

/** Salted SHA-256 of the client IP, or null when the IP is unknown. */
export function hashSubmitterIp(ip: string, secret: string): string | null {
  const value = ip.trim()
  if (!value || value === "unknown") return null
  return createHash("sha256").update(`kaun.research-submitter.v1:${secret}:${value}`).digest("hex")
}

/** True when PostgREST/Postgres reports that a table does not exist (e.g. migration not applied). */
export function isMissingRelationError(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false
  if (error.code === "PGRST205" || error.code === "42P01") return true
  const message = error.message ?? ""
  return /could not find the table/i.test(message) || /relation .* does not exist/i.test(message)
}

interface LocalTopic {
  terms: string[]
  signalIds?: string[]
  metricLabels?: string[]
  recordIds?: string[]
}

/**
 * Record topics the desk may answer without a search. Terms are whole words or
 * phrases about the topic itself; names of the project (Varthur, KRDCL,
 * corridor) are deliberately absent, because naming the project says nothing
 * about which part of its record a question needs.
 */
const LOCAL_TOPICS: LocalTopic[] = [
  { terms: ["contractor", "work order", "tender", "milestone", "payment", "penalty"], signalIds: ["contractor"] },
  { terms: ["cost", "budget", "crore", "estimate", "amount"], signalIds: ["cost"], metricLabels: ["Reported cost"] },
  { terms: ["court", "legal", "stay", "petition", "tdr"], signalIds: ["litigation"], metricLabels: ["Court stays found"], recordIds: ["court-order"] },
  { terms: ["deadline", "delay", "complete", "completion", "finish", "timeline", "target"], recordIds: ["original-deadline", "july-2025-target", "realistic-2027", "december-2026-target"] },
  { terms: ["progress", "construction", "land", "acquisition", "property", "properties"], metricLabels: ["Land acquisition", "Properties pending"], recordIds: ["december-2026-target"] },
  { terms: ["agency", "authority", "responsible", "owner"], signalIds: ["responsible-agency"] },
  { terms: ["scope", "expansion", "extension"], recordIds: ["cabinet-expansion"] },
]

/**
 * Questions about people — politicians, officials, named individuals, criminal
 * or corruption allegations — are never answered from the project record, even
 * when a topic word matches: a record entry about the project must not be
 * shown as an answer about a person.
 */
const PERSON_TERMS = new Set([
  ...POLITICAL_TERMS, "accused", "arrest", "arrested", "bribe", "bribery", "chairman", "chairperson", "commissioner",
  "corrupt", "corruption", "director", "engineer", "he", "her", "him", "his", "individual", "md", "officer", "official",
  "person", "she",
])

/** Whether any of the topic's terms (whole words or phrases, after aliases and plurals) appears in the question. */
function matchesTopic(question: string, topic: LocalTopic): boolean {
  const spaced = spacedPhraseText(normalizeProjectQuestion(question))
  const tokens = new Set(questionTokens(question).flatMap(token => [token, stemToken(token), aliasOf(stemToken(token))]))
  return topic.terms.some(term => {
    const normalizedTerm = normalizeProjectQuestion(term)
    return hasPhrase(spaced, normalizedTerm) || tokens.has(aliasOf(normalizedTerm))
  })
}

function signalSentence(signal: CivicProjectSignal): string {
  return `${signal.label}: ${signal.value}. ${signal.explanation}`
}

function metricSentence(metric: CivicProjectMetric): string {
  return `${metric.label}: ${metric.value}. ${metric.note}`
}

function recordSentence(record: CivicProjectRecord): string {
  return `${record.title} (${record.dateLabel}): ${record.body}`
}

/**
 * Answer from Kaun's own record only when the question is in scope, is not
 * about a person, and matches exactly one record topic better than any other.
 * Anything less clear goes on to cached research or a live search.
 */
export function findAnswerInProjectRecord(project: CivicProject, question: string): ReusableResearchResult | null {
  if (!assessProjectQuestion(project, question).relevant) return null
  const normalizedQuestion = normalizeProjectQuestion(question)
  const tokens = questionTokens(normalizedQuestion)
  if (tokens.some(token => PERSON_TERMS.has(token) || PERSON_TERMS.has(stemToken(token)))) return null
  const asksForFreshness = ["after", "current", "latest", "newer", "now", "recent", "since", "today", "updated", "yet"]
    .some(term => tokens.includes(term))
  if (asksForFreshness) return null

  // A clear match is exactly one record topic: "penalties or deadline extensions"
  // touches three and goes to research instead.
  const matched = LOCAL_TOPICS.filter(candidate => matchesTopic(question, candidate))
  if (matched.length !== 1) return null
  const [topic] = matched

  const signals = project.signals.filter(item => topic.signalIds?.includes(item.id))
  const metrics = project.metrics.filter(item => topic.metricLabels?.includes(item.label))
  const records = project.records.filter(item => topic.recordIds?.includes(item.id))
  const asksAboutKaunRecord = normalizedQuestion.includes("kaun") || normalizedQuestion.includes("existing record")
  if (!asksAboutKaunRecord && [...signals, ...metrics].some(item => item.evidence === "unknown" || item.evidence === "conflicting")) {
    return null
  }
  const sourceIds = new Set([
    ...signals.flatMap(item => item.sourceIds),
    ...records.flatMap(item => item.sourceIds),
  ])
  const sourcesById = new Map(project.sources.map(source => [source.id, source]))
  const sources = [...sourceIds]
    .map(id => sourcesById.get(id))
    .filter(source => Boolean(source))
    .map(source => ({ title: source!.title, url: source!.url }))

  const statements = [
    ...signals.map(signalSentence),
    ...metrics.map(metricSentence),
    ...records.map(recordSentence),
  ]
  if (statements.length === 0) return null

  return {
    answer: `Kaun’s existing record already addresses this.\n\n${statements.join("\n\n")}\n\nRecord last reviewed ${project.latestAsOf}.`,
    sources,
    searched_at: project.latestAsOf,
    can_submit: false,
    origin: "kaun_record",
  }
}
