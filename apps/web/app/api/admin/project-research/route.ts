import { revalidatePath } from "next/cache"
import { createClient } from "@supabase/supabase-js"
import { isMissingRelationError, timingSafeStringEqual } from "@/lib/project-research"

export const runtime = "nodejs"

const NOT_OPEN = "Research submissions are not open yet."
const STATUSES = ["pending", "published", "rejected"]

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  const header = request.headers.get("authorization")
  if (!secret || !header) return false
  return timingSafeStringEqual(header, `Bearer ${secret}`)
}

function client() {
  const endpoint = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!endpoint || !serviceKey) return null
  return createClient(endpoint, serviceKey)
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const supabase = client()
  if (!supabase) return Response.json({ error: "Research storage is not configured." }, { status: 503 })

  const status = new URL(request.url).searchParams.get("status")
  if (status && status !== "all" && !STATUSES.includes(status)) {
    return Response.json({ error: "Unknown status filter." }, { status: 400 })
  }
  let query = supabase
    .from("civic_project_research_submissions")
    .select("id,project_slug,question,answer,sources,searched_at,status,review_note,submitted_at")
    .order("submitted_at", { ascending: false })
    .limit(100)
  if (status && status !== "all") query = query.eq("status", status)

  const { data, error } = await query
  if (error) {
    if (isMissingRelationError(error)) return Response.json({ error: NOT_OPEN }, { status: 503 })
    return Response.json({ error: error.message }, { status: 500 })
  }
  return Response.json({ research: data ?? [] })
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const supabase = client()
  if (!supabase) return Response.json({ error: "Research storage is not configured." }, { status: 503 })

  let body: { id?: unknown; action?: unknown; note?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid moderation request." }, { status: 400 })
  }
  if (
    !body || typeof body !== "object"
    || typeof body.id !== "number" || !Number.isSafeInteger(body.id) || body.id <= 0
    || (body.action !== "publish" && body.action !== "reject")
  ) {
    return Response.json({ error: "Invalid moderation request." }, { status: 400 })
  }

  const status = body.action === "publish" ? "published" : "rejected"
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : ""
  const { data, error } = await supabase
    .from("civic_project_research_submissions")
    .update({
      status,
      review_note: note || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", body.id)
    .select("id,project_slug,status")
    .single()
  if (error) {
    if (isMissingRelationError(error)) return Response.json({ error: NOT_OPEN }, { status: 503 })
    if (error.code === "PGRST116") return Response.json({ error: "Research submission not found." }, { status: 404 })
    return Response.json({ error: error.message }, { status: 500 })
  }

  if (status === "published") revalidatePath(`/bengaluru/projects/${data.project_slug}`)
  return Response.json({ ok: true, updated: data })
}
