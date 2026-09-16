import { revalidatePath } from "next/cache"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`
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
  let query = supabase
    .from("civic_project_research_submissions")
    .select("id,project_slug,question,answer,sources,searched_at,status,review_note,submitted_at")
    .order("submitted_at", { ascending: false })
    .limit(100)
  if (status && status !== "all") query = query.eq("status", status)

  const { data, error } = await query
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ research: data ?? [] })
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const supabase = client()
  if (!supabase) return Response.json({ error: "Research storage is not configured." }, { status: 503 })

  const body = await request.json() as { id?: number; action?: "publish" | "reject"; note?: string }
  if (!body.id || !body.action || !["publish", "reject"].includes(body.action)) {
    return Response.json({ error: "Invalid moderation request." }, { status: 400 })
  }

  const status = body.action === "publish" ? "published" : "rejected"
  const { data, error } = await supabase
    .from("civic_project_research_submissions")
    .update({
      status,
      review_note: body.note?.trim().slice(0, 1000) || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", body.id)
    .select("id,project_slug,status")
    .single()
  if (error) return Response.json({ error: error.message }, { status: 500 })

  if (status === "published") revalidatePath(`/bengaluru/projects/${data.project_slug}`)
  return Response.json({ ok: true, updated: data })
}
