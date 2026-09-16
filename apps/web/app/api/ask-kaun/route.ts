import { openai } from "@ai-sdk/openai"
import { generateText, tool, zodSchema, stepCountIs } from "ai"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"
import { enforceRateLimit, makeAiLimiter } from "@/lib/ratelimit"
import { BBMP_198_RECORDS_ATTRIBUTABLE, INFRA_BUS_COUNTS_RELIABLE } from "@/lib/ward-data-quality"
import { publicSupabaseConfig } from "@/lib/supabase-config"
import {
  attributableHistoricalWards, gbaWardKey, indexGbaCrosswalk, sourceWardNosForLegacyWard,
  type GbaCrosswalkArtifact, type LegacySourceWardRow,
} from "@/lib/gba-crosswalk"
// Bundled server-side (no relative fetch from a route handler). These are the
// same versioned public assets the client reads.
import legacyWardCrosswalk from "@/public/bengaluru-ward-crosswalk.json"
import gbaWardCrosswalk from "@/public/bengaluru-gba-369-to-datameet-243.json"

export const runtime = "nodejs"
export const maxDuration = 60

const LEGACY_SOURCE_WARDS = (legacyWardCrosswalk as { rows: LegacySourceWardRow[] }).rows
const GBA_CROSSWALK_INDEX = indexGbaCrosswalk(gbaWardCrosswalk as GbaCrosswalkArtifact)

/** Former 243 wards whose ward-tagged records may be attributed to the current GBA ward. */
function recordWardsFor(c: AskKaunRequest["ward_context"]) {
  if (c.boundary_system !== "gba-369-2025" || c.gba_corporation_id == null || c.gba_ward_no == null) return []
  const row = GBA_CROSSWALK_INDEX.get(gbaWardKey(c.gba_corporation_id, c.gba_ward_no))
  return row ? attributableHistoricalWards(row.historical_wards) : []
}

export interface AskKaunRequest {
  question: string
  ward_context: {
    ward_no: number | null
    ward_name: string
    assembly_constituency: string
    boundary_system?: "gba-369-2025" | "datameet-243"
    gba_corporation_id?: number | null
    gba_ward_no?: number | null
    historical_wards?: Array<{ ward_no: number; ward_name: string; current_share: number }>
    corporator_name?: string | null
    corporator_party?: string | null
    mla_name?: string | null
    mla_party?: string | null
    mla_attendance_pct?: number | null
    mla_questions_asked?: number | null
    mla_lad_utilization_pct?: number | null
    mla_criminal_cases?: number | null
    committee_meetings?: number | null
    signal_count?: number | null
    bus_stop_count?: number | null
    pothole_complaints?: number | null
    ward_spend_total_lakh?: number | null
    ward_spend_roads_pct?: number | null
    grievance_count?: number | null
    bbmp_ward_office?: string | null
    bbmp_complaint_no?: string | null
    // OSM amenities
    hospitals?: number | null
    clinics?: number | null
    pharmacies?: number | null
    atms?: number | null
    banks?: number | null
    public_toilets?: number | null
    ev_charging?: number | null
    metro_stations?: number | null
  }
}

