import { PC_GEOJSON_VERSION } from "@/lib/india/constants"

/**
 * Every India page ends with the full list of datasets behind what is above it,
 * each with its publisher, the period it covers, and a link where one exists.
 *
 * This is the same discipline as the ward crosswalk's methodology page and
 * /data's source table, applied at national scale: a number on Kaun is only
 * worth anything if a reader can go and check it. The boundary version string
 * is included for the same reason the crosswalk carries one — a seat outline
 * that changed between delimitations has to be attributable to a build.
 *
 * Written for citizens, not contributors: publishers and plain descriptions,
 * never repository paths. The boundary build script is one link away for
 * anyone who wants it, under a label that says what it is.
 *
 * Every link here is a 44px-tall target. Source links sit in their own column
 * beside each entry rather than inline in an 11px line, where they were 15–20px
 * tall and stacked one above the next.
 */
export interface SourceEntry {
  name: string
  publisher: string
  period: string
  url?: string | null
  /** Anything a reader needs in order not to over-read the number. */
  caveat?: string
}

const BOUNDARY_BUILD_URL = "https://github.com/kaun-city/kaun/blob/master/scripts/india/build-pc-geojson.mjs"

const LINK = "text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"

export function SourcesFooter({
  sources, crosswalkNote,
}: { sources: SourceEntry[]; crosswalkNote?: string }) {
  return (
    <footer className="mt-10 border-t border-ink/15 pt-5 pb-10">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60 mb-3">Sources</p>
      <div className="bg-paper border border-ink/15">
        <div className="divide-y divide-ink/10">
          {sources.map(s => (
            <div key={s.name} className="flex items-start justify-between gap-3 py-2.5 pl-4 pr-1">
              <div className="min-w-0">
                <p className="text-ink/85 text-sm">{s.name}</p>
                <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink/60 mt-0.5">
                  {s.publisher} · {s.period}
                </p>
                {s.caveat && <p className="text-ink/60 text-xs mt-1 leading-snug">{s.caveat}</p>}
              </div>
              {s.url && (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Source: ${s.publisher} (opens in a new tab)`}
                  className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center px-3 -my-1.5
                    font-mono text-[11px] uppercase tracking-[0.06em] ${LINK}`}
                >
                  Source
                </a>
              )}
            </div>
          ))}
        </div>
      </div>

      <p className="text-ink/60 text-xs mt-3 leading-relaxed">
        Constituency boundaries: DataMeet&apos;s 2019 parliamentary-constituency map, with Assam, Jammu
        &amp; Kashmir and Ladakh replaced from shijithpk&apos;s 2024 supplement, because DataMeet predates
        the 2023 Assam and 2022 J&amp;K delimitations and has no Ladakh entry at all. Kaun boundary file
        version {PC_GEOJSON_VERSION}.{" "}
        <a href={BOUNDARY_BUILD_URL} target="_blank" rel="noopener noreferrer"
          className={`inline-flex min-h-11 items-center ${LINK}`}>How the boundary file is built</a>
      </p>
      {crosswalkNote && (
        <p className="text-ink/60 text-xs mt-2 leading-relaxed">{crosswalkNote}</p>
      )}
      <p className="text-ink/60 text-xs mt-3">
        All data is from public records. kaun.city aggregates and serves — we don&apos;t generate the
        underlying data. Found an error?{" "}
        <a href="https://github.com/kaun-city/kaun/issues/new" target="_blank" rel="noopener noreferrer"
          className={`inline-flex min-h-11 items-center ${LINK}`}>Open an issue.</a>
      </p>
    </footer>
  )
}
