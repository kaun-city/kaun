import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { MAP_LAYERS, getLayer, quantileBreaks } from "@/lib/map-layers"
import { publicSupabaseConfig } from "@/lib/supabase-config"
import gbaCrosswalkJson from "@/public/bengaluru-gba-369-to-datameet-243.json"
import sourceCrosswalkJson from "@/public/bengaluru-ward-crosswalk.json"
import { constituencyKey } from "@/lib/bengaluru-constituencies"

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

type Values = Record<string, number>

type GbaCrosswalkRow = (typeof gbaCrosswalkJson.rows)[number]

function currentizeLegacyValues(legacyValues: Values): Values {
  const values: Values = {}
  for (const row of gbaCrosswalkJson.rows as GbaCrosswalkRow[]) {
    const key = `${row.corporation_id}:${row.ward_no}`
    const estimate = row.historical_wards.reduce(
      (sum, ref) => sum + (legacyValues[String(ref.ward_no)] ?? 0) * ref.legacy_share,
      0,
    )
    if (row.historical_wards.some(ref => legacyValues[String(ref.ward_no)] !== undefined)) {
      values[key] = estimate
    }
  }
  return values
}

/**
 * MLA metrics are constituency data, so join them directly to the current GBA
 * ward's published assembly constituency instead of routing through 243 wards.
 */
async function mlaMetric(
  supabase: SupabaseClient,
  cityId: string,
  column: "criminal_cases" | "attendance_pct" | "lad_utilization_pct",
): Promise<Values> {
  const [wards, cards] = await Promise.all([
    cityId === "bengaluru"
      ? supabase.from("gba_wards").select("gba_corporation_id,gba_ward_no,gba_ac")
      : supabase.from("wards").select("ward_no,assembly_constituency").eq("city_id", cityId),
    supabase.from("rep_report_cards").select(`constituency,${column}`).eq("role", "MLA"),
  ])
  const byAc = new Map<string, number>()
  for (const c of (cards.data ?? []) as Array<Record<string, unknown>>) {
    const ac = constituencyKey(String(c.constituency ?? ""))
    const v = Number(c[column])
    if (ac && Number.isFinite(v)) byAc.set(ac, v)
  }
  const values: Values = {}
  for (const w of wards.data ?? []) {
    const ac = constituencyKey(String(("gba_ac" in w ? w.gba_ac : w.assembly_constituency) ?? ""))
    const v = byAc.get(ac)
    if (v !== undefined) {
      const key = "gba_ward_no" in w ? `${w.gba_corporation_id}:${w.gba_ward_no}` : String(w.ward_no)
      values[key] = v
    }
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
      let query = supabase.from("ward_potholes").select("ward_no,complaints")
      if (cityId !== "bengaluru") query = query.eq("city_id", cityId)
      const { data } = await query
      const values: Values = {}
      for (const r of data ?? []) if (r.complaints != null) values[r.ward_no] = r.complaints
      return cityId === "bengaluru" ? currentizeLegacyValues(values) : values
    }

    case "ward_spend": {
      let query = supabase.from("ward_spend_category").select("ward_no,grand_total")
      if (cityId !== "bengaluru") query = query.eq("city_id", cityId)
      const { data } = await query
      const values: Values = {}
      // Stored values are rupees; the public layer contract is INR lakh.
      for (const r of data ?? []) if (r.grand_total != null) values[r.ward_no] = Number(r.grand_total) / 100_000
      return cityId === "bengaluru" ? currentizeLegacyValues(values) : values
    }

    case "flagged_contractors": {
      let query = supabase
        .from("contractor_profiles")
        .select("wards,blacklist_flags")
        .neq("blacklist_flags", "{}")
        .limit(5000)
      // Bengaluru's historical contractor profile table predates city_id;
      // filtering that missing column makes the whole layer silently empty.
      if (cityId !== "bengaluru") query = query.eq("city_id", cityId)
      const { data } = await query
      const values: Values = {}
      const legacyBySource = new Map<number, number[]>()
      for (const row of sourceCrosswalkJson.rows) {
        legacyBySource.set(row.bbmp225_no, row.shares.map(share => share.datameet243_no))
      }
      for (const r of data ?? []) {
        const flags = (r.blacklist_flags ?? []) as unknown[]
        if (!Array.isArray(flags) || flags.length === 0) continue
        const legacyWards = new Set<number>()
        for (const w of (r.wards ?? []) as number[]) {
          for (const legacyWard of legacyBySource.get(w) ?? []) legacyWards.add(legacyWard)
        }
        for (const legacyWard of legacyWards) values[legacyWard] = (values[legacyWard] ?? 0) + 1
      }
      return cityId === "bengaluru" ? currentizeLegacyValues(values) : values
    }

    case "hospitals": {
      const { data } = await supabase
        .from("ward_amenities")
        .select("ward_no,hospitals")
        .eq("city_id", cityId)
      const values: Values = {}
      for (const r of data ?? []) if (r.hospitals != null) values[r.ward_no] = r.hospitals
      return cityId === "bengaluru" ? currentizeLegacyValues(values) : values
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

  const { url: supabaseUrl, anonKey } = publicSupabaseConfig()
  const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || anonKey)

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
