import { openai } from "@ai-sdk/openai"
import { generateText } from "ai"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const maxDuration = 30

export interface AskKaunRequest {
  question: string
  ward_context: {
    ward_no: number
    ward_name: string
    assembly_constituency: string
    // WHO
    mla_name?: string | null
    mla_party?: string | null
    mla_attendance_pct?: number | null
    mla_questions_asked?: number | null
    mla_lad_utilization_pct?: number | null
    mla_criminal_cases?: number | null
    committee_meetings?: number | null
    // Corporator (ward-level elected rep)
    corporator_name?: string | null
    corporator_party?: string | null
    // CITIZEN
    signal_count?: number | null
    bus_stop_count?: number | null
    pothole_complaints?: number | null
    // SPEND
    ward_spend_total_lakh?: number | null
    ward_spend_roads_pct?: number | null
    // REACH
    grievance_count?: number | null
    // Key BBMP contacts (from local offices)
    bbmp_ward_office?: string | null
    bbmp_complaint_no?: string | null
  }
}

function buildContext(c: AskKaunRequest["ward_context"]): string {
  const lines = [
    `Ward: ${c.ward_name} (Ward #${c.ward_no}), Assembly Constituency: ${c.assembly_constituency}`,
  ]
  if (c.corporator_name)       lines.push(`Corporator (ward councillor): ${c.corporator_name}${c.corporator_party ? ` (${c.corporator_party})` : ""}`)
  if (c.mla_name)              lines.push(`MLA: ${c.mla_name}${c.mla_party ? ` (${c.mla_party})` : ""}`)
  if (c.mla_attendance_pct != null)    lines.push(`MLA assembly attendance: ${c.mla_attendance_pct}%`)
  if (c.mla_questions_asked != null)   lines.push(`MLA questions asked in assembly: ${c.mla_questions_asked}`)
  if (c.mla_lad_utilization_pct != null) lines.push(`MLA LAD fund utilization: ${c.mla_lad_utilization_pct}%`)
  if (c.mla_criminal_cases != null && c.mla_criminal_cases > 0) lines.push(`MLA criminal cases: ${c.mla_criminal_cases}`)
  if (c.committee_meetings != null)    lines.push(`Ward committee meetings held (2020-22): ${c.committee_meetings} of 56 possible`)
  if (c.signal_count != null)          lines.push(`Traffic signals in ward: ${c.signal_count} (city avg: 5.5)`)
  if (c.bus_stop_count != null)        lines.push(`BMTC bus stops in ward: ${c.bus_stop_count} (city avg: 155)`)
  if (c.pothole_complaints != null)    lines.push(`Pothole complaints logged: ${c.pothole_complaints}`)
  if (c.ward_spend_total_lakh != null) lines.push(`BBMP ward spend: Rs ${c.ward_spend_total_lakh} lakh (2018-2023)`)
  if (c.ward_spend_roads_pct != null)  lines.push(`Roads & infrastructure share of spend: ${c.ward_spend_roads_pct.toFixed(1)}%`)
  if (c.grievance_count != null)       lines.push(`BBMP grievances filed: ${c.grievance_count}`)
  if (c.bbmp_ward_office)              lines.push(`BBMP ward office: ${c.bbmp_ward_office}`)
  if (c.bbmp_complaint_no)             lines.push(`BBMP complaint helpline: ${c.bbmp_complaint_no}`)
  return lines.join("\n")
}

export async function POST(req: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { question, ward_context }: AskKaunRequest = await req.json()

    if (!question?.trim()) {
      return Response.json({ error: "No question provided" }, { status: 400 })
    }

    const context = buildContext(ward_context)

    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      system: `You are Kaun, a civic accountability assistant for Bengaluru (Bangalore), India.
You have real data about a specific ward. Use it to give specific, grounded answers.

Bengaluru civic structure you should know:
- Roads in wards: BBMP (Bruhat Bengaluru Mahanagara Palike) — the ward's Corporator is the elected ward-level contact; call 1533 or bbmp.gov.in
- Traffic signals: BBMP Engineering installs/maintains them; Bangalore Traffic Police (BTP) operates signal timing — call 103 for traffic issues
- Potholes: File on BBMP Sampark app or call 1533; responsible is the ward's Assistant Executive Engineer (Roads)
- Public transport (buses): BMTC — call 080-22251777
- Water/drainage: BWSSB — call 1916
- Electricity: BESCOM — call 1912
- MLAs handle state-level funds (LAD scheme) and raise issues in the Karnataka Legislature
- Corporator handles ward-level BBMP work and attends ward committee meetings

Rules:
- Always name the specific Corporator or MLA from the ward data when answering "who is responsible"
- Use actual numbers from the data (pothole count, signal count, spend) when relevant
- For "what can I do": suggest RTI filing, BBMP Sampark app, ward meetings, calling 1533
- If a specific piece of data is missing, still give the structural answer (who is generally responsible) rather than saying "I don't have that data"
- Keep answers under 80 words
- Never make up data (names, phone numbers, addresses) that isn't in the ward context`,
      prompt: `Ward data:\n${context}\n\nQuestion: ${question}`,
      maxOutputTokens: 200,
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
