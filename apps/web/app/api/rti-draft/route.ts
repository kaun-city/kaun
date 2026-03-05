import { openai } from "@ai-sdk/openai"
import { generateText } from "ai"

export const runtime = "nodejs"
export const maxDuration = 30

export type RTIIssueType =
  | "lad_funds"
  | "committee_meetings"
  | "pothole_complaints"
  | "ward_spend"
  | "work_orders"

export interface RTIDraftRequest {
  issue_type: RTIIssueType
  ward_name: string
  ward_no: number
  assembly_constituency: string
  // Issue-specific context
  mla_name?: string
  mla_party?: string
  lad_utilization_pct?: number | null
  lad_total_lakh?: number | null
  committee_meetings?: number | null
  pothole_complaints?: number | null
  ward_spend_total_lakh?: number | null
  ward_spend_roads_pct?: number | null
}

const ISSUE_CONFIG: Record<RTIIssueType, { subject: string; authority: string; address: string }> = {
  lad_funds: {
    subject: "Information regarding utilization of Local Area Development (LAD) funds by MLA",
    authority: "The Public Information Officer, Department of Parliamentary Affairs & Legislation, Government of Karnataka",
    address: "Vidhana Soudha, Dr. B.R. Ambedkar Veedhi, Bengaluru - 560001",
  },
  committee_meetings: {
    subject: "Information regarding Ward Committee meetings under BBMP Act",
    authority: "The Public Information Officer, Joint Commissioner (Wards), Bruhat Bengaluru Mahanagara Palike",
    address: "N.R. Square, Hudson Circle, Bengaluru - 560002",
  },
  pothole_complaints: {
    subject: "Information regarding pothole complaints and road repair status",
    authority: "The Public Information Officer, Executive Engineer (Roads), Bruhat Bengaluru Mahanagara Palike",
    address: "N.R. Square, Hudson Circle, Bengaluru - 560002",
  },
  ward_spend: {
    subject: "Information regarding BBMP ward-level expenditure and project completion",
    authority: "The Public Information Officer, Chief Accounts Officer, Bruhat Bengaluru Mahanagara Palike",
    address: "N.R. Square, Hudson Circle, Bengaluru - 560002",
  },
  work_orders: {
    subject: "Information regarding BBMP work orders issued and completion status",
    authority: "The Public Information Officer, Executive Engineer (Projects), Bruhat Bengaluru Mahanagara Palike",
    address: "N.R. Square, Hudson Circle, Bengaluru - 560002",
  },
}

function buildContext(d: RTIDraftRequest): string {
  const lines = [
    `Ward: ${d.ward_name} (Ward #${d.ward_no})`,
    `Assembly Constituency: ${d.assembly_constituency}`,
  ]
  if (d.mla_name) lines.push(`MLA: ${d.mla_name} (${d.mla_party ?? "Unknown party"})`)

  switch (d.issue_type) {
    case "lad_funds":
      if (d.lad_utilization_pct != null) lines.push(`LAD fund utilization: ${d.lad_utilization_pct}% (extremely low)`)
      if (d.lad_total_lakh != null) lines.push(`Total LAD allocation: Rs ${d.lad_total_lakh} lakh`)
      break
    case "committee_meetings":
      if (d.committee_meetings != null)
        lines.push(`Ward committee meetings held 2020-2022: ${d.committee_meetings} out of a possible 56`)
      break
    case "pothole_complaints":
      if (d.pothole_complaints != null)
        lines.push(`Pothole complaints logged: ${d.pothole_complaints}`)
      break
    case "ward_spend":
      if (d.ward_spend_total_lakh != null)
        lines.push(`Total BBMP spend 2018-2023: Rs ${d.ward_spend_total_lakh} lakh`)
      if (d.ward_spend_roads_pct != null)
        lines.push(`Roads & infrastructure share: ${d.ward_spend_roads_pct.toFixed(1)}%`)
      break
  }
  return lines.join("\n")
}

export async function POST(req: Request) {
  try {
  const data: RTIDraftRequest = await req.json()
  const config = ISSUE_CONFIG[data.issue_type]
  const context = buildContext(data)

  const { text } = await generateText({
    model: openai("gpt-4o-mini"),
    system: `You are an RTI (Right to Information Act 2005) expert for Karnataka, India.
Generate a formal RTI application that:
- Follows the standard Karnataka RTI format exactly
- Asks 3-5 specific, pointed questions that are answerable (not vague)
- References the exact data anomaly that prompted this request
- Uses correct legal terminology
- Includes [APPLICANT NAME], [APPLICANT ADDRESS], [APPLICANT PHONE] as placeholders
- Mentions the Rs 10 application fee
- Sets a clear 30-day response expectation per Section 7(1) of RTI Act
- Is firm but not aggressive in tone
Return ONLY the RTI letter text. No commentary, no markdown, no headers outside the letter.`,
    prompt: `Generate an RTI application for the following issue:

Issue type: ${data.issue_type.replace(/_/g, " ")}
Authority: ${config.authority}
Authority address: ${config.address}
Subject: ${config.subject}

Context data:
${context}

The applicant is a resident of ${data.ward_name} ward, ${data.assembly_constituency} constituency, Bengaluru.`,
    maxOutputTokens: 600,
  })

  return Response.json({
    draft: text,
    authority: config.authority,
    address: config.address,
    subject: config.subject,
  })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("rti-draft error:", msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}


