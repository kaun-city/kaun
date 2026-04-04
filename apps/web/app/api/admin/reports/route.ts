import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

function isAuthorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim()
  if (!cronSecret) return false
  return req.headers.get("authorization") === `Bearer ${cronSecret}`
}

// GET /api/admin/reports?status=pending
export async function GET(req: Request) {
  if (!isAuthorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status")

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let query = supabase
    .from("ward_reports")
    .select("id, ward_name, issue_type, description, ai_label, status, photo_url, upvotes, reported_at")
    .order("reported_at", { ascending: false })
    .limit(100)

  if (status && status !== "all") {
    query = query.eq("status", status)
  }

  const { data, error } = await query
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ reports: data })
}

// POST /api/admin/reports { id, action: "approve" }
export async function POST(req: Request) {
  if (!isAuthorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { id, action } = await req.json() as { id: number; action: string }
    if (!id || action !== "approve") return Response.json({ error: "Invalid" }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data } = await supabase
      .from("ward_reports")
      .update({ status: "approved", moderated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, status")
      .single()

    return Response.json({ ok: true, updated: data })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
