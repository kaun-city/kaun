import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const maxDuration = 30

/**
 * GET /api/export?type=ward-spending|ward-demographics|all
 *
 * Exports ward-level data as CSV for media/research use.
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
    if (type === "ward-spending" || type === "all") {
      const { data: spending } = await supabase
        .from("ward_spend_category")
        .select("ward_no, ward_name, buildings_facilities, drainage, roads_and_drains, roads_and_infrastructure, streetlighting, waste_management, water_and_sanitation, grand_total, period")
        .order("ward_no")

      if (type === "ward-spending") {
        return csvResponse(spending ?? [], "kaun-ward-spending.csv")
      }

      // For "all" — join with demographics
      const { data: stats } = await supabase
        .from("ward_stats")
        .select("assembly_constituency, total_population, total_households, total_area_sqkm, avg_population_density, total_road_length_km, total_lakes, total_parks, total_playgrounds, total_govt_schools, total_police_stations, total_fire_stations, total_bus_stops, total_bus_routes, total_streetlights, streetlights, trees, namma_clinics, dwcc_count, ward_count, data_year, source")
        .order("assembly_constituency")

      const [infraRes, potholesRes, crashesRes, airRes, workOrderRes] = await Promise.all([
        supabase.from("ward_infra_stats").select("ward_no, ward_name, signal_count, bus_stop_count, daily_trips").order("ward_no"),
        supabase.from("ward_potholes").select("ward_no, ward_name, complaints, data_year").order("ward_no"),
        supabase.from("ward_road_crashes").select("ward_no, crashes_2024, fatal_2024, crashes_2025, fatal_2025").order("ward_no"),
        supabase.from("ward_air_quality").select("ward_no, station_name, avg_pm25, avg_pm10, data_year").order("ward_no"),
        supabase.from("bbmp_work_orders").select("ward_no").order("ward_no"),
      ])
      const infraStats = infraRes.data ?? []
      const potholes = potholesRes.data ?? []
      const crashes = crashesRes.data ?? []
      const airQuality = airRes.data ?? []
      // Count work orders per ward
      const woCountMap = new Map<number, number>()
      for (const wo of workOrderRes.data ?? []) {
        woCountMap.set(wo.ward_no, (woCountMap.get(wo.ward_no) ?? 0) + 1)
      }

      // Build lookup maps
      const spendMap = new Map((spending ?? []).map(s => [s.ward_no, s]))
      const spendByName = new Map((spending ?? []).map(s => [s.ward_name?.toLowerCase().trim(), s]))
      const infraMap = new Map(infraStats.map(i => [i.ward_no, i]))
      const potholesMap = new Map(potholes.map(p => [p.ward_no, p]))
      const crashesMap = new Map(crashes.map(c => [c.ward_no, c]))
      const airMap = new Map(airQuality.map(a => [a.ward_no, a]))

      // Get ward list with AC mapping
      const { data: wards } = await supabase
        .from("wards")
        .select("ward_no, ward_name, assembly_constituency, zone")
        .eq("city_id", "bengaluru")
        .order("ward_no")

      // Stats are AC-level — normalize keys for case-insensitive matching
      const acStats = new Map((stats ?? []).map(s => [s.assembly_constituency?.toLowerCase().trim(), s]))

      const combined = (wards ?? []).map(w => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const spend: any = spendMap.get(w.ward_no) ?? spendByName.get(w.ward_name?.toLowerCase().trim()) ?? {}
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
          pothole_complaints: (potholesMap.get(w.ward_no) as any)?.complaints ?? "",
          pothole_data_year: (potholesMap.get(w.ward_no) as any)?.data_year ?? "",
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

      return csvResponse(combined, "kaun-bengaluru-ward-data.csv")
    }

    if (type === "ward-demographics") {
      const { data: stats } = await supabase
        .from("ward_stats")
        .select("*")
        .order("assembly_constituency")

      return csvResponse(stats ?? [], "kaun-ward-demographics.csv")
    }

    return Response.json({ error: "Invalid type. Use: ward-spending, ward-demographics, or all" }, { status: 400 })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Export failed" }, { status: 500 })
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function csvResponse(rows: any[], filename: string): Response {
  if (!rows.length) {
    return new Response("No data available", { status: 404, headers: { "Content-Type": "text/plain" } })
  }

  const headers = Object.keys(rows[0])
  const sourceAttribution = [
    "",
    "# DATA SOURCES & ATTRIBUTION",
    `"# Ward spending (2018-2023): BBMP work orders via opencity.in (https://data.opencity.in/dataset/bbmp-work-orders-categorised-2018-2023)"`,
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
