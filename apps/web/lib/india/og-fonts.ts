/**
 * Fonts for the share cards.
 *
 * WHY THE CARDS CARRY THEIR OWN FONTS. Satori ships one built-in face: Noto
 * Sans, Latin, regular only. Rendering the India cards on it produced two
 * defects that a reader sees before they read a word:
 *
 *   1. ₹ (U+20B9) is not in it. Every declared-assets figure came out as a
 *      tofu box — "□81.31 Cr" — on a card whose entire job is to carry a
 *      rupee figure credibly.
 *   2. There is no bold. `fontWeight: 700` silently resolved to regular, so
 *      the seat name and the member's name had no more weight than the
 *      footnote under them.
 *
 * next/og will otherwise reach out to Google at render time for any glyph it
 * cannot draw. That worked for Devanagari and returned HTTP 400 for ₹, which
 * is the worst of both: a network round trip on the critical path for a
 * crawler, and no guarantee at the end of it. Bundling the three faces we
 * actually need removes the network from the picture entirely.
 *
 * WHAT IS BUNDLED, AND HOW SMALL. Inter is the app's UI font (app/layout.tsx
 * loads it via next/font), so the cards look like the site. The files here are
 * pyftsubset-ed to the ranges these cards can contain — Latin + Latin-1 +
 * Latin Extended-A + general punctuation + ₹ for Inter, and the Devanagari
 * block (with its layout tables intact, so conjuncts still shape) for the
 * Hindi seat name. 125 KB for all three, against 453 KB unsubsetted.
 *
 *   Inter                  SIL Open Font License 1.1  (github.com/rsms/inter)
 *   Noto Sans Devanagari   SIL Open Font License 1.1  (fonts.google.com/noto)
 *
 * `new URL(..., import.meta.url)` is the pattern Next documents for loading a
 * font into ImageResponse: the bundler rewrites it to an asset URL and traces
 * the file into the deployment, so this works in both the Node and Edge
 * runtimes without touching the filesystem or next.config's tracing options.
 *
 * FAILURE IS NOT FATAL. If a face cannot be read the card still renders — on
 * Satori's built-in font, with the old ₹ defect and no bold, but a valid
 * 1200×630 PNG. An unfurl has no error state, so nothing in the font path is
 * allowed to throw.
 */

/** What ImageResponse wants: family name, buffer, numeric weight, style. */
export interface OgFont {
  name: string
  data: ArrayBuffer
  weight: 400 | 700
  style: "normal"
}

const FACES = [
  { name: "Inter", weight: 400 as const, url: new URL("./fonts/Inter-Regular.woff", import.meta.url) },
  { name: "Inter", weight: 700 as const, url: new URL("./fonts/Inter-Bold.woff", import.meta.url) },
  {
    name: "Noto Sans Devanagari",
    weight: 400 as const,
    url: new URL("./fonts/NotoSansDevanagari-Regular.woff", import.meta.url),
  },
]

/**
 * Loaded once per instance. Cards are rendered by crawlers in bursts — one
 * link hits a dozen unfurlers within a second — and re-reading three files per
 * render is pure waste.
 */
let cached: Promise<OgFont[]> | null = null

/**
 * Read one face.
 *
 * Two ways, because `new URL(asset, import.meta.url)` does not resolve to the
 * same kind of URL everywhere: the Edge runtime rewrites it to something
 * fetch() can retrieve, while the Node runtime leaves a file: URL that Node's
 * fetch refuses outright. Trying the filesystem first when the scheme says
 * file:, and fetch otherwise, covers both without the route caring which
 * runtime it landed on.
 */
async function readFace(url: URL): Promise<ArrayBuffer | null> {
  try {
    if (url.protocol === "file:") {
      const { readFile } = await import("node:fs/promises")
      const buf = await readFile(url)
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    }
    const res = await fetch(url)
    return res.ok ? await res.arrayBuffer() : null
  } catch {
    return null
  }
}

export function ogFonts(): Promise<OgFont[]> {
  cached ??= Promise.all(
    FACES.map(async (f): Promise<OgFont | null> => {
      const data = await readFace(f.url)
      return data ? { name: f.name, data, weight: f.weight, style: "normal" } : null
    }),
  )
    .then(faces => faces.filter((f): f is OgFont => f !== null))
    .catch(() => [] as OgFont[])
    .then(faces => {
      // Never memoise a total failure: one bad read at cold start would
      // otherwise condemn every card this instance serves to the fallback
      // font. A partial result is fine to keep — the files are static.
      if (faces.length === 0) cached = null
      return faces
    })
  return cached
}
