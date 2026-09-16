import type { CivicProject, CivicProjectMetric, CivicProjectRecord, CivicProjectSignal } from "@/lib/civic-projects"

export type ResearchOrigin = "kaun_record" | "published_research" | "recent_research" | "live_research"

export interface ReusableResearchResult {
  answer: string
  sources: Array<{ title: string; url: string }>
  searched_at: string
  can_submit: boolean
  origin: ResearchOrigin
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

const CIVIC_TERMS = new Set([
  "acquisition", "agency", "authority", "bbmp", "budget", "cabinet", "compensation", "contractor", "corridor",
  "cost", "court", "deadline", "delay", "elevated", "government", "infrastructure", "krdcl", "land", "legal",
  "milestone", "official", "payment", "penalty", "progress", "property", "public", "record", "rti", "scope",
  "sh35", "stay", "tdr", "timeline", "traffic", "ward",
])

const CIVIC_PHRASES = ["latest update", "project status", "public record", "road work", "work order"]

const CLEARLY_OUT_OF_SCOPE = new Set([
  "astrology", "celebrity", "cricket", "dating", "essay", "football", "horoscope", "joke", "lyrics", "movie",
  "recipe", "shopping", "stock", "vacation", "weather",
])

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

export function projectQuestionSimilarity(first: string, second: string): number {
  const a = questionTokens(first)
  const b = questionTokens(second)
  if (a.length === 0 || b.length === 0) return 0
  if (normalizeProjectQuestion(first) === normalizeProjectQuestion(second)) return 1
  const bSet = new Set(b)
  const overlap = a.filter(token => bSet.has(token)).length
  if (overlap === 1 && Math.min(a.length, b.length) === 1) return 1
  if (overlap < 2) return 0
  return overlap / Math.min(a.length, b.length)
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
  const projectTerms = new Set(questionTokens([
    project.title,
    project.shortTitle,
    project.routeName,
    project.road,
    project.ownerAgency,
    ...project.affectedWardNames,
  ].join(" ")))
  const hasProjectTerm = tokens.some(token => projectTerms.has(token))
  const civicMatches = tokens.filter(token => CIVIC_TERMS.has(token)).length
    + CIVIC_PHRASES.filter(phrase => normalized.includes(phrase)).length
  const offTopicMatches = tokens.filter(token => CLEARLY_OUT_OF_SCOPE.has(token)).length

  if (offTopicMatches > 0 && civicMatches === 0) {
    return { relevant: false, reason: "That question is outside this civic project record." }
  }
  if (!hasProjectTerm && civicMatches === 0) {
    return {
      relevant: false,
      reason: "Ask about this project’s work, agency, contractor, cost, deadlines, land, court record or public documents.",
    }
  }
  return { relevant: true }
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
