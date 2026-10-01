import test from "node:test"
import assert from "node:assert/strict"
import { buildActivityDigest, changeLabel, parseTrafficSnapshot, PAGE_VIEW_TRACKING_STARTED_AT } from "../apps/web/lib/activity-digest.ts"

const counts = {
  pages24h: 4, pagesPrevious24h: 0, pages7d: 4, pagesPrevious7d: 0,
  pins24h: 0, pins7d: 6, pinsPrevious7d: 20,
  reports24h: 0, reports7d: 0, questions24h: 0, questions7d: 0,
}
const metrics = { visitors: 31, pageViews: 45, visitorChangePercent: -68, pageViewChangePercent: -81, bounceRatePercent: 81 }
const input = {
  now: PAGE_VIEW_TRACKING_STARTED_AT + 3600000, counts, health: "healthy", queryFailed: false,
  topWards: [{ ward_name: "Indiranagar", count: 2 }], issues: ["IFMS refresh failed; saved data retained."],
  snapshot: { at: new Date(PAGE_VIEW_TRACKING_STARTED_AT).toISOString(), metrics },
}

test("weekly visitors, dated source stats, engagement, and outstanding issues appear in the digest", () => {
  const message = buildActivityDigest(input)
  assert.match(message, /31 visitors \(-68%\).*45 views \(-81%\)/)
  assert.match(message, /Bounce rate: 81%/)
  assert.match(message, /Map pin drops: 0 \/ 6 \(-70% vs previous week\)/)
  assert.match(message, /Indiranagar 2/)
  assert.match(message, /no reports or questions/)
  assert.match(message, /IFMS refresh failed/)
})

test("new counters do not imply a growth spike before a complete comparison window", () => {
  const message = buildActivityDigest(input)
  assert.match(message, /daily baseline building/)
  assert.match(message, /weekly baseline building/)
  const mature = buildActivityDigest({ ...input, now: PAGE_VIEW_TRACKING_STARTED_AT + 15 * 86400000, snapshot: null })
  assert.match(mature, /up from zero vs previous 24h/)
})

test("stale or invalid dashboard snapshots are never presented as current traffic", () => {
  for (const at of ["invalid", new Date(input.now - 37 * 3600000).toISOString(), new Date(input.now + 10000).toISOString()]) {
    const message = buildActivityDigest({ ...input, snapshot: { at, metrics } })
    assert.match(message, /awaiting a fresh dashboard check/)
    assert.doesNotMatch(message, /31 visitors/)
  }
})

test("unknown counts stay unavailable and zero baselines do not divide by zero", () => {
  assert.equal(changeLabel(0, 0), "unchanged")
  assert.equal(changeLabel(2, 0), "up from zero")
  assert.equal(changeLabel(null, 5), "comparison unavailable")
  const message = buildActivityDigest({ ...input, counts: { ...counts, reports7d: null }, queryFailed: true })
  assert.match(message, /Civic reports: 0 \/ unavailable/)
  assert.doesNotMatch(message, /no reports or questions/)
})

test("the upload accepts only valid aggregate metrics and strips arbitrary content", () => {
  assert.deepEqual(parseTrafficSnapshot({ ...metrics, extra: "untrusted message" }), metrics)
  for (const bad of [null, { ...metrics, visitors: -1 }, { ...metrics, visitors: "31" }, { ...metrics, visitors: 2.5 }, { ...metrics, visitorChangePercent: -101 }, { ...metrics, bounceRatePercent: 120 }, { ...metrics, pageViewChangePercent: Infinity }]) {
    assert.equal(parseTrafficSnapshot(bad), null)
  }
})
