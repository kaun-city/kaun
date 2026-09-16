import { createClient } from "@supabase/supabase-js"
import { getCivicProject } from "@/lib/civic-projects"
import { projectQuestionKey } from "@/lib/civic-projects-server"
import { assessProjectQuestion } from "@/lib/project-research"
import { getIP, makeReportLimiter, rateLimitResponse } from "@/lib/ratelimit"

export const runtime = "nodejs"
export const maxDuration = 20

interface SubmissionBody {
  project_slug?: string
  question?: string
  answer?: string
  sources?: Array<{ title?: string; url?: string }>
  searched_at?: string
}

function validSource(source: { title?: string; url?: string }): source is { title: string; url: string } {
  if (!source.title?.trim() || !source.url) return false
  try {
    const url = new URL(source.url)
    return url.protocol === "https:" || url.protocol === "http:"
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  const { success, reset } = await makeReportLimiter().limit(getIP(request))
  if (!success) return rateLimitResponse(reset)

  try {
    const body = await request.json() as SubmissionBody
    const project = getCivicProject(body.project_slug ?? "")
    const question = body.question?.trim() ?? ""
    const answer = body.answer?.trim() ?? ""
    const sources = (body.sources ?? []).filter(validSource).slice(0, 10)

    if (!project) return Response.json({ error: "Unknown civic project." }, { status: 404 })
    if (question.length < 8 || question.length > 300 || answer.length < 20 || answer.length > 5000 || sources.length === 0) {
      return Response.json({ error: "A cited research result is required." }, { status: 400 })
    }
    if (!assessProjectQuestion(project, question).relevant) {
      return Response.json({ error: "Only research relevant to this civic project can enter its record." }, { status: 422 })
    }

    const endpoint = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!endpoint || !serviceKey) {
      return Response.json({ error: "The permanent record is not configured yet." }, { status: 503 })
    }

    const supabase = createClient(endpoint, serviceKey)
    const questionKey = projectQuestionKey(question)
    const { data: existing } = await supabase
      .from("civic_project_research_submissions")
      .select("id,status")
      .eq("project_slug", project.slug)
      .eq("question_key", questionKey)
      .in("status", ["pending", "published"])
      .maybeSingle()
    if (existing) {
      return Response.json({ ok: true, id: existing.id, status: existing.status, duplicate: true })
    }

    const { data, error } = await supabase
      .from("civic_project_research_submissions")
      .insert({
        project_slug: project.slug,
        question,
        question_key: questionKey,
        answer,
        sources,
        searched_at: body.searched_at ?? new Date().toISOString(),
        status: "pending",
        submitter_ip_hash: null,
      })
      .select("id,status")
      .single()

    if (error) {
      console.error("project-research submit error:", error.message)
      return Response.json({ error: "Could not add this research to the review queue." }, { status: 500 })
    }

    return Response.json({ ok: true, id: data.id, status: data.status })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("project-research submit error:", message)
    return Response.json({ error: "Could not add this research to the review queue." }, { status: 500 })
  }
}
