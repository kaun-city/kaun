import { buildWardLive } from "@/lib/ward-record"
import { serverGbaWard } from "@/lib/ward-record-server"

export const runtime = "nodejs"
export const maxDuration = 15

/**
 * GET /api/ward/<corporation>/<ward>/live — what residents add or report:
 * report count (30 days), civic signals (7 days), unanswered questions and
 * community facts. Kept apart from the day-long record so a new report or fact
 * shows within a minute; cached for 60 s (then served stale for 5 minutes while
 * it refreshes), so a burst of opens of one ward costs one set of reads. Not
 * cached when a part failed.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ corporation: string; ward: string }> }) {
  const { corporation, ward } = await params
  const gbaWard = serverGbaWard(corporation, ward)
  if (!gbaWard) {
    return Response.json({ error: "No such GBA ward" }, { status: 404, headers: { "Cache-Control": "public, s-maxage=86400" } })
  }
  const live = await buildWardLive(gbaWard.result)
  return Response.json(live, {
    headers: {
      "Cache-Control": live.failed.length
        ? "no-store"
        : "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    },
  })
}
