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
 * GET /api/data/spending?ward=42&type=budget|work-orders|property-tax
 *
 * Public API for spending and financial data.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const wardNo = url.searchParams.get("ward")
  const type = url.searchParams.get("type") || "all"

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: Record<string, any> = {}

  if (type === "budget" || type === "all") {
    const { data } = await supabase.rpc("budget_summary", { p_financial_year: "2025-26" })
    result.budget = data
  }

  if (type === "work-orders" || type === "all") {
    // Sort by sanctioned_amount (both data sources populate it) so the
    // top-N fairly mixes opencity-sourced rows (which have net_paid) and
    // IFMS-sourced rows (which don't — we don't capture net_paid without
    // a per-bill drill-down). net_paid becomes the tiebreaker for rows
    // with identical sanctioned amounts, not the primary ranking.
    let query = supabase
      .from("bbmp_work_orders")
      .select("work_order_id, ward_no, description, contractor_name, contractor_phone, sanctioned_amount, net_paid, deduction, fy")
      .order("sanctioned_amount", { ascending: false, nullsFirst: false })
      .order("net_paid", { ascending: false, nullsFirst: false })
      .limit(wardNo ? 50 : 200)

    if (wardNo) query = query.eq("ward_no", parseInt(wardNo))
    const { data } = await query
    result.work_orders = data ?? []
  }

  if ((type === "ward-spending" || type === "all") && wardNo) {
    const { data } = await supabase
      .from("ward_spend_category")
      .select("*")
      .eq("ward_no", parseInt(wardNo))
      .single()
    result.ward_spending = data
  }

  if ((type === "property-tax" || type === "all") && wardNo) {
    // Get AC for this ward first
    const { data: ward } = await supabase.from("wards").select("assembly_constituency").eq("ward_no", parseInt(wardNo)).single()
    if (ward?.assembly_constituency) {
      const { data } = await supabase.rpc("property_tax_by_ac", { p_assembly_constituency: ward.assembly_constituency })
      result.property_tax = data
    }
  }

  return Response.json({
    ...result,
    source: "kaun.city — BBMP work orders via opencity.in, BBMP budget",
    license: "Public data, MIT licensed platform",
  }, { headers: CORS_HEADERS })
}
