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
 */
export interface SourceEntry {
  name: string
  publisher: string
  period: string
  url?: string | null
  /** Anything a reader needs in order not to over-read the number. */
  caveat?: string
}

export function SourcesFooter({
  sources, crosswalkNote,
}: { sources: SourceEntry[]; crosswalkNote?: string }) {
  return (
    <footer className="mt-10 border-t border-white/5 pt-5 pb-10">
      <p className="text-white/30 text-xs uppercase tracking-wider mb-3">Sources</p>
      <div className="rounded-xl bg-white/[0.03] overflow-hidden">
        <div className="divide-y divide-white/5">
          {sources.map(s => (
            <div key={s.name} className="px-4 py-2.5">
              <p className="text-white/70 text-xs">{s.name}</p>
              <p className="text-white/30 text-[11px] mt-0.5">
                {s.publisher} · {s.period}
                {s.url && (
                  <> · <a href={s.url} target="_blank" rel="noopener noreferrer"
                    className="text-[#FF9933]/60 hover:text-[#FF9933]">source</a></>
                )}
              </p>
              {s.caveat && <p className="text-white/25 text-[11px] mt-1 leading-snug">{s.caveat}</p>}
            </div>
          ))}
        </div>
      </div>

      <p className="text-white/25 text-[11px] mt-3 leading-relaxed">
        Constituency boundaries: Kaun PC boundary build <span className="font-mono">{PC_GEOJSON_VERSION}</span> —
        DataMeet&apos;s 2019 parliamentary-constituency file, with Assam, Jammu &amp; Kashmir and Ladakh
        geometry replaced from shijithpk&apos;s 2024 supplement because DataMeet predates the 2023 Assam and
        2022 J&amp;K delimitations and has no Ladakh entry at all. Built by{" "}
        <span className="font-mono">scripts/india/build-pc-geojson.mjs</span>; counts and simplification
        parameters in <span className="font-mono">data/india/pc-boundaries-manifest.json</span>.
      </p>
      {crosswalkNote && (
        <p className="text-white/25 text-[11px] mt-2 leading-relaxed">{crosswalkNote}</p>
      )}
      <p className="text-white/15 text-[11px] mt-3">
        All data is from public records. kaun.city aggregates and serves — we don&apos;t generate the
        underlying data. Found an error? <a href="https://github.com/kaun-city/kaun/issues/new"
          target="_blank" rel="noopener noreferrer" className="text-[#FF9933]/50 hover:text-[#FF9933]">Open an issue.</a>
      </p>
    </footer>
  )
}
