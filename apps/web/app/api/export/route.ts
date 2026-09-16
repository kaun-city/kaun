import { createClient } from "@supabase/supabase-js"
import { estimateDatameet243FromBbmp198 } from "@/lib/bbmp198-crosswalk"
import { BBMP198_CROSSWALK_VERSION } from "@/lib/constants"
import { BBMP198_INDEX, WARD_CROSSWALK_PAGE } from "@/lib/bbmp198-server"

export const runtime = "nodejs"
export const maxDuration = 30

const SPEND_FIELDS = ["buildings_facilities", "drainage", "roads_and_drains", "roads_and_infrastructure", "streetlighting", "waste_management", "water_and_sanitation", "grand_total"] as const
type SpendRow = { ward_no: number; ward_name: string | null; period: string | null } & Record<(typeof SPEND_FIELDS)[number], number | null>

const BBMP198_ALLOCATION_NOTE =
  `"# Ward spending and pothole complaints are recorded on BBMP's 198-ward map (2010 delimitation). They are allocated to these DataMeet-243 wards by area overlap (estimates; crosswalk ${BBMP198_CROSSWALK_VERSION}: ${WARD_CROSSWALK_PAGE}). The unallocated source table is type=ward-spending-bbmp198."`

/** 198-keyed spend rows allocated to every DataMeet-243 ward, keyed by 243 ward number. */
function spendBy243(rows: readonly SpendRow[]) {
  const out = new Map<number, Record<(typeof SPEND_FIELDS)[number], number> & { period: string | null }>()
  for (const wardNo of BBMP198_INDEX.keys()) {
    const estimate = estimateDatameet243FromBbmp198(BBMP198_INDEX, wardNo, rows, SPEND_FIELDS)
    if (estimate) out.set(wardNo, { ...estimate.values, period: rows[0]?.period ?? null })
  }
  return out
}

