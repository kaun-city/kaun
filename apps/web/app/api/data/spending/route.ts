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
    // Per-ward: use v_work_orders_243 (overlap-inclusive — a work order shows
    // in every DataMeet-243 ward its BBMP-225 ward materially overlaps;
    // overlap_share + is_primary expose the mapping). City-wide top-N: read
    // bbmp_work_orders directly so a multi-ward work order isn't duplicated.
    let query
    if (wardNo) {
      query = supabase
        .from("v_work_orders_243")
        .select("work_order_id, ward_no, source_ward_name, datameet243_no, overlap_share, is_primary, description, contractor_name, contractor_phone, sanctioned_amount, net_paid, deduction, fy, contractor_code, division, budget_head, start_date, end_date, order_ref, sbr_ref, bill_ref, payment_status, data_source, ifms_wbid")
        .eq("datameet243_no", parseInt(wardNo))
        .order("sanctioned_amount", { ascending: false, nullsFirst: false })
        .order("net_paid", { ascending: false, nullsFirst: false })
        .limit(50)
    } else {
      query = supabase
        .from("bbmp_work_orders")
        .select("work_order_id, ward_no, bbmp_ward_no, ward_class, description, contractor_name, contractor_phone, sanctioned_amount, net_paid, deduction, fy, contractor_code, division, budget_head, start_date, end_date, order_ref, sbr_ref, bill_ref, payment_status, data_source, ifms_wbid")
        .order("sanctioned_amount", { ascending: false, nullsFirst: false })
        .order("net_paid", { ascending: false, nullsFirst: false })
        .limit(200)
    }
    const { data } = await query
    result.work_orders = data ?? []
  }

  if (type === "citywide-works") {
    // City-wide CE/Mayor works (ward_class='citywide') — not attributable to
    // a single ward by nature (Major Roads, Lakes, SWM, Horticulture, etc.).
    // Surfaced separately so they neither pollute a ward nor disappear.
    const { data } = await supabase
      .from("bbmp_work_orders")
      .select("work_order_id, ward_no, source_ward_name, description, contractor_name, sanctioned_amount, net_paid, deduction, fy, division, budget_head, payment_status, data_source")
      .eq("ward_class", "citywide")
      .order("sanctioned_amount", { ascending: false, nullsFirst: false })
      .limit(500)
    result.citywide_works = data ?? []
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
