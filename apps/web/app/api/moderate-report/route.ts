import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

/**
 * Admin moderation endpoint — delete or reject a report.
 * Requires CRON_SECRET in Authorization header.
 *
 * POST /api/moderate-report
 * { id: number, action: "delete" | "reject" }
 */
export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim()
  const auth = req.headers.get("authorization") ?? ""
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { id, action } = await req.json() as { id: number; action: "delete" | "reject" }

    if (!id || typeof id !== "number") return Response.json({ error: "Missing id" }, { status: 400 })
    if (!["delete", "reject"].includes(action)) return Response.json({ error: "action must be delete or reject" }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    if (action === "delete") {
      const { data } = await supabase.from("ward_reports").delete().eq("id", id).select("id, description, issue_type").single()
      return Response.json({ ok: true, deleted: data })
    }

    // reject — keep record but hide from public
    const { data } = await supabase
      .from("ward_reports")
      .update({ status: "rejected", moderated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, status")
      .single()
    return Response.json({ ok: true, updated: data })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: msg }, { status: 500 })
  }
}
