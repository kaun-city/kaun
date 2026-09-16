import { createClient } from "@supabase/supabase-js"
import { getCivicProject } from "@/lib/civic-projects"
import { projectQuestionKey } from "@/lib/civic-projects-server"
import {
  assessProjectQuestion,
  hashSubmitterIp,
  isMissingRelationError,
  projectResearchSigningSecret,
  verifyProjectResearchSignature,
  type ResearchOrigin,
  type ResearchSource,
} from "@/lib/project-research"
import { enforceRateLimit, getIP, makeResearchSubmissionLimiter } from "@/lib/ratelimit"

export const runtime = "nodejs"
export const maxDuration = 20

const NOT_OPEN = "Research submissions are not open yet."
const QUEUE_FAILED = "Could not add this research to the review queue."
const UNSIGNED = "Only research produced by Kaun’s research desk, unchanged, can be proposed."
const PROPOSABLE_ORIGINS: ResearchOrigin[] = ["live_research", "recent_research"]

interface SubmissionBody {
  project_slug?: unknown
  question?: unknown
  answer?: unknown
  sources?: unknown
  searched_at?: unknown
  origin?: unknown
  signature?: unknown
}

function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:"
  } catch {
    return false
  }
}

/** Sources exactly as the research route returned them, or null if the shape is wrong. */
function parseSources(value: unknown): ResearchSource[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10) return null
  const sources: ResearchSource[] = []
  for (const item of value) {
    if (!item || typeof item !== "object") return null
    const { title, url } = item as { title?: unknown; url?: unknown }
    if (typeof title !== "string" || !title.trim() || typeof url !== "string" || !isWebUrl(url)) return null
    sources.push({ title, url })
  }
  return sources
}

export async function POST(request: Request) {
  const ip = getIP(request)
  const limited = await enforceRateLimit(makeResearchSubmissionLimiter, request, "Research submissions")
  if (limited) return limited

  let body: SubmissionBody
  try {
    body = await request.json() as SubmissionBody
  } catch {
    return Response.json({ error: "A signed research result is required." }, { status: 400 })
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "A signed research result is required." }, { status: 400 })
  }

  try {
    const project = getCivicProject(typeof body.project_slug === "string" ? body.project_slug : "")
    if (!project) return Response.json({ error: "Unknown civic project." }, { status: 404 })

    const secret = projectResearchSigningSecret()
    if (!secret) return Response.json({ error: NOT_OPEN }, { status: 503 })

    const { question, answer, searched_at: searchedAt, origin, signature } = body
    const sources = parseSources(body.sources)
    if (
      typeof question !== "string"
      || typeof answer !== "string"
      || typeof searchedAt !== "string"
      || typeof origin !== "string"
      || !PROPOSABLE_ORIGINS.includes(origin as ResearchOrigin)
      || !sources
      || typeof signature !== "string"
    ) {
      return Response.json({ error: "A signed, cited research result is required." }, { status: 400 })
    }

    const signed = verifyProjectResearchSignature({
      slug: project.slug,
      question,
      answer,
      sources,
      searched_at: searchedAt,
      origin: origin as ResearchOrigin,
    }, signature, secret)
    if (!signed) return Response.json({ error: UNSIGNED }, { status: 400 })

    if (question.length < 8 || question.length > 300 || answer.length < 20 || answer.length > 5000 || Number.isNaN(Date.parse(searchedAt))) {
      return Response.json({ error: "A cited research result is required." }, { status: 400 })
    }
    if (!assessProjectQuestion(project, question).relevant) {
      return Response.json({ error: "Only research relevant to this civic project can enter its record." }, { status: 422 })
    }

    const endpoint = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!endpoint || !serviceKey) return Response.json({ error: NOT_OPEN }, { status: 503 })

    const supabase = createClient(endpoint, serviceKey)
    const questionKey = projectQuestionKey(question)
    const { data: existing, error: lookupError } = await supabase
      .from("civic_project_research_submissions")
      .select("id,status")
      .eq("project_slug", project.slug)
      .eq("question_key", questionKey)
      .in("status", ["pending", "published"])
      .limit(1)
    if (lookupError) {
      if (isMissingRelationError(lookupError)) return Response.json({ error: NOT_OPEN }, { status: 503 })
      console.error("project-research submit lookup error:", lookupError.message)
      return Response.json({ error: QUEUE_FAILED }, { status: 500 })
    }
    const duplicate = existing?.[0]
    if (duplicate) {
      return Response.json({ ok: true, id: duplicate.id, status: duplicate.status, duplicate: true })
    }

    const { data, error } = await supabase
      .from("civic_project_research_submissions")
      .insert({
        project_slug: project.slug,
        question,
        question_key: questionKey,
        answer,
        sources,
        searched_at: searchedAt,
        status: "pending",
        submitter_ip_hash: hashSubmitterIp(ip, secret),
      })
      .select("id,status")
      .single()

    if (error) {
      if (isMissingRelationError(error)) return Response.json({ error: NOT_OPEN }, { status: 503 })
      console.error("project-research submit error:", error.message)
      return Response.json({ error: QUEUE_FAILED }, { status: 500 })
    }

    return Response.json({ ok: true, id: data.id, status: data.status })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("project-research submit error:", message)
    return Response.json({ error: QUEUE_FAILED }, { status: 500 })
  }
}