/**
 * GET /api/export?type=ward-spending|ward-spending-bbmp198|ward-demographics|all
 *
 * Exports ward-level data as CSV for media/research use. Ward numbers are
 * historical DataMeet-243 wards, except ward-spending-bbmp198, which is the
 * source table on BBMP's 198-ward map with its own ward numbers.
 * No auth required — this is public data.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const type = url.searchParams.get("type") || "all"

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  try {
    if (type === "ward-spending-bbmp198") {
      // The source table as published, labelled with its own ward map.
      const { data } = await supabase
        .from("ward_spend_category")
        .select(`ward_no, ward_name, ${SPEND_FIELDS.join(", ")}, period`)
        .order("ward_no")
      const rows = ((data ?? []) as unknown as SpendRow[]).map(({ ward_no, ward_name, ...rest }) => ({
        bbmp198_ward_no: ward_no,
        bbmp198_ward_name: ward_name,
        ...rest,
      }))
      return csvResponse(rows, "kaun-ward-spending-bbmp198.csv", [
        `"# Ward numbers in this file are BBMP's 198-ward map (2010 delimitation), not DataMeet-243 or current GBA wards. Do not join them to other Kaun ward numbers; use the crosswalk: ${WARD_CROSSWALK_PAGE}"`,
      ])
    }

    if (type === "ward-spending" || type === "all") {
      const { data: spendingRows } = await supabase
        .from("ward_spend_category")
        .select(`ward_no, ward_name, ${SPEND_FIELDS.join(", ")}, period`)
        .order("ward_no")
      // ward_spend_category carries BBMP-198 numbers: allocate to 243 wards.
      const spendMap = spendBy243((spendingRows ?? []) as unknown as SpendRow[])

      if (type === "ward-spending") {
        const rows = [...BBMP198_INDEX.values()]
          .filter(row => spendMap.has(row.datameet243_no))
          .map(row => ({ ward_no: row.datameet243_no, ward_name: row.datameet243_name, ...spendMap.get(row.datameet243_no) }))
        return csvResponse(rows, "kaun-ward-spending.csv", [BBMP198_ALLOCATION_NOTE])
      }

      // For "all" — get demographics via direct fetch to PostgREST RPC
      // (supabase.rpc() JS client silently fails; the raw fetch approach
      // used by lib/supabase.ts rpc() works — use the same method)
      const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      const rpcHeaders = {
        "apikey": SUPA_KEY,
        "Authorization": `Bearer ${SUPA_KEY}`,
        "Content-Type": "application/json",
      }

      const { data: wardsPreload } = await supabase
        .from("wards")
        .select("assembly_constituency")
        .eq("city_id", "bengaluru")
      const uniqueACs = [...new Set((wardsPreload ?? []).map(w => w.assembly_constituency).filter(Boolean))]

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const acStatsResults: any[] = []
      // Batch RPC calls in parallel groups of 5 using raw fetch
      for (let i = 0; i < uniqueACs.length; i += 5) {
        const batch = uniqueACs.slice(i, i + 5)
        const results = await Promise.all(
          batch.map(ac =>
            fetch(`${SUPA_URL}/rest/v1/rpc/ward_stats_by_ac`, {
              method: "POST",
              headers: rpcHeaders,
              body: JSON.stringify({ p_assembly_constituency: ac }),
            }).then(r => r.ok ? r.json() : null).catch(() => null)
          )
        )
        for (let j = 0; j < results.length; j++) {
          if (results[j]) acStatsResults.push({ ...results[j], assembly_constituency: batch[j] })
        }
      }

      const [infraRes, potholesRes, crashesRes, airRes, workOrderRes] = await Promise.all([
        supabase.from("ward_infra_stats").select("ward_no, ward_name, signal_count, bus_stop_count, daily_trips").order("ward_no"),
        supabase.from("ward_potholes").select("ward_no, complaints, data_year").order("ward_no"),
        supabase.from("ward_road_crashes").select("ward_no, crashes_2024, fatal_2024, crashes_2025, fatal_2025").order("ward_no"),
        supabase.from("ward_air_quality").select("ward_no, station_name, avg_pm25, avg_pm10, data_year").order("ward_no"),
        supabase.from("bbmp_work_orders").select("ward_no, bbmp_ward_no, ward_class").order("ward_no"),
      ])
      const infraStats = infraRes.data ?? []
      const potholeRows = (potholesRes.data ?? []) as Array<{ ward_no: number; complaints: number | null; data_year: string | null }>
      const crashes = crashesRes.data ?? []
      const airQuality = airRes.data ?? []
      // Count work orders per ward using bbmp_ward_no (DataMeet-243, from the
      // Kaun ward crosswalk). Skip city-wide / unmapped rows so they don't
      // inflate a ward. Defensive fallback to raw ward_no pre-backfill.
      const woCountMap = new Map<number, number>()
      for (const wo of workOrderRes.data ?? []) {
        if (wo.ward_class === "citywide" || wo.ward_class === "unmapped") continue
        const wn = wo.bbmp_ward_no ?? wo.ward_no
        if (wn != null) woCountMap.set(wn, (woCountMap.get(wn) ?? 0) + 1)
      }

      // Build lookup maps. Spend and potholes are allocated from BBMP-198
      // wards by area overlap; never matched by ward number or ward name.
      const infraMap = new Map(infraStats.map(i => [i.ward_no, i]))
      const potholesMap = new Map<number, { complaints: number; data_year: string | null }>()
      for (const wardNo of BBMP198_INDEX.keys()) {
        const estimate = estimateDatameet243FromBbmp198(BBMP198_INDEX, wardNo, potholeRows, ["complaints"])
        if (estimate) potholesMap.set(wardNo, { complaints: estimate.values.complaints, data_year: potholeRows[0]?.data_year ?? null })
      }
      const crashesMap = new Map(crashes.map(c => [c.ward_no, c]))
      const airMap = new Map(airQuality.map(a => [a.ward_no, a]))

      // Get ward list with AC mapping
      const { data: wards } = await supabase
        .from("wards")
        .select("ward_no, ward_name, assembly_constituency, zone")
        .eq("city_id", "bengaluru")
        .order("ward_no")

      // Stats are AC-level — normalize for matching
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const acStats = new Map(acStatsResults.map((s: any) => [(s.assembly_constituency ?? s._ac ?? "").toLowerCase().trim(), s]))

      const combined = (wards ?? []).map(w => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const spend: any = spendMap.get(w.ward_no) ?? {}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const infra: any = infraMap.get(w.ward_no) ?? {}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const acStat: any = acStats.get(w.assembly_constituency?.toLowerCase().trim()) ?? {}
        return {
          ward_no: w.ward_no,
          ward_name: w.ward_name,
          assembly_constituency: w.assembly_constituency,
          zone: w.zone,
          // Demographics (AC level — shared across wards in same AC)
          ac_total_population: acStat.total_population ?? "",
          ac_total_households: acStat.total_households ?? "",
          ac_area_sqkm: acStat.total_area_sqkm ?? "",
          ac_population_density: acStat.avg_population_density ?? "",
          ac_road_length_km: acStat.total_road_length_km ?? "",
          ac_lakes: acStat.total_lakes ?? "",
          ac_parks: acStat.total_parks ?? "",
          ac_playgrounds: acStat.total_playgrounds ?? "",
          ac_govt_schools: acStat.total_govt_schools ?? "",
          ac_police_stations: acStat.total_police_stations ?? "",
          ac_fire_stations: acStat.total_fire_stations ?? "",
          ac_streetlights: acStat.streetlights ?? acStat.total_streetlights ?? "",
          ac_trees: acStat.trees ?? "",
          ac_namma_clinics: acStat.namma_clinics ?? "",
          ac_dwcc: acStat.dwcc_count ?? "",
          ac_ward_count: acStat.ward_count ?? "",
          demographics_source: acStat.source ?? "",
          demographics_year: acStat.data_year ?? "",
          // Infrastructure (ward level)
          traffic_signals: infra.signal_count ?? "",
          bus_stops: infra.bus_stop_count ?? "",
          daily_bus_trips: infra.daily_trips ?? "",
          // Spending (ward level, Rs)
          spend_buildings_facilities: spend.buildings_facilities ?? "",
          spend_drainage: spend.drainage ?? "",
          spend_roads_and_drains: spend.roads_and_drains ?? "",
          spend_roads_and_infrastructure: spend.roads_and_infrastructure ?? "",
          spend_streetlighting: spend.streetlighting ?? "",
          spend_waste_management: spend.waste_management ?? "",
          spend_water_and_sanitation: spend.water_and_sanitation ?? "",
          spend_grand_total: spend.grand_total ?? "",
          spend_period: spend.period ?? "",
          // Potholes
          pothole_complaints: potholesMap.get(w.ward_no)?.complaints ?? "",
          pothole_data_year: potholesMap.get(w.ward_no)?.data_year ?? "",
          // Road crashes
          road_crashes_2024: (crashesMap.get(w.ward_no) as any)?.crashes_2024 ?? "",
          fatal_crashes_2024: (crashesMap.get(w.ward_no) as any)?.fatal_2024 ?? "",
          road_crashes_2025: (crashesMap.get(w.ward_no) as any)?.crashes_2025 ?? "",
          fatal_crashes_2025: (crashesMap.get(w.ward_no) as any)?.fatal_2025 ?? "",
          // Air quality
          air_quality_station: (airMap.get(w.ward_no) as any)?.station_name ?? "",
          avg_pm25: (airMap.get(w.ward_no) as any)?.avg_pm25 ?? "",
          avg_pm10: (airMap.get(w.ward_no) as any)?.avg_pm10 ?? "",
          // Work orders
          total_work_orders: woCountMap.get(w.ward_no) ?? "",
        }
      })

      return csvResponse(combined, "kaun-bengaluru-ward-data.csv", [BBMP198_ALLOCATION_NOTE])
    }

    if (type === "ward-demographics") {
      const { data: stats } = await supabase
        .from("ward_stats")
        .select("*")
        .order("assembly_constituency")

      return csvResponse(stats ?? [], "kaun-ward-demographics.csv")
    }

    return Response.json({ error: "Invalid type. Use: ward-spending, ward-spending-bbmp198, ward-demographics, or all" }, { status: 400 })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Export failed" }, { status: 500 })
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function csvResponse(rows: any[], filename: string, notes: string[] = []): Response {
  if (!rows.length) {
    return new Response("No data available", { status: 404, headers: { "Content-Type": "text/plain" } })
  }

  const headers = Object.keys(rows[0])
  const sourceAttribution = [
    "",
    "# DATA SOURCES & ATTRIBUTION",
    `"# Ward spending (2018-2023): BBMP work orders via opencity.in (https://data.opencity.in/dataset/bbmp-work-orders-categorised-2018-2023)"`,
    ...notes,
    `"# Population & households: Census data via opencity.in (https://opencity.in)"`,
    `"# Infrastructure (traffic signals, bus stops): OpenStreetMap contributors (https://openstreetmap.org) / BMTC via opencity.in"`,
    `"# Trees, clinics, waste centers: KGIS - Karnataka Geographic Information System (https://kgis.ksrsac.in)"`,
    `"# Elected representative data: Election Commission of India via MyNeta (https://myneta.info)"`,
    `"# All data is from public records and open datasets. kaun.city aggregates and maps it."`,
    `"# License: Data sourced under respective open data licenses. This export is provided for journalism, research, and civic use."`,
    `"# Export generated by kaun.city on ${new Date().toISOString().split("T")[0]}"`,
  ]

  const csvLines = [
    headers.join(","),
    ...rows.map(row =>
      headers.map(h => {
        const val = row[h]
        if (val === null || val === undefined) return ""
        const str = String(val)
        return str.includes(",") || str.includes('"') || str.includes("\n")
          ? `"${str.replace(/"/g, '""')}"`
          : str
      }).join(",")
    ),
    ...sourceAttribution,
  ]

  return new Response(csvLines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "public, max-age=3600",
    },
  })
}
