import { createClient } from "@supabase/supabase-js"
import { bbmp198AllocationWeights, estimateDatameet243FromBbmp198 } from "@/lib/bbmp198-crosswalk"
import { BBMP198_INDEX, bbmp198EstimateProvenance } from "@/lib/bbmp198-server"

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

const SPEND_FIELDS = ["buildings_facilities", "drainage", "roads_and_drains", "roads_and_infrastructure", "streetlighting", "waste_management", "water_and_sanitation", "grand_total"] as const

/**
 * GET /api/data/wards?ward=42
 *
 * Public API for ward-level data: infrastructure, potholes, crashes, air quality.
 * `ward` is a historical DataMeet-243 ward number. Potholes and spending are
 * recorded on BBMP's 198-ward map, so they are allocated to the 243 ward by
 * area overlap and carry an `estimate` provenance object.
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
    // ward_potholes and ward_spend_category carry BBMP-198 numbers: read the
    // 198 wards overlapping this 243 ward, never the same number.
    const bbmp198WardNos = [...bbmp198AllocationWeights([{ ward_no: wn, legacy_share: 1 }], BBMP198_INDEX).keys()]
    const noRows = Promise.resolve({ data: [] as never[] })
    const [ward, infra, busStops, potholes, crashes, air, spend, workOrders] = await Promise.all([
      supabase.from("wards").select("ward_no, ward_name, assembly_constituency, zone").eq("ward_no", wn).eq("city_id", "bengaluru").single(),
      supabase.from("ward_infra_stats").select("signal_count").eq("ward_no", wn).single(),
      // Bus figures come from ward_bus_stops (one row per physical stop), not
      // ward_infra_stats, whose bus columns counted duplicate stop rows.
      supabase.from("ward_bus_stops").select("stop_count, total_trips").eq("ward_no", wn).maybeSingle(),
      bbmp198WardNos.length
        ? supabase.from("ward_potholes").select("ward_no, complaints, data_year").in("ward_no", bbmp198WardNos)
        : noRows,
      supabase.from("ward_road_crashes").select("crashes_2024, fatal_2024, crashes_2025, fatal_2025").eq("ward_no", wn).single(),
      supabase.from("ward_air_quality").select("station_name, avg_pm25, avg_pm10, data_year").eq("ward_no", wn).single(),
      bbmp198WardNos.length
        ? supabase.from("ward_spend_category").select("ward_no, buildings_facilities, drainage, roads_and_drains, roads_and_infrastructure, streetlighting, waste_management, water_and_sanitation, grand_total, period").in("ward_no", bbmp198WardNos)
        : noRows,
      // Work orders via v_work_orders_243 (overlap-inclusive): each work
      // order surfaces in every DataMeet-243 ward its BBMP-225 ward
      // materially overlaps. overlap_share + is_primary expose the mapping.
      supabase.from("v_work_orders_243").select("work_order_id, ward_no, source_ward_name, datameet243_no, overlap_share, is_primary, description, contractor_name, contractor_phone, sanctioned_amount, net_paid, deduction, fy, contractor_code, division, budget_head, start_date, end_date, order_ref, sbr_ref, bill_ref, payment_status, data_source, ifms_wbid").eq("datameet243_no", wn).order("sanctioned_amount", { ascending: false, nullsFirst: false }).order("net_paid", { ascending: false, nullsFirst: false }).limit(50),
    ])

    const potholeRows = (potholes.data ?? []) as Array<{ ward_no: number; complaints: number | null; data_year: string | null }>
    const potholeEstimate = estimateDatameet243FromBbmp198(BBMP198_INDEX, wn, potholeRows, ["complaints"])
    const spendRows = (spend.data ?? []) as Array<{ ward_no: number; period: string | null } & Record<(typeof SPEND_FIELDS)[number], number | null>>
    const spendEstimate = estimateDatameet243FromBbmp198(BBMP198_INDEX, wn, spendRows, SPEND_FIELDS)

    return Response.json({
      ward: ward.data,
      // Same keys as before. daily_trips = scheduled bus arrivals a day summed
      // over the ward's stops (a bus stopping at two of them counts twice).
      // A ward with no ward_bus_stops row has no stop inside it.
      infrastructure: infra.data
        ? {
            signal_count: infra.data.signal_count,
            bus_stop_count: busStops.data?.stop_count ?? 0,
            daily_trips: busStops.data?.total_trips ?? 0,
          }
        : null,
      potholes: potholeEstimate
        ? { ...potholeEstimate.values, data_year: potholeRows[0]?.data_year ?? null, estimate: bbmp198EstimateProvenance(potholeEstimate) }
        : null,
      road_crashes: crashes.data,
      air_quality: air.data,
      spending: spendEstimate
        ? { ...spendEstimate.values, period: spendRows[0]?.period ?? null, estimate: bbmp198EstimateProvenance(spendEstimate) }
        : null,
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
