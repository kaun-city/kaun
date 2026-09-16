import { createClient } from "@supabase/supabase-js"
import { makeReportLimiter, getIP, rateLimitResponse } from "@/lib/ratelimit"
import { publicSupabaseConfig } from "@/lib/supabase-config"

export const runtime = "nodejs"
export const maxDuration = 20

const ISSUE_TYPES = ["hoarding", "pothole", "flooding", "construction", "encroachment", "garbage", "signal", "other"] as const
type IssueType = typeof ISSUE_TYPES[number]

interface SubmitReportBody {
  lat: number
  lng: number
  ward_no?: number
  ward_name?: string
  boundary_system?: string
  gba_corporation_id?: number
  gba_ward_no?: number
  historical_wards?: Array<{ ward_no: number; current_share: number; legacy_share: number }>
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
    const { lat, lng, ward_no, ward_name, boundary_system, gba_corporation_id, gba_ward_no, historical_wards, issue_type, description, location_text, photo_base64, photo_mime } = body

    if (!lat || !lng || !issue_type || !ISSUE_TYPES.includes(issue_type)) {
      return Response.json({ error: "Missing required fields" }, { status: 400 })
    }

    const { url: supabaseUrl, anonKey } = publicSupabaseConfig()
    const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY ?? anonKey)

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
    const insertRow = {
      ward_no:       ward_no ?? null,
      ward_name:     ward_name ?? null,
      boundary_system: boundary_system ?? null,
      gba_corporation_id: gba_corporation_id ?? null,
      gba_ward_no: gba_ward_no ?? null,
      historical_wards: historical_wards ?? [],
      lat,
      lng,
      issue_type,
      description:   description ?? null,
      location_text: location_text ?? null,
      photo_url,
      status:        "pending",
      source:        "web",
    }
    let { data: report, error: dbError } = await supabase
      .from("ward_reports")
      .insert(insertRow)
      .select("id")
      .single()

    // Deployments can receive the application before the additive migration.
    // Preserve reporting while making the loss of current identity temporary.
    if (dbError && /boundary_system|gba_corporation_id|historical_wards/i.test(dbError.message)) {
      const fallback = await supabase.from("ward_reports").insert({
        ward_no: ward_no ?? null, ward_name: ward_name ?? null, lat, lng,
        issue_type, description: description ?? null, location_text: location_text ?? null,
        photo_url, status: "pending", source: "web",
      }).select("id").single()
      report = fallback.data
      dbError = fallback.error
    }

    if (dbError) {
      console.error("DB error:", dbError)
      return Response.json({ error: "Failed to save report" }, { status: 500 })
    }

    return Response.json({ ok: true, id: report?.id ?? null })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("submit-report error:", msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
