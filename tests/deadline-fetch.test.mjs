import test from "node:test"
import assert from "node:assert/strict"
import { deadlineFetch, withDeadline } from "../apps/web/lib/deadline-fetch.ts"

test("whole-operation deadline rejects even when an SDK ignores cancellation", async () => {
  await assert.rejects(withDeadline(new Promise(() => {}), 10), { name: "TimeoutError" })
  assert.equal(await withDeadline(Promise.resolve("complete"), 1000), "complete")
})

test("upstream calls share one deadline, including later calls", async () => {
  const original = globalThis.fetch
  const signals = []
  globalThis.fetch = async (_input, init) => { signals.push(init.signal); return Response.json({ ok: true }) }
  try {
    const bounded = deadlineFetch(10)
    await bounded("https://example.com")
    await new Promise(resolve => setTimeout(resolve, 25))
    await bounded("https://example.com")
    assert.equal(signals[0], signals[1])
    assert.equal(signals[1].aborted, true)
  } finally { globalThis.fetch = original }
})

test("caller cancellation is preserved", async () => {
  const original = globalThis.fetch
  let seen
  globalThis.fetch = async (_input, init) => { seen = init.signal; return Response.json({ ok: true }) }
  try {
    const caller = new AbortController()
    await deadlineFetch(1000)("https://example.com", { signal: caller.signal })
    caller.abort()
    assert.equal(seen.aborted, true)
  } finally { globalThis.fetch = original }
})