function buildContext(c: AskKaunRequest["ward_context"]): string {
  const currentIdentity = c.boundary_system === "gba-369-2025"
    ? `${c.ward_name} (current GBA ward ${c.gba_corporation_id}:${c.gba_ward_no})`
    : `${c.ward_name} (historical ward #${c.ward_no})`
  const lines = [`Ward: ${currentIdentity}, Assembly Constituency: ${c.assembly_constituency}`]
  if (c.historical_wards?.length) {
    lines.push(`Historical data provenance: ${c.historical_wards.map(ref => `${ref.ward_name} #${ref.ward_no} (${Math.round(ref.current_share * 100)}% of current ward area)`).join(", ")}`)
  }
  const recordWards = recordWardsFor(c)
  if (recordWards.length) {
    lines.push(`Former wards with attributable ward-level records (>=10% overlap; the only ward numbers to use for ward_contractors): ${recordWards.map(ref => `${ref.ward_name} #${ref.ward_no}`).join(", ")}`)
  }
  if (c.corporator_name)             lines.push(`Corporator: ${c.corporator_name}${c.corporator_party ? ` (${c.corporator_party})` : ""}`)
  if (c.mla_name)                    lines.push(`MLA: ${c.mla_name}${c.mla_party ? ` (${c.mla_party})` : ""}`)
  if (c.mla_attendance_pct != null)  lines.push(`MLA attendance: ${c.mla_attendance_pct}%`)
  if (c.mla_questions_asked != null) lines.push(`MLA questions asked: ${c.mla_questions_asked}`)
  if (c.mla_lad_utilization_pct != null) lines.push(`MLA LAD fund utilization: ${c.mla_lad_utilization_pct}%`)
  if (c.mla_criminal_cases != null)  lines.push(`MLA criminal cases (EC affidavit): ${c.mla_criminal_cases}`)
  if (c.committee_meetings != null && BBMP_198_RECORDS_ATTRIBUTABLE) lines.push(`Ward committee meetings recorded (2020-22): ${c.committee_meetings}`)
  if (c.signal_count != null)        lines.push(`Traffic signals: ${c.signal_count} (city avg: 5.5)`)
  if (c.bus_stop_count != null && INFRA_BUS_COUNTS_RELIABLE) lines.push(`BMTC bus stops: ${c.bus_stop_count}`)
  if (c.pothole_complaints != null && BBMP_198_RECORDS_ATTRIBUTABLE) lines.push(`Pothole complaints: ${c.pothole_complaints}`)
  if (c.ward_spend_total_lakh != null && BBMP_198_RECORDS_ATTRIBUTABLE) lines.push(`BBMP ward spend: ₹${c.ward_spend_total_lakh} lakh (2018-2023)`)
  if (c.ward_spend_roads_pct != null && BBMP_198_RECORDS_ATTRIBUTABLE) lines.push(`Roads share of spend: ${c.ward_spend_roads_pct.toFixed(1)}%`)
  if (c.grievance_count != null)     lines.push(`BBMP grievances: ${c.grievance_count}`)
  // Amenities (OSM)
  if (c.hospitals != null)           lines.push(`Hospitals: ${c.hospitals}`)
  if (c.clinics != null)             lines.push(`Clinics: ${c.clinics}`)
  if (c.pharmacies != null)          lines.push(`Pharmacies: ${c.pharmacies}`)
  if (c.atms != null)                lines.push(`ATMs: ${c.atms}`)
  if (c.banks != null)               lines.push(`Banks: ${c.banks}`)
  if (c.public_toilets != null)      lines.push(`Public toilets: ${c.public_toilets}`)
  if (c.ev_charging != null)         lines.push(`EV charging stations: ${c.ev_charging}`)
  if (c.metro_stations != null)      lines.push(`Metro stations: ${c.metro_stations}`)
  return lines.join("\n")
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeTools(supabase: any) {
  return {
    rank_wards: tool({
      description: "Get top or bottom N wards across Bengaluru for a specific metric. Use for questions like 'which ward has the most signals', 'worst MLA attendance', 'where are the most potholes'.",
      inputSchema: zodSchema(z.object({
        // bus_stops and committee_meetings are withdrawn: their tables are inflated or 198-ward keyed (lib/ward-data-quality.ts).
        metric: z.enum(["signals", "mla_attendance", "lad_utilization", "criminal_cases", "hospitals", "pharmacies", "atms", "public_toilets", "ev_charging", "metro_stations"]),
        order: z.enum(["top", "bottom"]).describe("top = highest/best, bottom = lowest/worst"),
        limit: z.number().min(1).max(10).default(5),
      })),
      execute: async ({ metric, order, limit }): Promise<unknown> => {
        const asc = order === "bottom"
        if (metric === "signals") {
          const { data } = await supabase
            .from("ward_infra_stats")
            .select("ward_no, ward_name, signal_count")
            .not("signal_count", "is", null)
            .order("signal_count", { ascending: asc })
            .limit(limit)
          return data ?? []
        }
        if (["hospitals", "pharmacies", "atms", "public_toilets", "ev_charging", "metro_stations"].includes(metric)) {
          const { data } = await supabase
            .from("ward_amenities")
            .select("ward_no, hospitals, clinics, pharmacies, atms, banks, public_toilets, ev_charging, metro_stations")
            .not(metric, "is", null)
            .order(metric, { ascending: asc })
            .limit(limit)
          return data ?? []
        }
        if (metric === "mla_attendance" || metric === "lad_utilization" || metric === "criminal_cases") {
          const col = metric === "mla_attendance" ? "attendance_pct"
            : metric === "lad_utilization" ? "lad_utilization_pct"
            : "criminal_cases"
          const { data } = await supabase
            .from("rep_report_cards")
            .select("constituency, attendance_pct, lad_utilization_pct, criminal_cases, questions_asked")
            .eq("role", "MLA")
            .not(col, "is", null)
            .order(col, { ascending: asc })
            .limit(limit)
          return data ?? []
        }
        return []
      },
    }),

    compare_wards: tool({
      description: "Compare two or more wards by name side-by-side across MLA performance, infrastructure and meetings. Use for 'how does X compare to Y' questions.",
      inputSchema: zodSchema(z.object({
        ward_names: z.array(z.string()).min(2).max(4).describe("Ward names to compare, e.g. ['Whitefield', 'Koramangala']"),
      })),
      execute: async ({ ward_names }): Promise<unknown> => {
        const results = []
        for (const name of ward_names.slice(0, 4)) {
          const wardRes = await supabase
            .from("wards")
            .select("ward_no, ward_name, assembly_constituency")
            .ilike("ward_name", `%${name}%`)
            .limit(1)
            .single()
          const ward = wardRes.data as { ward_no: number; ward_name: string; assembly_constituency: string } | null
          if (!ward) { results.push({ searched: name, found: false }); continue }

          const [infra, report, meetings, amenities] = await Promise.all([
            supabase.from("ward_infra_stats").select("signal_count, bus_stop_count").eq("ward_no", ward.ward_no).single(),
            supabase.from("rep_report_cards").select("attendance_pct, lad_utilization_pct, criminal_cases").eq("constituency", ward.assembly_constituency).eq("role", "MLA").single(),
            supabase.from("ward_committee_meetings").select("meetings_count").eq("ward_no", ward.ward_no).single(),
            supabase.from("ward_amenities").select("hospitals, clinics, pharmacies, atms, banks, public_toilets, ev_charging, metro_stations").eq("ward_no", ward.ward_no).single(),
          ])
          const i = infra.data as { signal_count: number; bus_stop_count: number } | null
          const r = report.data as { attendance_pct: number; lad_utilization_pct: number; criminal_cases: number } | null
          const m = meetings.data as { meetings_count: number } | null
          const a = amenities.data as { hospitals: number; clinics: number; pharmacies: number; atms: number; banks: number; public_toilets: number; ev_charging: number; metro_stations: number } | null

          results.push({
            ward_name: ward.ward_name,
            ward_no: ward.ward_no,
            assembly_constituency: ward.assembly_constituency,
            signal_count: i?.signal_count ?? null,
            bus_stop_count: INFRA_BUS_COUNTS_RELIABLE ? i?.bus_stop_count ?? null : null,
            mla_attendance_pct: r?.attendance_pct ?? null,
            lad_utilization_pct: r?.lad_utilization_pct ?? null,
            criminal_cases: r?.criminal_cases ?? null,
            committee_meetings: BBMP_198_RECORDS_ATTRIBUTABLE ? m?.meetings_count ?? null : null,
            hospitals: a?.hospitals ?? null,
            clinics: a?.clinics ?? null,
            pharmacies: a?.pharmacies ?? null,
            public_toilets: a?.public_toilets ?? null,
            ev_charging: a?.ev_charging ?? null,
            metro_stations: a?.metro_stations ?? null,
          })
        }
        return results
      },
    }),

    find_ward: tool({
      description: "Look up a ward by name to get its number, assembly constituency and zone. Use when the user mentions a ward you don't have in context.",
      inputSchema: zodSchema(z.object({
        query: z.string().describe("Ward name or partial name to search"),
      })),
      execute: async ({ query }): Promise<unknown> => {
        const { data } = await supabase
          .from("wards")
          .select("ward_no, ward_name, assembly_constituency, zone")
          .ilike("ward_name", `%${query}%`)
          .limit(5)
        return data ?? []
      },
    }),

    search_contractor: tool({
      description: "Search for a contractor by name to see their full profile: total contracts, value, wards active in, deduction rate, and blacklist flags. Use for 'who is this contractor', 'is X contractor blacklisted', 'how much has X received'.",
      inputSchema: zodSchema(z.object({
        name: z.string().describe("Contractor name or partial name to search"),
      })),
      execute: async ({ name }): Promise<unknown> => {
        const { data } = await supabase
          .from("contractor_profiles")
          .select("canonical_name, aliases, phone, total_contracts, total_value_lakh, avg_deduction_pct, ward_count, wards, first_seen, last_seen, is_govt_entity, blacklist_flags")
          .ilike("canonical_name", `%${name}%`)
          .order("total_value_lakh", { ascending: false })
          .limit(5)
        return data ?? []
      },
    }),

    top_contractors: tool({
      description: "Get the top contractors in Bengaluru by total value, or the most flagged/suspicious ones. Use for 'biggest contractors', 'who gets the most BBMP contracts', 'any blacklisted contractors', 'most suspicious contractors'.",
      inputSchema: zodSchema(z.object({
        filter: z.enum(["by_value", "by_contracts", "flagged", "high_deduction", "multi_ward"]).describe("by_value=highest total value, by_contracts=most contracts, flagged=blacklisted, high_deduction=>15% deduction rate, multi_ward=active in >10 wards"),
        limit: z.number().min(1).max(10).default(5),
      })),
      execute: async ({ filter, limit }): Promise<unknown> => {
        let query = supabase
          .from("contractor_profiles")
          .select("canonical_name, aliases, phone, total_contracts, total_value_lakh, avg_deduction_pct, ward_count, first_seen, last_seen, is_govt_entity, blacklist_flags")

        if (filter === "flagged") {
          query = query.neq("blacklist_flags", "{}").order("total_value_lakh", { ascending: false })
        } else if (filter === "high_deduction") {
          query = query.gt("avg_deduction_pct", 15).gte("total_contracts", 3).order("avg_deduction_pct", { ascending: false })
        } else if (filter === "multi_ward") {
          query = query.gt("ward_count", 10).order("ward_count", { ascending: false })
        } else if (filter === "by_contracts") {
          query = query.order("total_contracts", { ascending: false })
        } else {
          query = query.order("total_value_lakh", { ascending: false })
        }

        const { data } = await query.limit(limit)
        return data ?? []
      },
    }),

    ward_contractors: tool({
      description: "Get contractors active in a historical DataMeet-243 ward. Use for 'who are the contractors in my ward', 'which companies work in ward X'. For a current GBA ward, call it once per former ward listed as having attributable ward-level records.",
      inputSchema: zodSchema(z.object({
        ward_no: z.number().describe("Historical DataMeet-243 ward number (from find_ward or the attributable former wards in context)"),
      })),
      execute: async ({ ward_no }): Promise<unknown> => {
        // contractor_profiles.wards holds BBMP-Final-225 numbers. Bridge through
        // the same >= 10% material-overlap pairs as prod ward_crosswalk /
        // v_work_orders_243, never a raw 243 number or "any shared area".
        const sourceWardNos = sourceWardNosForLegacyWard(LEGACY_SOURCE_WARDS, ward_no)
        if (!sourceWardNos.length) return { datameet243_ward_no: ward_no, bbmp225_source_wards: [], contractors: [] }
        const { data } = await supabase
          .from("contractor_profiles")
          .select("canonical_name, aliases, total_contracts, total_value_lakh, avg_deduction_pct, ward_count, blacklist_flags, is_govt_entity")
          .eq("city_id", "bengaluru")
          .overlaps("wards", sourceWardNos)
          .order("total_value_lakh", { ascending: false })
          .limit(10)
        return { datameet243_ward_no: ward_no, bbmp225_source_wards: sourceWardNos, contractors: data ?? [] }
      },
    }),
  }
}

export async function POST(req: Request) {
  const limited = await enforceRateLimit(makeAiLimiter, req, "Ask Kaun")
  if (limited) return limited

  try {
    const { url, anonKey } = publicSupabaseConfig()
    const supabase = createClient(
      url,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? anonKey
    )

    const body = await req.json()
    const question = body.question as string | undefined
    const ward_context = body.ward_context as AskKaunRequest["ward_context"] | undefined
    if (!question?.trim()) return Response.json({ error: "No question provided" }, { status: 400 })
    if (!ward_context?.ward_name) return Response.json({ error: "Ward context required" }, { status: 400 })

    const context = buildContext(ward_context)

    const { text } = await generateText({
      model: openai(process.env.OPENAI_ASK_KAUN_MODEL ?? "gpt-4.1-mini"),
      tools: makeTools(supabase),
      stopWhen: stepCountIs(4),
      system: `You are Kaun, a civic accountability assistant for Bengaluru, India.
You have current GBA ward identity plus explicitly-labelled estimates derived from historical 243-ward records. Never describe an historical estimate as a current-ward measurement.

Bengaluru civic structure:
- Roads/potholes: BBMP (ward Corporator is the elected contact) — call 1533 or bbmp.gov.in
- Traffic signals: BBMP Engineering installs; Bangalore Traffic Police (BTP) operates — call 103
- Buses: BMTC — 080-22251777 | Water: BWSSB — 1916 | Electricity: BESCOM — 1912
- MLAs handle state LAD funds and raise issues in Karnataka Legislature
- Corporator handles ward-level BBMP work and ward committee meetings

When to use tools:
- "which ward / best / worst / most / least / compare / how does X compare" → use rank_wards or compare_wards
- User mentions another ward by name → use find_ward first
- "contractor / who builds / who gets contracts / blacklisted / flagged" → use search_contractor, top_contractors, or ward_contractors
- Otherwise → answer from the ward context provided

Rules:
- Always name the specific Corporator or MLA from context when answering "who is responsible"
- Use real numbers; if data is missing say so — never make up stats
- NEVER use numbered lists or bullet points — answer in 1-3 short plain sentences
- Be direct and specific, like a knowledgeable friend — not a FAQ page
- When data shows poor performance (0% LAD, 0 questions asked, low attendance) say it plainly — don't soften it or tell people to "contact their MLA"
- If LAD is 0%: recommend filing an RTI to get the utilization plan
- Use specific numbers from context when answering actionable questions (e.g. "47 pothole complaints already filed" or "only 3 signals in this ward")
- For comparisons, ALWAYS call compare_wards tool — never guess from memory
- Keep answers under 60 words
- For "what can I do": give the single most effective action first, then one backup`,
      prompt: `Current ward data:\n${context}\n\nQuestion: ${question}`,
    })

    await supabase.from("ask_kaun_logs").insert({
      ward_no: ward_context.ward_no,
      ward_name: ward_context.ward_name,
      question: question.trim(),
      answer: text,
    })

    return Response.json({ answer: text })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("ask-kaun error:", msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
