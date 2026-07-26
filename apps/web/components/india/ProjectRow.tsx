/**
 * One central project, in list form. Used by the constituency page's state
 * project list and by the tracker table's card layout on narrow screens.
 *
 * Always a link to the project's own page — a project is an object with a
 * stable URL, not a row that only exists inside a table.
 */
import { indiaHref } from "@/lib/host-routing"
import { formatCrore, formatCroreDelta, formatMonth, formatPct, formatSlip } from "@/lib/india/format"
import { divergingColor } from "@/lib/india/viz"
import type { TrackedProject } from "@/lib/india/types"

/** Anchors the diverging ramp: ₹500 Cr over is "extreme", and so is 5 years. */
export const OVERRUN_SCALE_CR = 500
export const SLIP_SCALE_MONTHS = 60

export function StaleLabel({ months }: { months: number | null }) {
  if (months === null) {
    return <span className="text-white/25">no change recorded in the months tracked</span>
  }
  if (months === 0) return <span className="text-white/70">changed this month</span>
  return <span className="text-white/60">{months} month{months === 1 ? "" : "s"} since a change</span>
}

export function ProjectRow({ p }: { p: TrackedProject }) {
  const overrunColor = divergingColor(p.cost_overrun_cr, OVERRUN_SCALE_CR)
  const slipColor = divergingColor(p.schedule_slip_months, SLIP_SCALE_MONTHS)

  return (
    <a
      href={indiaHref(`/projects/${p.project_code}`)}
      className="block rounded-xl bg-white/5 hover:bg-white/[0.08] transition-colors p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-white/85 text-sm font-medium leading-snug">{p.project_name}</p>
          <p className="text-white/30 text-[11px] mt-1">
            {[p.ministry, p.sector, p.state_raw].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className="text-white/20 text-[10px] font-mono shrink-0">{p.project_code}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
        <div>
          <p className="text-white/30 text-[10px] uppercase tracking-wider">Sanctioned</p>
          <p className="text-white/80 text-sm font-medium">{formatCrore(p.original_cost_cr)}</p>
        </div>
        <div>
          <p className="text-white/30 text-[10px] uppercase tracking-wider">Cost change</p>
          <p className="text-sm font-semibold" style={{ color: overrunColor }}>
            {formatCroreDelta(p.cost_overrun_cr)}
          </p>
        </div>
        <div>
          <p className="text-white/30 text-[10px] uppercase tracking-wider">Schedule</p>
          <p className="text-sm font-semibold" style={{ color: slipColor }}>
            {formatSlip(p.schedule_slip_months)}
          </p>
        </div>
        <div>
          <p className="text-white/30 text-[10px] uppercase tracking-wider">Progress</p>
          <p className="text-white/80 text-sm font-medium">{formatPct(p.physical_progress_pct)}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mt-2.5 text-[11px]">
        <StaleLabel months={p.months_since_last_change} />
        <span className="text-white/20">
          {p.cost_revised || p.schedule_changed
            ? `changed in the ${formatMonth(p.report_month)} report`
            : `as of ${formatMonth(p.report_month)}`}
        </span>
      </div>
    </a>
  )
}
