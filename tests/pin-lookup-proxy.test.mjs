import { readFile } from "node:fs/promises"
import test from "node:test"
import assert from "node:assert/strict"

const routeUrl = new URL("../apps/web/app/api/pin-lookup/route.ts", import.meta.url)
const apiUrl = new URL("../apps/web/lib/api.ts", import.meta.url)
const homeUrl = new URL("../apps/web/components/HomePage.tsx", import.meta.url)

test("pin lookup goes through Kaun's server route instead of the visitor's Supabase connection", async () => {
  const [route, api] = await Promise.all([readFile(routeUrl, "utf8"), readFile(apiUrl, "utf8")])

  assert.match(route, /export async function POST/)
  assert.match(route, /rest\/v1\/rpc\/pin_lookup/)
  assert.match(route, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(api, /fetch\("\/api\/pin-lookup"/)
  assert.doesNotMatch(api.slice(0, api.indexOf("/** Resolve a known ward identity")), /rpc\(/)
})

test("a real no-match opens the out-of-bounds state rather than a broken ward card", async () => {
  const home = await readFile(homeUrl, "utf8")
  assert.match(home, /if \(!result\?\.found\) \{[\s\S]*setOutOfBounds\(true\)/)
})
