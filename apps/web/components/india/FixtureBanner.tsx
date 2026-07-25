import { isFixtureMode } from "@/lib/india/fixtures"

/**
 * The India layer's tables do not exist in production yet (schema PR #63,
 * loaders after it), so these pages render from a small committed fixture set.
 *
 * That is only acceptable if it is impossible to mistake for live data. On a
 * civic-transparency site, a sample criminal-case count or a sample cost
 * overrun that looks real is the worst failure mode available — worse than the
 * page being empty. So the banner is unmissable, it names the flag that turns
 * it off, and it renders on every India page including the shared ones.
 *
 * Renders nothing at all when NEXT_PUBLIC_KAUN_INDIA_FIXTURES=0.
 */
export function FixtureBanner() {
  if (!isFixtureMode()) return null
  return (
    <div className="w-full bg-amber-500/10 border-b border-amber-500/25 px-4 py-2">
      <p className="max-w-5xl mx-auto text-amber-300/90 text-[11px] leading-snug">
        <span className="font-semibold uppercase tracking-widest text-[10px] mr-2">Preview data</span>
        These pages are running on a committed fixture set of four Karnataka seats — real rows from
        public sources, but a sample, not the live national dataset. The <code className="font-mono">in_*</code> tables
        are not deployed yet. Set <code className="font-mono">NEXT_PUBLIC_KAUN_INDIA_FIXTURES=0</code> once the
        schema and loaders have run.
      </p>
    </div>
  )
}
