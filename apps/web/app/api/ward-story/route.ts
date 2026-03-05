import { google } from "@ai-sdk/google"
import { generateText } from "ai"
import { createClient } from "@supabase/supabase-js"
import { createHash } from "crypto"

export const runtime = "nodejs"
export const maxDuration = 30

export interface WardStoryRequest {
  ward_no: number
  ward_name: string
  assembly_constituency: string
  // WHO
  mla_name?: string
  mla_party?: string
  mla_attendance_pct?: number | null
  mla_questions_asked?: number | null
  mla_lad_utilization_pct?: number | null
  mla_criminal_cases?: number | null
  mla_net_worth_growth_pct?: number | null
  committee_meetings?: number | null
  // CITIZEN
  signal_count?: number | null
  bus_stop_count?: number | null
  city_avg_signals?: number
  city_avg_stops?: number
  pothole_complaints?: number | null
  // SPEND
  ward_spend_total_lakh?: number | null
  ward_spend_roads_pct?: number | null
}

function buildPrompt(d: WardStoryRequest): string {
  const lines: string[] = [
    `Ward: ${d.ward_name} (Ward #${d.ward_no}), Assembly Constituency: ${d.assembly_constituency}`,
  ]

  if (d.mla_name) {
    lines.push(`MLA: ${d.mla_name} (${d.mla_party ?? "Unknown party"})`)
    if (d.mla_attendance_pct != null) lines.push(`  - Parliamentary attendance: ${d.mla_attendance_pct}%`)
    if (d.mla_questions_asked != null) lines.push(`  - Questions asked in assembly: ${d.mla_questions_asked}`)
    if (d.mla_lad_utilization_pct != null) lines.push(`  - LAD fund utilization: ${d.mla_lad_utilization_pct}%`)
    if (d.mla_criminal_cases != null && d.mla_criminal_cases > 0) lines.push(`  - Criminal cases: ${d.mla_criminal_cases}`)
    if (d.mla_net_worth_growth_pct != null) lines.push(`  - Net worth growth since election: ${d.mla_net_worth_growth_pct}%`)
  }

  if (d.committee_meetings != null) {
    lines.push(`Ward committee meetings held (2020-2022): ${d.committee_meetings} (max possible: 56)`)
  }

  if (d.signal_count != null) {
    lines.push(`Traffic signals in ward: ${d.signal_count} (city average: ${d.city_avg_signals ?? 5.5})`)
  }
  if (d.bus_stop_count != null) {
    lines.push(`Bus stops in ward: ${d.bus_stop_count} (city average: ${d.city_avg_stops ?? 155})`)
  }
  if (d.pothole_complaints != null) {
    lines.push(`Pothole complaints logged: ${d.pothole_complaints}`)
  }
  if (d.ward_spend_total_lakh != null) {
    lines.push(`BBMP ward spend: Rs ${d.ward_spend_total_lakh.toLocaleString("en-IN")} lakh (2018-2023)`)
    if (d.ward_spend_roads_pct != null) lines.push(`  - Roads & infrastructure share: ${d.ward_spend_roads_pct.toFixed(1)}%`)
  }

  return lines.join("\n")
}

export async function POST(req: Request) {
  try {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const data: WardStoryRequest = await req.json()

  // Check cache (valid for 7 days)
  const hash = createHash("md5").update(JSON.stringify(data)).digest("hex").slice(0, 8)
  const { data: cached } = await supabase
    .from("ward_stories")
    .select("story, generated_at, data_hash")
    .eq("ward_no", data.ward_no)
    .single()

  const cacheAge = cached?.generated_at
    ? (Date.now() - new Date(cached.generated_at).getTime()) / (1000 * 60 * 60 * 24)
    : Infinity

  if (cached && cacheAge < 7 && cached.data_hash === hash) {
    return Response.json({ story: cached.story, cached: true })
  }

  // Generate fresh story
  const context = buildPrompt(data)
  const { text } = await generateText({
    model: google("gemini-2.0-flash"),
    system: `You are a civic accountability analyst for Bangalore, India. 
Given ward data, write a short, punchy 2-3 sentence narrative (under 80 words) that:
- Connects the dots between infrastructure gaps, elected representative performance, and resident impact
- Names specific facts (numbers, percentages) to make it concrete
- Is direct and factual, not preachy or alarmist
- Ends with one sentence about what this means for residents
Write in plain English. No headers, no bullet points. Just the narrative paragraph.`,
    prompt: context,
    maxOutputTokens: 200,
  })

  // Cache result
  await supabase.from("ward_stories").upsert({
    ward_no: data.ward_no,
    ward_name: data.ward_name,
    story: text,
    generated_at: new Date().toISOString(),
    data_hash: hash,
  })

  return Response.json({ story: text, cached: false })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("ward-story error:", msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
