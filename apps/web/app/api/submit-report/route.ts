import { createClient } from "@supabase/supabase-js"
import { makeReportLimiter, getIP, rateLimitResponse } from "@/lib/ratelimit"

export const runtime = "nodejs"
export const maxDuration = 20

const ISSUE_TYPES = ["hoarding", "pothole", "flooding", "construction", "encroachment", "garbage", "signal", "other"] as const
type IssueType = typeof ISSUE_TYPES[number]

interface SubmitReportBody {
  lat: number
  lng: number
  ward_no?: number
  ward_name?: string
  issue_type: IssueType
  description?: string
  location_text?: string
  photo_base64?: string   // data:image/jpeg;base64,...
  photo_mime?: string
}

export async function POST(req: Request) {
  const { success, reset } = await makeReportLimiter().limit(getIP(req))
  if (!success) return rateLimitResponse(reset)

  try {
    const body: SubmitReportBody = await req.json()
    const { lat, lng, ward_no, ward_name, issue_type, description, location_text, photo_base64, photo_mime } = body

    if (!lat || !lng || !issue_type || !ISSUE_TYPES.includes(issue_type)) {
      return Response.json({ error: "Missing required fields" }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    let photo_url: string | null = null

    // Upload photo to Supabase Storage
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

    // Insert immediately as pending — AI moderation runs in daily cron
    const { data: report, error: dbError } = await supabase
      .from("ward_reports")
      .insert({
        ward_no:       ward_no ?? null,
        ward_name:     ward_name ?? null,
        lat,
        lng,
        issue_type,
        description:   description ?? null,
        location_text: location_text ?? null,
        photo_url,
        status:        "pending",
        source:        "web",
      })
      .select("id")
      .single()

    if (dbError) {
      console.error("DB error:", dbError)
      return Response.json({ error: "Failed to save report" }, { status: 500 })
    }

    return Response.json({ ok: true, id: report.id })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("submit-report error:", msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
