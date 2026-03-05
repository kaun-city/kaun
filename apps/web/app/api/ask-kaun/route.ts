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
    // CITIZEN
    signal_count?: number | null
    bus_stop_count?: number | null
    pothole_complaints?: number | null
    // SPEND
    ward_spend_total_lakh?: number | null
    ward_spend_roads_pct?: number | null
    // REACH
    grievance_count?: number | null
  }
}

function buildContext(c: AskKaunRequest["ward_context"]): string {
  const lines = [
    `Ward: ${c.ward_name} (Ward #${c.ward_no}), Assembly Constituency: ${c.assembly_constituency}`,
  ]
  if (c.mla_name)              lines.push(`MLA: ${c.mla_name} (${c.mla_party ?? "Unknown"})`)
  if (c.mla_attendance_pct != null) lines.push(`MLA assembly attendance: ${c.mla_attendance_pct}%`)
  if (c.mla_questions_asked != null) lines.push(`MLA questions asked in assembly: ${c.mla_questions_asked}`)
  if (c.mla_lad_utilization_pct != null) lines.push(`MLA LAD fund utilization: ${c.mla_lad_utilization_pct}%`)
  if (c.mla_criminal_cases != null && c.mla_criminal_cases > 0) lines.push(`MLA criminal cases: ${c.mla_criminal_cases}`)
  if (c.committee_meetings != null) lines.push(`Ward committee meetings held (2020-22): ${c.committee_meetings} of 56 possible`)
  if (c.signal_count != null) lines.push(`Traffic signals: ${c.signal_count} (city avg: 5.5)`)
  if (c.bus_stop_count != null) lines.push(`Bus stops: ${c.bus_stop_count} (city avg: 155)`)
  if (c.pothole_complaints != null) lines.push(`Pothole complaints logged: ${c.pothole_complaints}`)
  if (c.ward_spend_total_lakh != null) lines.push(`BBMP ward spend: Rs ${c.ward_spend_total_lakh} lakh (2018-2023)`)
  if (c.ward_spend_roads_pct != null) lines.push(`Roads & infrastructure share of spend: ${c.ward_spend_roads_pct.toFixed(1)}%`)
  if (c.grievance_count != null) lines.push(`BBMP grievances filed: ${c.grievance_count}`)
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
      system: `You are Kaun, a civic accountability assistant for Bangalore, India.
You have data about a specific ward. Answer the user's question using ONLY the data provided.
Rules:
- Be direct and specific — use the numbers you have
- If data isn't available, say so clearly ("I don't have that data for this ward")
- For "what can I do" questions: suggest concrete actions (file RTI, contact BBMP, attend ward meeting)
- Keep answers under 80 words
- Never make up data or infer what isn't there
- Mention the RTI option when relevant (unspent funds, unresolved complaints, non-meetings)`,
      prompt: `Ward data:\n${context}\n\nQuestion: ${question}`,
      maxOutputTokens: 200,
    })

    // Log async (don't await — don't block the response)
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
