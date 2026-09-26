import { createClient } from "@supabase/supabase-js"
import { enforceRateLimit, makeReportLimiter } from "@/lib/ratelimit"
import { publicSupabaseConfig } from "@/lib/supabase-config"
import { sendTelegramMessage } from "@/lib/telegram"

export const runtime = "nodejs"
export const maxDuration = 20

const ISSUE_TYPES = ["hoarding", "pothole", "flooding", "construction", "encroachment", "garbage", "signal", "other"] as const
type IssueType = typeof ISSUE_TYPES[number]

/** Boundary systems a report may be tagged with. Extend when a new delimitation ships. */
const BOUNDARY_SYSTEMS = ["gba-369-2025"] as const
const MAX_CORPORATION_ID = 99
const MAX_WARD_NO = 999
const MAX_HISTORICAL_WARDS = 12
const MAX_WARD_NAME_LENGTH = 80
const WARD_IDENTITY_COLUMNS = ["boundary_system", "gba_corporation_id", "gba_ward_no", "historical_wards"] as const

interface HistoricalWard {
  ward_no: number
  ward_name: string
  current_share: number
  legacy_share: number
}

interface SubmitReportBody {
  lat: number
  lng: number
  ward_no?: number
  ward_name?: string
  boundary_system?: unknown
  gba_corporation_id?: unknown
  gba_ward_no?: unknown
  historical_wards?: unknown
  issue_type: IssueType
  description?: string
  location_text?: string
  photo_base64?: string   // data:image/jpeg;base64,...
  photo_mime?: string
}

interface WardIdentity {
  boundary_system: string | null
  gba_corporation_id: number | null
  gba_ward_no: number | null
  historical_wards: HistoricalWard[]
}

const isAbsent = (value: unknown) => value === undefined || value === null
const isIdInRange = (value: unknown, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= max
const isShare = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1

/** Validates the current-ward identity fields; returns null when any is malformed. */
function parseWardIdentity(body: SubmitReportBody): WardIdentity | null {
  const { boundary_system, gba_corporation_id, gba_ward_no, historical_wards } = body

  if (!isAbsent(boundary_system) && !(BOUNDARY_SYSTEMS as readonly unknown[]).includes(boundary_system)) return null
  if (!isAbsent(gba_corporation_id) && !isIdInRange(gba_corporation_id, MAX_CORPORATION_ID)) return null
  if (!isAbsent(gba_ward_no) && !isIdInRange(gba_ward_no, MAX_WARD_NO)) return null
  // A current ward number means nothing without the boundary system it belongs to.
  if (isAbsent(boundary_system) && (!isAbsent(gba_corporation_id) || !isAbsent(gba_ward_no))) return null

  const wards: HistoricalWard[] = []
  if (!isAbsent(historical_wards)) {
    if (!Array.isArray(historical_wards) || historical_wards.length > MAX_HISTORICAL_WARDS) return null
    for (const item of historical_wards) {
      if (!item || typeof item !== "object") return null
      const { ward_no, ward_name, current_share, legacy_share } = item as Record<string, unknown>
      if (!isIdInRange(ward_no, MAX_WARD_NO)) return null
      if (typeof ward_name !== "string" || !ward_name.trim() || ward_name.length > MAX_WARD_NAME_LENGTH) return null
      if (!isShare(current_share) || !isShare(legacy_share)) return null
      wards.push({ ward_no, ward_name: ward_name.trim(), current_share, legacy_share })
    }
  }

  return {
    boundary_system: isAbsent(boundary_system) ? null : boundary_system as string,
    gba_corporation_id: isAbsent(gba_corporation_id) ? null : gba_corporation_id as number,
    gba_ward_no: isAbsent(gba_ward_no) ? null : gba_ward_no as number,
    historical_wards: wards,
  }
}

/** True when the insert failed only because the additive ward-identity migration is not applied yet. */
function isMissingWardIdentityColumn(error: { code?: string; message?: string; details?: string; hint?: string } | null): boolean {
  if (!error) return false
  const text = [error.message, error.details, error.hint].filter(Boolean).join(" ")
  const mentionsColumn = WARD_IDENTITY_COLUMNS.some(column => new RegExp(`\\b${column}\\b`, "i").test(text))
  const isColumnError = error.code === "PGRST204" || error.code === "42703" || /column/i.test(text)
  return mentionsColumn && isColumnError
}

export async function POST(req: Request) {
  const limited = await enforceRateLimit(makeReportLimiter, req, "Issue reporting")
  if (limited) return limited

  try {
    const body: SubmitReportBody = await req.json()
    const { lat, lng, ward_no, ward_name, issue_type, description, location_text, photo_base64, photo_mime } = body

    if (!lat || !lng || !issue_type || !ISSUE_TYPES.includes(issue_type)) {
      return Response.json({ error: "Missing required fields" }, { status: 400 })
    }

    const identity = parseWardIdentity(body)
    if (!identity) {
      return Response.json({ error: "Invalid ward identity" }, { status: 400 })
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
    const baseRow = {
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
    }
    let { data: report, error: dbError } = await supabase
      .from("ward_reports")
      .insert({ ...baseRow, ...identity })
      .select("id")
      .single()

    // Deployments can receive the application before the additive migration.
    // Preserve reporting while making the loss of current identity temporary.
    if (isMissingWardIdentityColumn(dbError)) {
      const fallback = await supabase.from("ward_reports").insert(baseRow).select("id").single()
      report = fallback.data
      dbError = fallback.error
    }

    if (dbError) {
      console.error("DB error:", dbError)
      return Response.json({ error: "Failed to save report" }, { status: 500 })
    }

    // Notifications are best-effort: Telegram outages must not block reports.
    await sendTelegramMessage(
      `📍 New Kaun report\nIssue: ${issue_type}\nWard: ${ward_name || (ward_no ? `#${ward_no}` : "Unknown")}\nStatus: pending moderation\nhttps://kaun.city/status`,
    ).catch((err) => console.error("Telegram report notification failed:", err))

    return Response.json({ ok: true, id: report?.id ?? null })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("submit-report error:", msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
