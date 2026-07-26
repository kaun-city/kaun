import IndiaHome from "@/components/india/IndiaHome"
import { fetchAllSittingMps } from "@/lib/india/api"

/**
 * The national map.
 *
 * The MP roster is fetched on the server so the search box can match on member
 * names from the first keystroke, and so a crawler sees them. The polygons
 * themselves are a static asset the client streams — 543 multipolygons have no
 * business in an HTML payload.
 */
export const dynamic = "force-dynamic"

export default async function IndiaMapPage() {
  const mps = await fetchAllSittingMps()
  return <IndiaHome mps={mps.filter(m => m.pc_code !== null) as Array<{ pc_code: string; name: string; party_abbr: string | null; is_minister: boolean }>} />
}
