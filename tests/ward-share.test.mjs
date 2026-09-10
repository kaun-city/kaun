import { readFile } from "node:fs/promises"
import test from "node:test"
import assert from "node:assert/strict"

const cardUrl = new URL("../apps/web/components/WardCard.tsx", import.meta.url)
const homeUrl = new URL("../apps/web/components/HomePage.tsx", import.meta.url)
const pageUrl = new URL("../apps/web/app/page.tsx", import.meta.url)
const ogUrl = new URL("../apps/web/app/api/og/route.tsx", import.meta.url)

test("current GBA ward shares keep the corporation-qualified identity", async () => {
  const card = await readFile(cardUrl, "utf8")
  assert.match(card, /gba_corporation=.*gba_ward=/)
  assert.match(card, /Bengaluru\.kaun\.city\?gba_corporation=/i)
  assert.match(card, /Population:/)
  assert.doesNotMatch(card.slice(card.indexOf("function buildShareText"), card.indexOf("export default")), /criminal cases|attendance|utilized development funds/i)
})

test("a current ward share opens its own map pin and has ward-first metadata", async () => {
  const [home, page, og] = await Promise.all([readFile(homeUrl, "utf8"), readFile(pageUrl, "utf8"), readFile(ogUrl, "utf8")])
  assert.match(home, /gba_corporation/)
  assert.match(home, /activeCity\.geojsonUrl/)
  assert.match(home, /pinLookup\(lat, lng\)/)
  assert.match(page, /gba_wards\?gba_corporation_id/)
  assert.match(page, /Bengaluru \$\{ward\.gba_corporation\}/)
  assert.match(page, /Historic BBMP Ward/)
  assert.match(og, /gba_wards\?gba_corporation_id/)
  assert.match(og, /Historic BBMP ward/)
  assert.match(og, /Explore your ward(?:'|&apos;)s civic data/)
  assert.doesNotMatch(og, /rep_report_cards/)
})
