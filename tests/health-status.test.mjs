import test from "node:test"
import assert from "node:assert/strict"

import { deriveOverallHealth } from "../apps/web/lib/health-status.ts"

const healthyInput = {
  supabaseConnected: true,
  hasTableErrors: false,
  coreDataHealthy: true,
  hasStalePipelines: false,
}

test("overall health is healthy only when storage, core data, and pipelines are healthy", () => {
  assert.equal(deriveOverallHealth(healthyInput), "healthy")
})

test("a stale pipeline degrades overall health", () => {
  assert.equal(deriveOverallHealth({ ...healthyInput, hasStalePipelines: true }), "degraded")
})

test("table errors or missing core data degrade overall health", () => {
  assert.equal(deriveOverallHealth({ ...healthyInput, hasTableErrors: true }), "degraded")
  assert.equal(deriveOverallHealth({ ...healthyInput, coreDataHealthy: false }), "degraded")
})

test("a disconnected database makes overall health down", () => {
  assert.equal(deriveOverallHealth({ ...healthyInput, supabaseConnected: false }), "down")
})
