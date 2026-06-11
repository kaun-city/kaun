import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { MAP_LAYERS, getLayer, quantileBreaks } from "@/lib/map-layers"

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

type Values = Record<number, number>

/**
 * Per-ward values for an MLA-affidavit metric: join wards → rep_report_cards
 * on assembly constituency, so every ward inherits its MLA's number.
 */
async function mlaMetric(
  supabase: SupabaseClient,
  cityId: string,
  column: "criminal_cases" | "attendance_pct" | "lad_utilization_pct",
): Promise<Values> {
  const [wards, cards] = await Promise.all([
    supabase.from("wards").select("ward_no,assembly_constituency").eq("city_id", cityId),
    supabase.from("rep_report_cards").select(`constituency,${column}`).eq("role", "MLA"),
  ])
  const byAc = new Map<string, number>()
  for (const c of (cards.data ?? []) as Array<Record<string, unknown>>) {
    const ac = String(c.constituency ?? "").toLowerCase().trim()
    const v = Number(c[column])
    if (ac && Number.isFinite(v)) byAc.set(ac, v)
  }
  const values: Values = {}
  for (const w of wards.data ?? []) {
    const ac = String(w.assembly_constituency ?? "").toLowerCase().trim()
    const v = byAc.get(ac)
    if (v !== undefined) values[w.ward_no] = v
  }
  return values
}

async function layerValues(supabase: SupabaseClient, layerId: string, cityId: string): Promise<Values> {
  switch (layerId) {
    case "criminal_cases":
      return mlaMetric(supabase, cityId, "criminal_cases")
    case "attendance":
      return mlaMetric(supabase, cityId, "attendance_pct")
    case "lad_utilization":
      return mlaMetric(supabase, cityId, "lad_utilization_pct")

    case "potholes": {
      const { data } = await supabase
        .from("ward_potholes")
        .select("ward_no,complaints")
        .eq("city_id", cityId)
      const values: Values = {}
      for (const r of data ?? []) if (r.complaints != null) values[r.ward_no] = r.complaints
      return values
    }

    case "ward_spend": {
      const { data } = await supabase
        .from("ward_spend_category")
        .select("ward_no,grand_total")
        .eq("city_id", cityId)
      const values: Values = {}
      for (const r of data ?? []) if (r.grand_total != null) values[r.ward_no] = Number(r.grand_total)
      return values
    }

    case "flagged_contractors": {
      const { data } = await supabase
        .from("contractor_profiles")
        .select("wards,blacklist_flags")
        .eq("city_id", cityId)
        .limit(5000)
      const values: Values = {}
      for (const r of data ?? []) {
        const flags = (r.blacklist_flags ?? []) as unknown[]
        if (!Array.isArray(flags) || flags.length === 0) continue
        for (const w of (r.wards ?? []) as number[]) {
          values[w] = (values[w] ?? 0) + 1
        }
      }
      return values
    }

    case "hospitals": {
      const { data } = await supabase
        .from("ward_amenities")
        .select("ward_no,hospitals")
        .eq("city_id", cityId)
      const values: Values = {}
      for (const r of data ?? []) if (r.hospitals != null) values[r.ward_no] = r.hospitals
      return values
    }

    default:
      return {}
  }
}

/**
 * GET /api/map-layers                      → layer registry
 * GET /api/map-layers?layer=criminal_cases → per-ward values + quantile breaks
 *
 * Powers the choropleth ("paint the city") mode on the map. Cached 1h —
 * underlying data refreshes daily/weekly at most.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const layerId = url.searchParams.get("layer")
  const cityId = url.searchParams.get("city") || "bengaluru"

  if (!layerId) {
    return Response.json({ layers: MAP_LAYERS }, { headers: CORS_HEADERS })
  }

  const meta = getLayer(layerId)
  if (!meta) {
    return Response.json(
      { error: `Unknown layer '${layerId}'`, available: MAP_LAYERS.map(l => l.id) },
      { status: 400, headers: CORS_HEADERS },
    )
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  let values: Values = {}
  try {
    values = await layerValues(supabase, layerId, cityId)
  } catch {
    // A missing table/column for this city degrades to an empty layer
    // rather than a 500 — the UI shows "no data yet".
  }

  const nums = Object.values(values)
  return Response.json(
    {
      layer: meta,
      city: cityId,
      values,
      breaks: quantileBreaks(nums),
      ward_count: nums.length,
      source: "kaun.city — public civic data, MIT licensed platform",
    },
    { headers: CORS_HEADERS },
  )
}
