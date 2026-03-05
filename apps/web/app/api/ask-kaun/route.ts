import { openai } from "@ai-sdk/openai"
import { generateText, tool, zodSchema, stepCountIs } from "ai"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const maxDuration = 60

export interface AskKaunRequest {
  question: string
  ward_context: {
    ward_no: number
    ward_name: string
    assembly_constituency: string
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
  }
}

function buildContext(c: AskKaunRequest["ward_context"]): string {
  const lines = [`Ward: ${c.ward_name} (Ward #${c.ward_no}), Assembly Constituency: ${c.assembly_constituency}`]
  if (c.corporator_name)             lines.push(`Corporator: ${c.corporator_name}${c.corporator_party ? ` (${c.corporator_party})` : ""}`)
  if (c.mla_name)                    lines.push(`MLA: ${c.mla_name}${c.mla_party ? ` (${c.mla_party})` : ""}`)
  if (c.mla_attendance_pct != null)  lines.push(`MLA attendance: ${c.mla_attendance_pct}%`)
  if (c.mla_questions_asked != null) lines.push(`MLA questions asked: ${c.mla_questions_asked}`)
  if (c.mla_lad_utilization_pct != null) lines.push(`MLA LAD fund utilization: ${c.mla_lad_utilization_pct}%`)
  if (c.mla_criminal_cases != null)  lines.push(`MLA criminal cases (EC affidavit): ${c.mla_criminal_cases}`)
  if (c.committee_meetings != null)  lines.push(`Ward committee meetings (2020-22): ${c.committee_meetings}/56`)
  if (c.signal_count != null)        lines.push(`Traffic signals: ${c.signal_count} (city avg: 5.5)`)
  if (c.bus_stop_count != null)      lines.push(`BMTC bus stops: ${c.bus_stop_count} (city avg: 155)`)
  if (c.pothole_complaints != null)  lines.push(`Pothole complaints: ${c.pothole_complaints}`)
  if (c.ward_spend_total_lakh != null) lines.push(`BBMP ward spend: Rs ${c.ward_spend_total_lakh} lakh (2018-2023)`)
  if (c.ward_spend_roads_pct != null) lines.push(`Roads share of spend: ${c.ward_spend_roads_pct.toFixed(1)}%`)
  if (c.grievance_count != null)     lines.push(`BBMP grievances: ${c.grievance_count}`)
  return lines.join("\n")
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeTools(supabase: any) {
  return {
    rank_wards: tool({
      description: "Get top or bottom N wards across Bengaluru for a specific metric. Use for questions like 'which ward has the most signals', 'worst MLA attendance', 'where are the most potholes'.",
      inputSchema: zodSchema(z.object({
        metric: z.enum(["signals", "bus_stops", "committee_meetings", "mla_attendance", "lad_utilization", "criminal_cases"]),
        order: z.enum(["top", "bottom"]).describe("top = highest/best, bottom = lowest/worst"),
        limit: z.number().min(1).max(10).default(5),
      })),
      execute: async ({ metric, order, limit }): Promise<unknown> => {
        const asc = order === "bottom"
        if (metric === "signals" || metric === "bus_stops") {
          const col = metric === "signals" ? "signal_count" : "bus_stop_count"
          const { data } = await supabase
            .from("ward_infra_stats")
            .select("ward_no, ward_name, signal_count, bus_stop_count")
            .not(col, "is", null)
            .order(col, { ascending: asc })
            .limit(limit)
          return data ?? []
        }
        if (metric === "committee_meetings") {
          const { data } = await supabase
            .from("ward_committee_meetings")
            .select("ward_no, ward_name, meetings_count")
            .order("meetings_count", { ascending: asc })
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

          const [infra, report, meetings] = await Promise.all([
            supabase.from("ward_infra_stats").select("signal_count, bus_stop_count").eq("ward_no", ward.ward_no).single(),
            supabase.from("rep_report_cards").select("attendance_pct, lad_utilization_pct, criminal_cases").eq("constituency", ward.assembly_constituency).eq("role", "MLA").single(),
            supabase.from("ward_committee_meetings").select("meetings_count").eq("ward_no", ward.ward_no).single(),
          ])
          const i = infra.data as { signal_count: number; bus_stop_count: number } | null
          const r = report.data as { attendance_pct: number; lad_utilization_pct: number; criminal_cases: number } | null
          const m = meetings.data as { meetings_count: number } | null

          results.push({
            ward_name: ward.ward_name,
            ward_no: ward.ward_no,
            assembly_constituency: ward.assembly_constituency,
            signal_count: i?.signal_count ?? null,
            bus_stop_count: i?.bus_stop_count ?? null,
            mla_attendance_pct: r?.attendance_pct ?? null,
            lad_utilization_pct: r?.lad_utilization_pct ?? null,
            criminal_cases: r?.criminal_cases ?? null,
            committee_meetings: m?.meetings_count ?? null,
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
  }
}

export async function POST(req: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { question, ward_context }: AskKaunRequest = await req.json()
    if (!question?.trim()) return Response.json({ error: "No question provided" }, { status: 400 })

    const context = buildContext(ward_context)

    const { text } = await generateText({
      model: openai("gpt-4o"),
      tools: makeTools(supabase),
      stopWhen: stepCountIs(4),
      system: `You are Kaun, a civic accountability assistant for Bengaluru, India.
You have real data about the user's specific ward AND tools to query all 243 Bengaluru wards.

Bengaluru civic structure:
- Roads/potholes: BBMP (ward Corporator is the elected contact) — call 1533 or bbmp.gov.in
- Traffic signals: BBMP Engineering installs; Bangalore Traffic Police (BTP) operates — call 103
- Buses: BMTC — 080-22251777 | Water: BWSSB — 1916 | Electricity: BESCOM — 1912
- MLAs handle state LAD funds and raise issues in Karnataka Legislature
- Corporator handles ward-level BBMP work and ward committee meetings

When to use tools:
- "which ward / best / worst / most / least / compare / how does X compare" → use rank_wards or compare_wards
- User mentions another ward by name → use find_ward first
- Otherwise → answer from the ward context provided

Rules:
- Always name the specific Corporator or MLA from context when answering "who is responsible"
- Use real numbers; if data is missing say so — never make up stats
- NEVER use numbered lists or bullet points — answer in 1-3 short plain sentences
- Be direct and specific, like a knowledgeable friend — not a FAQ page
- When data shows poor performance (0% LAD, 0 questions asked, low attendance) say it plainly — don't soften it
- For comparisons, ALWAYS call compare_wards tool — never guess from memory
- Keep answers under 60 words
- For "what can I do": give the single most effective action first, then one backup`,
      prompt: `Current ward data:\n${context}\n\nQuestion: ${question}`,
    })

    void supabase.from("ask_kaun_logs").insert({
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
