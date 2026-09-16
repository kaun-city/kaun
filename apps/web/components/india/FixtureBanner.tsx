import { isFixtureMode } from "@/lib/india/fixtures"

/**
 * The India layer's tables do not exist in production yet (schema PR #63,
 * loaders after it), so these pages render from a small committed fixture set.
 *
 * That is only acceptable if it is impossible to mistake for live data. On a
 * civic-transparency site, a sample criminal-case count or a sample cost
 * overrun that looks real is the worst failure mode available — worse than the
 * page being empty. So the banner is unmissable and renders on every India
 * page, including the shared ones. It speaks to the reader, not to whoever
 * deployed it: the environment flag behind it (NEXT_PUBLIC_KAUN_INDIA_FIXTURES)
 * is documented in lib/india/fixtures.ts, not printed on a public page.
 *
 * Renders nothing at all in live-data mode (the default).
 */
export function FixtureBanner() {
  if (!isFixtureMode()) return null
  return (
    <div className="w-full bg-warning/[0.07] border-b-2 border-warning px-4 py-2 text-warning">
      <p className="max-w-5xl mx-auto text-sm leading-snug">
        <span className="font-mono font-semibold uppercase tracking-[0.12em] text-[11px] mr-2">Preview data</span>
        These pages are showing a small sample — four Karnataka seats, built from real public records —
        not the live national dataset. Numbers here are for previewing the layout, not for citing.
      </p>
    </div>
  )
}
