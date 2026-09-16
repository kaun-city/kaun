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
  paid: "payment",
  payments: "payment",
  penalties: "penalty",
  petition: "court",
  price: "cost",
  properties: "property",
  records: "record",
  responsible: "agency",
  spent: "cost",
  tender: "contractor",
  vendor: "contractor",
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

const OUT_OF_SCOPE_SUBJECT_PHRASES = ["share market", "share price", "stock market", "stock price"]

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
    .map(token => TERM_ALIASES[token] ?? token))]
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
// On-topic gate. Live research costs a paid web search, so a question must be
// about this project: name it, or ask about a project-accountability topic.
// ---------------------------------------------------------------------------

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

export function assessProjectQuestion(project: CivicProject, question: string): { relevant: boolean; reason?: string } {
  const normalized = normalizeProjectQuestion(question)
  if (PROMPT_ATTACK_PHRASES.some(phrase => normalized.includes(phrase))) {
    return { relevant: false, reason: "Ask about the project itself—not Kaun’s instructions or system." }
  }
  if (OUT_OF_SCOPE_PHRASES.some(phrase => normalized.includes(phrase))) {
    return { relevant: false, reason: "That request is outside this civic research desk." }
  }

  const tokens = questionTokens(question)
  const words = new Set([...tokens, ...compactCodes(normalized).split(/[\s-]+/)])
  if (
    [...words].some(word => CLEARLY_OUT_OF_SCOPE.has(word))
    || OUT_OF_SCOPE_SUBJECT_PHRASES.some(phrase => normalized.includes(phrase))
  ) {
    return { relevant: false, reason: "That question is outside this civic project record." }
  }

  const projectTerms = projectReferenceTerms(project)
  const namesProject = [...words].some(word => projectTerms.has(word))
  const asksAccountability = tokens.some(token => ACCOUNTABILITY_TERMS.has(token))
    || ACCOUNTABILITY_PHRASES.some(phrase => normalized.includes(phrase))
  if (!namesProject && !asksAccountability) {
    return {
      relevant: false,
      reason: "Ask about this project’s work, agency, contractor, cost, deadlines, land, court record or public documents.",
    }
  }
  return { relevant: true }
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

const LOCAL_TOPICS: LocalTopic[] = [
  { terms: ["contractor", "work order", "tender", "milestone", "payment", "penalty"], signalIds: ["contractor"] },
  { terms: ["cost", "budget", "crore", "estimate", "amount"], signalIds: ["cost"], metricLabels: ["Reported cost"] },
  { terms: ["court", "legal", "stay", "petition", "tdr"], signalIds: ["litigation"], metricLabels: ["Court stays found"], recordIds: ["court-order"] },
  { terms: ["deadline", "delay", "complete", "completion", "finish", "timeline", "target"], recordIds: ["original-deadline", "july-2025-target", "realistic-2027", "december-2026-target"] },
  { terms: ["progress", "construction", "land", "acquisition", "property", "properties"], metricLabels: ["Land acquisition", "Properties pending"], recordIds: ["december-2026-target"] },
  { terms: ["agency", "authority", "responsible", "owner", "krdcl"], signalIds: ["responsible-agency"] },
  { terms: ["scope", "elevated", "corridor", "extension"], recordIds: ["cabinet-expansion"] },
]

function topicScore(question: string, topic: LocalTopic): number {
  const normalized = normalizeProjectQuestion(question)
  const tokens = new Set(questionTokens(question))
  return topic.terms.reduce((score, term) => {
    const normalizedTerm = normalizeProjectQuestion(term)
    return score + (normalized.includes(normalizedTerm) || tokens.has(TERM_ALIASES[normalizedTerm] ?? normalizedTerm) ? 1 : 0)
  }, 0)
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

export function findAnswerInProjectRecord(project: CivicProject, question: string): ReusableResearchResult | null {
  const normalizedQuestion = normalizeProjectQuestion(question)
  const asksForFreshness = ["after", "current", "latest", "newer", "now", "recent", "since", "today", "updated", "yet"]
    .some(term => questionTokens(normalizedQuestion).includes(term))
  if (asksForFreshness) return null

  const topic = LOCAL_TOPICS
    .map(candidate => ({ candidate, score: topicScore(question, candidate) }))
    .sort((a, b) => b.score - a.score)[0]
  if (!topic || topic.score === 0) return null

  const signals = project.signals.filter(item => topic.candidate.signalIds?.includes(item.id))
  const metrics = project.metrics.filter(item => topic.candidate.metricLabels?.includes(item.label))
  const records = project.records.filter(item => topic.candidate.recordIds?.includes(item.id))
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
