import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=3600, s-maxage=3600",
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

/**
 * GET /api/data/reps?constituency=Yelahanka&role=MLA
 *
 * Public API for elected representative data + report cards.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const constituency = url.searchParams.get("constituency")
  const role = url.searchParams.get("role")

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  // Reps
  let repQuery = supabase
    .from("elected_reps")
    .select("role, constituency, name, party, elected_since, phone, criminal_cases, age, profession, education, data_source")
    .order("constituency")

  if (constituency) repQuery = repQuery.ilike("constituency", `%${constituency}%`)
  if (role) repQuery = repQuery.eq("role", role)

  // Report cards
  let rcQuery = supabase
    .from("rep_report_cards")
    .select("role, constituency, attendance_pct, questions_asked, debates, bills_introduced, committees, lad_utilization_pct, net_worth_growth_pct, criminal_cases, term")
    .order("constituency")

  if (constituency) rcQuery = rcQuery.ilike("constituency", `%${constituency}%`)
  if (role) rcQuery = rcQuery.eq("role", role)

  const [reps, cards] = await Promise.all([repQuery, rcQuery])

  // Merge reps with their report cards
  const cardMap = new Map((cards.data ?? []).map(c => [`${c.role}|${c.constituency?.toLowerCase()}`, c]))
  const merged = (reps.data ?? []).map(rep => ({
    ...rep,
    report_card: cardMap.get(`${rep.role}|${rep.constituency?.toLowerCase()}`) ?? null,
  }))

  return Response.json({
    data: merged,
    count: merged.length,
    source: "kaun.city — Election Commission affidavits via MyNeta, CIVIC Bengaluru via opencity.in",
    license: "Public data, MIT licensed platform",
  }, { headers: CORS_HEADERS })
}
