import { IndiaHeader } from "./IndiaHeader"
import { BackToMap } from "./BackToMap"
import { SkeletonLine } from "@/components/shared/Skeleton"
import { indiaHref } from "@/lib/host-routing"

/**
 * What an India object page looks like before its data arrives.
 *
 * This is the fallback the route-level loading.tsx files render, which is the
 * same markup Next serves for a <Link> prefetch of a page it has not built
 * yet. It exists so that clicking a seat on the map paints the page's shape
 * immediately — real chrome, real navigation, the header already usable —
 * instead of leaving the visitor on the map with nothing happening while a
 * server renders. On a warm ISR hit it is never seen at all.
 *
 * It mirrors ObjectHeader + Section rather than inventing a shape, so the
 * skeleton settles into the real page instead of being replaced by it: same
 * max width, same padding, same section rhythm. Every bar is inert — there is
 * nothing to announce here, so the whole thing is hidden from screen readers
 * and the loading state is carried by aria-busy on the container.
 */
export function ObjectPageSkeleton({
  sections = 5,
  backToMap = false,
}: {
  sections?: number
  /**
   * Render the "Map" control in the skeleton too. On by default for seats,
   * because a seat page HAS one: leaving it out would make the real page push
   * everything down by a chip's height the moment it arrived (on md and up,
   * where the control is in flow), which is the jump this component exists to
   * avoid. It also means a slow first render can be abandoned rather than
   * waited out. Project pages have no such control, so they pass nothing.
   */
  backToMap?: boolean
}) {
  return (
    <div className="h-full overflow-y-auto" aria-busy="true" aria-label="Loading">
      <div className={`max-w-3xl mx-auto px-5 py-6 ${backToMap ? "pb-28 md:pb-6" : ""}`}>
        {/* Live, not a grey bar: it is the one thing here that works. */}
        {backToMap && <BackToMap href={indiaHref("/")} />}

        <IndiaHeader />

        <div className="mt-6" aria-hidden="true">
          {/* identity block: eyebrow, title, subtitle, chips — matched to
              ObjectHeader's own rhythm so the real page settles into this
              rather than replacing it */}
          <SkeletonLine className="h-2.5 w-40" />
          <SkeletonLine className="h-7 w-64 mt-1.5" />
          <SkeletonLine className="h-3 w-48 mt-2.5" />
          <div className="flex flex-wrap gap-1.5 mt-3">
            {["w-16", "w-24", "w-14", "w-20"].map((w, i) => (
              <SkeletonLine key={i} className={`h-[26px] ${w}`} />
            ))}
          </div>

          {Array.from({ length: sections }).map((_, i) => (
            <div key={i} className="mt-8">
              <SkeletonLine className="h-2.5 w-32" />
              <div className="mt-2.5 rounded-xl bg-white/5 p-4 space-y-2.5">
                <SkeletonLine className="h-3 w-3/4" />
                <SkeletonLine className="h-3 w-1/2" />
                <SkeletonLine className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
