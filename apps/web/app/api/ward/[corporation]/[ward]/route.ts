import { buildWardRecord } from "@/lib/ward-record"
import { SERVER_WARD_SOURCES, serverGbaWard } from "@/lib/ward-record-server"

export const runtime = "nodejs"
export const maxDuration = 30

/**
 * GET /api/ward/<corporation>/<ward> — the ward card's rarely-changing record
 * (lib/ward-record.ts) for a current GBA-369 ward, in one response.
 *
 * CACHED AT THE EDGE, AND ONLY HERE. A complete record is cached by Vercel's
 * CDN for a day and served stale for a week while it refreshes, so most opens
 * never reach the database. This route opts in on its own: /api/* is also read
 * by the BNP export pipeline and by crons, which must see live rows (see
 * lib/supabase.ts). A record with a failed section is never cached, so the
 * next open retries it instead of keeping the gap for a day.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ corporation: string; ward: string }> }) {
  const { corporation, ward } = await params
  const gbaWard = serverGbaWard(corporation, ward)
  if (!gbaWard) {
    return Response.json({ error: "No such GBA ward" }, { status: 404, headers: { "Cache-Control": "public, s-maxage=86400" } })
  }
  const record = await buildWardRecord(gbaWard.result, SERVER_WARD_SOURCES, gbaWard.centre)
  return Response.json(record, {
    headers: {
      "Cache-Control": record.failed.length
        ? "no-store"
        : "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
    },
  })
}
