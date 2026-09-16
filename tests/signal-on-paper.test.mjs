import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const css = readFileSync(new URL("../apps/web/app/globals.css", import.meta.url), "utf8")
const home = readFileSync(new URL("../apps/web/components/HomePage.tsx", import.meta.url), "utf8")
const india = readFileSync(new URL("../apps/web/components/india/IndiaHome.tsx", import.meta.url), "utf8")
const project = readFileSync(new URL("../apps/web/app/bengaluru/projects/[slug]/page.tsx", import.meta.url), "utf8")

function luminance(hex) {
  const channels = hex.match(/../g).map(part => parseInt(part, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrast(foreground, background) {
  const a = luminance(foreground)
  const b = luminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

test("the shared Signal on Paper palette matches the supplied reference", () => {
  assert.match(css, /--signal-canvas:\s*#f2ede4/i)
  assert.match(css, /--signal-paper:\s*#f8f5ef/i)
  assert.match(css, /--signal-ink:\s*#16130e/i)
  assert.match(css, /--signal-danger:\s*#b42318/i)
})

test("the live maps use the paper treatment instead of a dark tile filter", () => {
  assert.match(home, /className="signal-map/)
  assert.match(india, /className="signal-map/)
  assert.match(css, /\.signal-map \.kaun-base-map-tiles/)
  assert.match(css, /grayscale\(1\).*brightness\(1\.15\).*contrast\(0\.68\)/s)
  assert.doesNotMatch(css.match(/\.signal-map \.kaun-base-map-tiles[\s\S]*?\}/)?.[0] ?? "", /invert\(/)
})

test("content pages and civic records opt into the same visual language", () => {
  for (const source of [
    "../apps/web/app/data/page.tsx",
    "../apps/web/app/how-it-works/page.tsx",
    "../apps/web/app/status/page.tsx",
    "../apps/web/app/admin/page.tsx",
  ]) {
    assert.match(readFileSync(new URL(source, import.meta.url), "utf8"), /signal-page/)
  }
  assert.match(project, /signal-record/)
})

test("the paper palette keeps essential text at accessible contrast", () => {
  assert.ok(contrast("16130e", "f8f5ef") >= 7)
  assert.ok(contrast("b35400", "f8f5ef") >= 4.5)
  assert.ok(contrast("b42318", "f8f5ef") >= 4.5)
})
