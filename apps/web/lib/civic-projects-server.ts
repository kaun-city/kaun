import { createHash } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import {
  isMissingRelationError,
  normalizeProjectQuestion,
  PROJECT_QUESTION_REUSE_THRESHOLD,
  projectQuestionSimilarity,
  type ResearchSource,
  type ReusableResearchResult,
} from "@/lib/project-research"

export interface PublishedProjectResearch {
  id: number
  question: string
  answer: string
  sources: Array<{ title: string; url: string }>
  submitted_at: string
  reviewed_at: string | null
}

interface StoredResearchRow {
  id: number
  question: string
  answer: string
  sources: Array<{ title: string; url: string }>
  searched_at: string
}

/** Unreviewed AI answers are reused for the same question for at most this long (stated on /how-it-works). */
export const PROJECT_RESEARCH_CACHE_DAYS = 7

export function projectQuestionKey(question: string): string {
  return createHash("sha256").update(normalizeProjectQuestion(question)).digest("hex")
}

/** Only a near-identical earlier question may reuse its answer (see projectQuestionSimilarity). */
function bestQuestionMatch<T extends StoredResearchRow>(question: string, rows: T[]): T | null {
  const matches = rows
    .map(row => ({ row, score: projectQuestionSimilarity(question, row.question) }))
    .filter(match => match.score >= PROJECT_QUESTION_REUSE_THRESHOLD)
    .sort((a, b) => b.score - a.score)
  return matches[0]?.row ?? null
}

function storedSources(value: unknown): ResearchSource[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is ResearchSource =>
      Boolean(item) && typeof item.title === "string" && typeof item.url === "string")
    .map(item => ({ title: item.title, url: item.url }))
}

function logStorageError(context: string, error: { code?: string | null; message?: string | null } | null) {
  // The research tables ship in a migration that may not be applied yet; that is expected, not an error.
  if (!error || isMissingRelationError(error)) return
  console.error(`${context}:`, error.message)
}

export async function findReusableProjectResearch(
  projectSlug: string,
  question: string,
): Promise<ReusableResearchResult | null> {
  const endpoint = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!endpoint || !serviceKey) return null

  try {
    const supabase = createClient(endpoint, serviceKey)
    const now = new Date().toISOString()

    const [published, cached] = await Promise.all([
      supabase
        .from("civic_project_research_submissions")
        .select("id,question,answer,sources,searched_at")
        .eq("project_slug", projectSlug)
        .eq("status", "published")
        .order("reviewed_at", { ascending: false })
        .limit(40),
      supabase
        .from("civic_project_research_cache")
        .select("id,question,answer,sources,searched_at")
        .eq("project_slug", projectSlug)
        .gt("expires_at", now)
        .order("searched_at", { ascending: false })
        .limit(40),
    ])
    logStorageError("project-research published lookup error", published.error)
    logStorageError("project-research cache lookup error", cached.error)

    const publishedMatch = bestQuestionMatch(question, (published.data ?? []) as StoredResearchRow[])
    if (publishedMatch) {
      return {
        answer: publishedMatch.answer,
        sources: storedSources(publishedMatch.sources),
        searched_at: publishedMatch.searched_at,
        can_submit: false,
        origin: "published_research",
      }
    }

    const cachedMatch = bestQuestionMatch(question, (cached.data ?? []) as StoredResearchRow[])
    if (!cachedMatch) return null
    const sources = storedSources(cachedMatch.sources)
    return {
      answer: cachedMatch.answer,
      sources,
      searched_at: cachedMatch.searched_at,
      can_submit: sources.length > 0,
      origin: "recent_research",
    }
  } catch (error: unknown) {
    console.error("project-research lookup error:", error instanceof Error ? error.message : String(error))
    return null
  }
}

export async function cacheProjectResearch(
  projectSlug: string,
  question: string,
  result: Pick<ReusableResearchResult, "answer" | "sources" | "searched_at">,
): Promise<void> {
  const endpoint = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!endpoint || !serviceKey || result.sources.length === 0) return
  try {
    const supabase = createClient(endpoint, serviceKey)
    const expiresAt = new Date(Date.now() + PROJECT_RESEARCH_CACHE_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const { error } = await supabase
      .from("civic_project_research_cache")
      .upsert({
        project_slug: projectSlug,
        question,
        question_key: projectQuestionKey(question),
        answer: result.answer,
        sources: result.sources,
        searched_at: result.searched_at,
        expires_at: expiresAt,
      }, { onConflict: "project_slug,question_key" })
    logStorageError("project-research cache error", error)
  } catch (error: unknown) {
    console.error("project-research cache error:", error instanceof Error ? error.message : String(error))
  }
}

/**
 * Approved citizen research is additive: the seed dossier remains available
 * even when Supabase is unavailable, while reviewed contributions appear as
 * later entries in the permanent record.
 */
export async function fetchPublishedProjectResearch(
  projectSlug: string,
): Promise<PublishedProjectResearch[]> {
  const endpoint = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!endpoint || !anonKey) return []

  const params = new URLSearchParams({
    project_slug: `eq.${projectSlug}`,
    status: "eq.published",
    select: "id,question,answer,sources,submitted_at,reviewed_at",
    order: "reviewed_at.desc.nullslast,submitted_at.desc",
    limit: "20",
  })

  try {
    const response = await fetch(
      `${endpoint}/rest/v1/civic_project_research_submissions?${params}`,
      {
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        next: { revalidate: 300 },
      },
    )
    if (!response.ok) return []
    const rows = await response.json()
    return Array.isArray(rows) ? rows as PublishedProjectResearch[] : []
  } catch {
    return []
  }
}
