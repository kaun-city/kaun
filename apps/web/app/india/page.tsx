import IndiaHome from "@/components/india/IndiaHome"
import { fetchAllSittingMps } from "@/lib/india/api"
import { PC_GEOJSON_URL } from "@/lib/india/constants"

/**
 * The national map.
 *
 * The MP roster is fetched on the server so the search box can match on member
 * names from the first keystroke, and so a crawler sees them. The polygons
 * themselves are a static asset the client streams — 543 multipolygons have no
 * business in an HTML payload.
 *
 * PRERENDERED, NOT PER-REQUEST. This is the front door of kaun.city and every
 * visitor gets byte-identical HTML: the same 543 seats, the same roster, no
 * query parameters, nothing personal. It used to be force-dynamic, which meant
 * a Vercel function and a Supabase round trip for the roster before the first
 * byte, on every single visit. Now it is rendered once an hour and served from
 * the edge. It reads no headers() precisely so that it can be — see
 * PRODUCTION_ROOT_DOMAIN in lib/host-routing.ts for what that costs and why
 * what it costs does not matter.
 *
 * The preload is the other half of the same idea. The boundary asset is 1.4 MB
 * and the map cannot draw without it, but it is fetched from inside a lazily
 * imported Leaflet component — so the browser learns it needs it only after the
 * map chunk has downloaded and run. Naming it in the initial HTML starts that
 * download immediately, in parallel with the JavaScript, which is most of the
 * wait a visitor experiences here. No crossOrigin attribute: the URL is
 * same-origin, and adding one would stop the preload matching the plain fetch()
 * that consumes it.
 */
export const revalidate = 3600 // = INDIA_REVALIDATE_SECONDS; must be a literal (Next segment config)

export default async function IndiaMapPage() {
  const mps = await fetchAllSittingMps()
  return (
    <>
      <link rel="preload" href={PC_GEOJSON_URL} as="fetch" />
      <IndiaHome
        mps={mps.filter(m => m.pc_code !== null) as Array<{ pc_code: string; name: string; party_abbr: string | null; is_minister: boolean }>} />
    </>
  )
}
