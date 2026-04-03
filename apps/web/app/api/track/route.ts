import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

/**
 * Lightweight event tracking endpoint.
 * Logs pin drops, tab views, and other user actions to Supabase
 * for the status dashboard.
 *
 * POST /api/track
 * Body: { event: "pin_drop", ward_no?: 42, ward_name?: "Koramangala", meta?: {} }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const event = body.event as string
    if (!event) return Response.json({ ok: false }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    await supabase.from("analytics_events").insert({
      event,
      ward_no: body.ward_no ?? null,
      ward_name: body.ward_name ?? null,
      meta: body.meta ?? null,
    })

    return Response.json({ ok: true })
  } catch {
    return Response.json({ ok: true }) // fail silently — never block the user
  }
}
