import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

/**
 * One visual language for kaun.city. Every UI file uses the Signal on Paper
 * tokens from apps/web/lib/design-tokens.ts; nothing may fall back to the old
 * dark theme, and globals.css may not repaint dark classes after the fact.
 */

const root = fileURLToPath(new URL("..", import.meta.url))
const web = join(root, "apps/web")

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return walk(path)
    return /\.(tsx?|mjs)$/.test(name) ? [path] : []
  })
}

/** Blank out comments but keep line numbers. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, " "))
    .replace(/^(\s*)\/\/.*$/gm, (_, indent) => indent)
}

const V = "(?<![\\w-])(?:[a-z0-9-]+:)*" // variant prefixes such as hover: or lg:
const COLOR_UTIL = "(?:bg|text|border(?:-[trblxy])?|divide|ring|placeholder|from|via|to|fill|stroke|outline|decoration|shadow|caret)"

const RULES = [
  { name: "white/black utility (use paper/ink tokens)", re: new RegExp(`${V}${COLOR_UTIL}-(?:white|black)(?:\\/[\\w.\\[\\]]+)?(?![\\w-])`, "g") },
  { name: "grey scale utility (use ink opacity)", re: new RegExp(`${V}${COLOR_UTIL}-(?:zinc|neutral|gray|slate|stone)-\\d{2,3}`, "g") },
  { name: "Tailwind palette colour (use danger/warning/success/info)", re: new RegExp(`${V}${COLOR_UTIL}-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d{2,3}`, "g") },
  { name: "arbitrary hex colour class (use a token)", re: new RegExp(`${V}${COLOR_UTIL}-\\[#[0-9a-fA-F]{3,8}\\]`, "g") },
  { name: "saffron utility (use accent)", re: new RegExp(`${V}[a-z]+-saffron(?![\\w-])`, "g") },
  { name: "old dark palette hex", re: /#(?:0A0A0A|111111|1A1A1A|FF9933)(?![0-9a-fA-F])|["'`]#111["'`]/gi },
  { name: "rounded corners (paper is square; rounded-full only for dots/pins)", re: new RegExp(`${V}rounded(?:-(?:t|b|l|r|s|e|tl|tr|bl|br))?(?:-(?:sm|md|lg|xl|2xl|3xl))?(?=[\\s"'\`}])`, "g") },
  { name: "soft shadow (paper has none)", re: new RegExp(`${V}shadow(?:-(?:sm|md|lg|xl|2xl|inner))?(?=[\\s"'\`}])`, "g") },
  { name: "backdrop blur (paper is opaque)", re: new RegExp(`${V}backdrop-blur(?:-[\\w]+)?`, "g") },
  { name: "ink text below 50% opacity (fails contrast)", re: new RegExp(`${V}text-ink\\/(?:[0-4]?\\d)(?![\\d.])`, "g") },
]

/** Data encodings with their own documented palettes. */
const HEX_EXEMPT = new Set([
  "apps/web/lib/constants.ts",      // party colours
  "apps/web/lib/map-layers.ts",     // choropleth ramps
  "apps/web/lib/india/viz.ts",      // national data ramps
])

const uiFiles = [...walk(join(web, "app")), ...walk(join(web, "components"))]
const libFiles = walk(join(web, "lib"))

for (const file of uiFiles) {
  const rel = relative(root, file)
  test(`one style: ${rel}`, () => {
    const lines = stripComments(readFileSync(file, "utf8")).split("\n")
    const problems = []
    lines.forEach((line, index) => {
      for (const rule of RULES) {
        for (const match of line.matchAll(rule.re)) problems.push(`${rel}:${index + 1}  ${match[0].trim()}  — ${rule.name}`)
      }
    })
    assert.deepEqual(problems, [], `\n${problems.join("\n")}`)
  })
}

for (const file of libFiles) {
  const rel = relative(root, file).replaceAll("\\", "/")
  // lib holds class tables (status and trust badges) as well as data palettes.
  const rules = HEX_EXEMPT.has(rel) ? RULES.filter(rule => rule.name !== "old dark palette hex") : RULES
  test(`one style (lib): ${rel}`, () => {
    const problems = stripComments(readFileSync(file, "utf8")).split("\n")
      .flatMap((line, index) => rules.flatMap(rule => [...line.matchAll(rule.re)].map(match => `${rel}:${index + 1}  ${match[0].trim()}  — ${rule.name}`)))
    assert.deepEqual(problems, [], `\n${problems.join("\n")}`)
  })
}

test("globals.css does not repaint dark classes with attribute selectors", () => {
  const css = readFileSync(join(web, "app/globals.css"), "utf8")
  const lines = css.split("\n")
    .map((line, index) => [index + 1, line])
    .filter(([, line]) => /\[class[*~^$|]?=/.test(line))
  assert.deepEqual(lines.map(([n, line]) => `globals.css:${n} ${line.trim()}`), [])
})

test("CSS variables mirror lib/design-tokens.ts", () => {
  const tokens = readFileSync(join(web, "lib/design-tokens.ts"), "utf8")
  const css = readFileSync(join(web, "app/globals.css"), "utf8").toLowerCase()
  const hexes = [...tokens.matchAll(/"(#[0-9A-Fa-f]{6})"/g)].map(match => match[1].toLowerCase())
  assert.ok(hexes.length >= 10)
  for (const hex of hexes) assert.ok(css.includes(hex), `globals.css is missing token ${hex}`)
})
