import assert from "node:assert/strict"
import test from "node:test"
import { formatCrore, formatINR, formatLakh } from "../apps/web/lib/ward-utils.ts"

test("lakh amounts convert to crore at 100 L = 1 Cr", () => {
  assert.equal(formatLakh(15000), "₹150 Cr")
  assert.equal(formatLakh(250), "₹2.5 Cr")
  assert.equal(formatLakh(82), "₹82 L")
  assert.equal(formatLakh(1992700), "₹19,927 Cr")
})

test("rupee and crore inputs share the same display", () => {
  assert.equal(formatINR(2_120_000_000), "₹212 Cr")
  assert.equal(formatINR(4103), "₹4,103")
  assert.equal(formatCrore(19927), "₹19,927 Cr")
  assert.equal(formatCrore(4.5), "₹4.5 Cr")
})

test("missing amounts never render as zero rupees", () => {
  assert.equal(formatLakh(null), "—")
  assert.equal(formatINR(undefined), "—")
  assert.equal(formatINR(Number.NaN), "—")
})
