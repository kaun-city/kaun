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
 * GET /api/data/wards?ward=42
 *
 * Public API for ward-level data: infrastructure, potholes, crashes, air quality.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const wardNo = url.searchParams.get("ward")

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  // If specific ward requested, return all data for that ward
  if (wardNo) {
    const wn = parseInt(wardNo)
    const [ward, infra, potholes, crashes, air, spend, workOrders] = await Promise.all([
      supabase.from("wards").select("ward_no, ward_name, assembly_constituency, zone").eq("ward_no", wn).eq("city_id", "bengaluru").single(),
      supabase.from("ward_infra_stats").select("signal_count, bus_stop_count, daily_trips").eq("ward_no", wn).single(),
      supabase.from("ward_potholes").select("complaints, data_year").eq("ward_no", wn).single(),
      supabase.from("ward_road_crashes").select("crashes_2024, fatal_2024, crashes_2025, fatal_2025").eq("ward_no", wn).single(),
      supabase.from("ward_air_quality").select("station_name, avg_pm25, avg_pm10, data_year").eq("ward_no", wn).single(),
      supabase.from("ward_spend_category").select("buildings_facilities, drainage, roads_and_drains, roads_and_infrastructure, streetlighting, waste_management, water_and_sanitation, grand_total, period").eq("ward_no", wn).single(),
      supabase.from("bbmp_work_orders").select("work_order_id, description, contractor_name, contractor_phone, sanctioned_amount, net_paid, deduction, fy").eq("ward_no", wn).order("net_paid", { ascending: false }).limit(50),
    ])

    return Response.json({
      ward: ward.data,
      infrastructure: infra.data,
      potholes: potholes.data,
      road_crashes: crashes.data,
      air_quality: air.data,
      spending: spend.data,
      work_orders: workOrders.data ?? [],
      source: "kaun.city — public records aggregated from BBMP, opencity.in, OSM, CPCB",
      license: "Public data, MIT licensed platform",
    }, { headers: CORS_HEADERS })
  }

  // Otherwise return ward list
  const { data } = await supabase
    .from("wards")
    .select("ward_no, ward_name, assembly_constituency, zone")
    .eq("city_id", "bengaluru")
    .order("ward_no")

  return Response.json({
    data: data ?? [],
    count: data?.length ?? 0,
    source: "kaun.city",
  }, { headers: CORS_HEADERS })
}
