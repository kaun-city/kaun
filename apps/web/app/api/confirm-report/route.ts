import { createClient } from "@supabase/supabase-js"
import { makeReportLimiter, getIP, rateLimitResponse } from "@/lib/ratelimit"

export const runtime = "nodejs"

export async function POST(req: Request) {
  // Reuse report limiter (5/hour/IP)
  const { success, reset } = await makeReportLimiter().limit(getIP(req))
  if (!success) return rateLimitResponse(reset)

  try {
    const { id } = await req.json() as { id: number }
    if (!id || typeof id !== "number") {
      return Response.json({ error: "Missing report id" }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Increment upvotes
    const { data: report, error } = await supabase.rpc("increment_report_upvotes", { report_id: id })
    if (error) {
      // Fallback: manual increment if RPC doesn't exist yet
      const { data: current } = await supabase
        .from("ward_reports")
        .select("upvotes, status")
        .eq("id", id)
        .single()

      if (!current) return Response.json({ error: "Report not found" }, { status: 404 })

      const newUpvotes = (current.upvotes ?? 0) + 1
      const newStatus = newUpvotes >= 2 ? "approved" : current.status

      const { data: updated } = await supabase
        .from("ward_reports")
        .update({
          upvotes: newUpvotes,
          status: newStatus,
          ...(newStatus === "approved" && current.status !== "approved"
            ? { moderated_at: new Date().toISOString() }
            : {}),
        })
        .eq("id", id)
        .select("id, upvotes, status")
        .single()

      return Response.json({ ok: true, upvotes: updated?.upvotes, status: updated?.status })
    }

    return Response.json({ ok: true, ...report })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: msg }, { status: 500 })
  }
}
