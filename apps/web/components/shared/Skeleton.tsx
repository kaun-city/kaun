/** Reusable skeleton building blocks */

interface SkeletonProps {
  className?: string
}

/** Single skeleton line */
export function SkeletonLine({ className = "" }: SkeletonProps) {
  return <div className={`bg-white/8 rounded animate-pulse ${className}`} />
}

/** Skeleton card block with 2-3 lines */
export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  const widths = ["w-3/4", "w-1/2", "w-5/6", "w-2/3"]
  return (
    <div className="p-3 rounded-xl bg-white/5 space-y-2">
      <SkeletonLine className="h-3 w-full" />
      {Array.from({ length: lines - 1 }).map((_, i) => (
        <SkeletonLine key={i} className={`h-3 ${widths[i % widths.length]}`} />
      ))}
    </div>
  )
}

/** Skeleton for the rep / officer section */
export function SkeletonRepCard() {
  return (
    <div className="p-3 rounded-xl bg-white/5 space-y-2">
      <div className="flex items-center gap-2">
        <SkeletonLine className="h-2.5 w-12" />
        <SkeletonLine className="h-2.5 w-8" />
      </div>
      <SkeletonLine className="h-4 w-40" />
      <SkeletonLine className="h-2.5 w-28" />
    </div>
  )
}

/** Skeleton for the scorecard grid */
export function SkeletonScorecard() {
  return (
    <div className="p-3 rounded-xl bg-white/5 space-y-3">
      <SkeletonLine className="h-2.5 w-36" />
      <div className="grid grid-cols-2 gap-2">
        {[1,2,3,4].map(i => (
          <div key={i} className="space-y-1">
            <SkeletonLine className="h-2 w-16" />
            <SkeletonLine className="h-5 w-12" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Skeleton for a stats section */
export function SkeletonStats() {
  return (
    <div className="space-y-3">
      <div className="p-3 rounded-xl bg-white/5 space-y-3">
        <SkeletonLine className="h-2.5 w-24" />
        <div className="grid grid-cols-3 gap-2">
          {[1,2,3].map(i => (
            <div key={i} className="space-y-1">
              <SkeletonLine className="h-6 w-14" />
              <SkeletonLine className="h-2 w-10" />
            </div>
          ))}
        </div>
      </div>
      <div className="p-3 rounded-xl bg-white/5 space-y-2">
        <SkeletonLine className="h-2.5 w-28" />
        {[1,2,3,4].map(i => (
          <div key={i} className="flex items-center gap-2">
            <SkeletonLine className="h-3 w-3" />
            <SkeletonLine className="h-3 flex-1" />
            <SkeletonLine className="h-3 w-10" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Skeleton for a bar chart row */
export function SkeletonBarRow() {
  return (
    <div className="space-y-2.5">
      {[1,2,3].map(i => (
        <div key={i} className="space-y-1">
          <div className="flex justify-between">
            <SkeletonLine className="h-2.5 w-32" />
            <SkeletonLine className="h-2.5 w-20" />
          </div>
          <SkeletonLine className="h-1.5 w-full" />
        </div>
      ))}
    </div>
  )
}
