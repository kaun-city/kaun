import { IndiaHeader } from "@/components/india/IndiaHeader"
import { SkeletonLine } from "@/components/shared/Skeleton"

/**
 * The tracker is the one India page that stays per-request — its content is a
 * function of ?sort= and ?state= — so this boundary is the whole reason a
 * <Link> to it can feel instant. A prefetch of a dynamic route fetches exactly
 * this, and clicking then paints the page's frame while the server renders the
 * rows behind it.
 *
 * Wider than the object-page skeleton (max-w-4xl) because the tracker is, and
 * a skeleton at the wrong width reads as the page jumping when it arrives.
 */
export default function Loading() {
  return (
    <div className="h-full overflow-y-auto" aria-busy="true" aria-label="Loading">
      <div className="max-w-4xl mx-auto px-5 py-6">
        <IndiaHeader />

        <div className="mt-6" aria-hidden="true">
          <SkeletonLine className="h-2.5 w-56" />
          <SkeletonLine className="h-7 w-72 mt-2" />
          <SkeletonLine className="h-3 w-full max-w-2xl mt-3" />
          <SkeletonLine className="h-3 w-3/4 max-w-2xl mt-1.5" />

          {/* sort + state controls */}
          <div className="flex flex-wrap gap-1.5 mt-5">
            {["w-24", "w-28", "w-20", "w-16", "w-32"].map((w, i) => (
              <SkeletonLine key={i} className={`h-7 ${w}`} />
            ))}
          </div>

          {[0, 1].map(section => (
            <div key={section} className="mt-7">
              <SkeletonLine className="h-2.5 w-40" />
              <div className="mt-2.5 space-y-2">
                {Array.from({ length: section === 0 ? 2 : 5 }).map((_, i) => (
                  <div key={i} className="rounded-xl bg-white/5 p-4 space-y-3">
                    <SkeletonLine className="h-3.5 w-2/3" />
                    <SkeletonLine className="h-2.5 w-1/3" />
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
                      {[0, 1, 2, 3].map(j => (
                        <div key={j} className="space-y-1.5">
                          <SkeletonLine className="h-2 w-16" />
                          <SkeletonLine className="h-4 w-20" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
