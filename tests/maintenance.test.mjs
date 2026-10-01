import test from "node:test"
import assert from "node:assert/strict"
import { runBounded } from "../apps/web/lib/bounded-work.ts"
import { sendTelegramMessage } from "../apps/web/lib/telegram.ts"

test("a slow or rejected item does not block other work or exceed the worker count", async () => {
  let active = 0, peak = 0
  const seen = []
  const result = await runBounded([1, 2, 3, 4], async item => {
    active++; peak = Math.max(peak, active)
    await new Promise(resolve => setTimeout(resolve, 5))
    active--; seen.push(item)
    if (item === 2) throw new Error("source unavailable")
  }, 2, Infinity)
  assert.equal(peak, 2)
  assert.deepEqual(seen.sort(), [1, 2, 3, 4])
  assert.deepEqual(result, { completed: 3, failed: 1, deferred: 0 })
})

test("the processing deadline leaves remaining items for a later run", async () => {
  let time = 0
  const result = await runBounded([1, 2, 3], async () => { time += 10 }, 1, 15, () => time)
  assert.deepEqual(result, { completed: 2, failed: 0, deferred: 1 })
})

test("Telegram failures are contained and never log a token-bearing error", async () => {
  const originalFetch = globalThis.fetch
  const originalError = console.error
  const originalToken = process.env.TELEGRAM_BOT_TOKEN
  const originalChat = process.env.TELEGRAM_CHAT_ID
  const messages = []
  process.env.TELEGRAM_BOT_TOKEN = "test-secret"
  process.env.TELEGRAM_CHAT_ID = "123"
  console.error = (...args) => messages.push(args.join(" "))
  try {
    globalThis.fetch = async () => { throw new Error("network error at bot/test-secret/sendMessage") }
    assert.equal(await sendTelegramMessage("test"), false)
    assert.ok(messages.every(message => !message.includes("test-secret")))
    globalThis.fetch = async () => Response.json({ ok: false })
    assert.equal(await sendTelegramMessage("test"), false)
    globalThis.fetch = async () => Response.json({ ok: true })
    assert.equal(await sendTelegramMessage("test"), true)
  } finally {
    globalThis.fetch = originalFetch
    console.error = originalError
    if (originalToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = originalToken
    if (originalChat === undefined) delete process.env.TELEGRAM_CHAT_ID; else process.env.TELEGRAM_CHAT_ID = originalChat
  }
})
