import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"
import { makeReportLimiter, getIP, rateLimitResponse } from "@/lib/ratelimit"

export const runtime = "nodejs"
export const maxDuration = 45

const ISSUE_TYPES = ["hoarding", "pothole", "flooding", "construction", "encroachment", "garbage", "signal", "other"] as const
type IssueType = typeof ISSUE_TYPES[number]

interface SubmitReportBody {
  lat: number
  lng: number
  ward_no?: number
  ward_name?: string
  issue_type: IssueType
  description?: string
  photo_base64?: string   // data:image/jpeg;base64,...
  photo_mime?: string
}

export async function POST(req: Request) {
  const { success, reset } = await makeReportLimiter().limit(getIP(req))
  if (!success) return rateLimitResponse(reset)

  try {
    const body: SubmitReportBody = await req.json()
    const { lat, lng, ward_no, ward_name, issue_type, description, photo_base64, photo_mime } = body

    if (!lat || !lng || !issue_type || !ISSUE_TYPES.includes(issue_type)) {
      return Response.json({ error: "Missing required fields" }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

    let photo_url: string | null = null
    let ai_label: string | null = null
    let ai_person: string | null = null
    let ai_party: string | null = null
    let ai_confidence = 0
    let status = "pending"

    // --- Step 1: Upload photo to Supabase Storage ---
    if (photo_base64) {
      const base64Data = photo_base64.replace(/^data:image\/\w+;base64,/, "")
      const buffer = Buffer.from(base64Data, "base64")
      const ext = (photo_mime ?? "image/jpeg").split("/")[1] ?? "jpg"
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("report-photos")
        .upload(`pending/${filename}`, buffer, {
          contentType: photo_mime ?? "image/jpeg",
          upsert: false,
        })

      if (uploadError) {
        console.error("Upload error:", uploadError)
      } else {
        const { data: urlData } = supabase.storage.from("report-photos").getPublicUrl(uploadData.path)
        photo_url = urlData.publicUrl
      }
    }

    // --- Step 2: OpenAI Moderation API (fast free check) ---
    if (description) {
      const modResult = await openai.moderations.create({ input: description })
      if (modResult.results[0]?.flagged) {
        return Response.json({ error: "Content flagged by moderation" }, { status: 400 })
      }
    }

    // --- Step 3: GPT-4o Vision analysis (if photo present) ---
    if (photo_url) {
      const prompt = `You are a civic issue moderator for Bengaluru, India.

Analyse this photo and respond with a JSON object (no markdown, raw JSON only):
{
  "is_civic_issue": true/false,
  "issue_type": "hoarding|pothole|flooding|construction|encroachment|garbage|signal|other",
  "confidence": 0-100,
  "description": "one sentence describing the civic violation visible",
  "politician_name": "name if visible on a banner/hoarding, else null",
  "politician_party": "party name/symbol if visible, else null",
  "has_private_faces": true/false,
  "rejection_reason": "reason if not a civic issue, else null"
}`

      const visionResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 300,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: photo_url, detail: "low" } }
          ]
        }]
      })

      const raw = visionResponse.choices[0]?.message?.content ?? "{}"
      try {
        const analysis = JSON.parse(raw)

        if (!analysis.is_civic_issue || analysis.confidence < 40) {
          // Move to rejected folder in storage
          if (photo_url) {
            const path = photo_url.split("report-photos/")[1]
            if (path) await supabase.storage.from("report-photos").move(path, path.replace("pending/", "rejected/"))
          }
          return Response.json({
            error: analysis.rejection_reason ?? "Photo does not appear to show a civic issue",
            confidence: analysis.confidence
          }, { status: 422 })
        }

        ai_label       = analysis.description ?? null
        ai_person      = analysis.politician_name ?? null
        ai_party       = analysis.politician_party ?? null
        ai_confidence  = analysis.confidence ?? 0
        status         = analysis.confidence >= 70 ? "approved" : "pending"

        // Move to approved folder if confident
        if (status === "approved" && photo_url) {
          const path = photo_url.split("report-photos/")[1]
          if (path) {
            await supabase.storage.from("report-photos").move(path, path.replace("pending/", "approved/"))
            photo_url = photo_url.replace("pending/", "approved/")
          }
        }

      } catch {
        // JSON parse failed — keep as pending for manual review
        status = "pending"
      }
    } else if (issue_type === "hoarding" && description) {
      // Hoarding text report — quick GPT extraction of politician name from description
      try {
        const textExtract = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          max_tokens: 150,
          messages: [
            {
              role: "system",
              content: "You extract structured data from civic complaints. Always respond with valid JSON, no markdown, no code blocks."
            },
            {
              role: "user",
              content: `Extract from this complaint: {"politician_name": string|null, "politician_party": string|null, "summary": "one sentence description of the civic violation"}\n\nComplaint: ${description}`
            }
          ]
        })
        const raw = (textExtract.choices[0]?.message?.content ?? "{}").replace(/```json|```/g, "").trim()
        const parsed = JSON.parse(raw)
        ai_person = parsed.politician_name ?? null
        ai_party  = parsed.politician_party ?? null
        ai_label  = parsed.summary ?? description
        ai_confidence = ai_person ? 75 : 50
      } catch (e) {
        console.error("hoarding text extraction failed:", e)
        ai_label = description
      }
      status = "approved"
    } else {
      // Text-only report — auto-approve
      status = "approved"
    }

    // --- Step 4: Save to DB ---
    const { data: report, error: dbError } = await supabase
      .from("ward_reports")
      .insert({
        ward_no:      ward_no ?? null,
        ward_name:    ward_name ?? null,
        lat,
        lng,
        issue_type,
        description:  description ?? ai_label ?? null,
        photo_url,
        ai_label,
        ai_person,
        ai_party,
        ai_confidence,
        status,
        source:       "web",
        moderated_at: status !== "pending" ? new Date().toISOString() : null,
      })
      .select("id, status, ai_label, ai_person, ai_party")
      .single()

    if (dbError) {
      console.error("DB error:", dbError)
      return Response.json({ error: "Failed to save report" }, { status: 500 })
    }

    return Response.json({
      success: true,
      id: report.id,
      status: report.status,
      ai_label: report.ai_label,
      ai_person: report.ai_person,
      ai_party: report.ai_party,
    })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("submit-report error:", msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
