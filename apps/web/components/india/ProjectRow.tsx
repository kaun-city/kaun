/**
 * One central project, in list form. Used by the constituency page's state
 * project list and by the tracker table's card layout on narrow screens.
 *
 * Always a link to the project's own page — a project is an object with a
 * stable URL, not a row that only exists inside a table. next/link, because
 * that page is this same app on this same host and is prerendered: the row
 * prefetches it, so opening a project is a paint rather than a page load.
 */
import Link from "next/link"
import type { ReactNode } from "react"
import { indiaHref } from "@/lib/host-routing"
import { formatCrore, formatCroreDelta, formatMonth, formatPct, formatSlip } from "@/lib/india/format"
import { divergingColor } from "@/lib/india/viz"
import type { TrackedProject } from "@/lib/india/types"

/** Anchors the diverging ramp: ₹500 Cr over is "extreme", and so is 5 years. */
export const OVERRUN_SCALE_CR = 500
export const SLIP_SCALE_MONTHS = 60

export function StaleLabel({ months }: { months: number | null }) {
  if (months === null) {
    return <span className="text-ink/60">no change recorded in the months tracked</span>
  }
  if (months === 0) return <span className="text-ink/85">changed this month</span>
  return <span className="text-ink/75">{months} month{months === 1 ? "" : "s"} since a change</span>
}

/**
 * A signed figure beside its swatch on the diverging ramp. The number stays in
 * ink so it reads at full contrast on paper; the ramp colour rides on the
 * swatch, where it is a data encoding and not text.
 */
export function SignedValue({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="inline-block w-2 h-2 shrink-0" style={{ backgroundColor: color }} />
      {children}
    </span>
  )
}

export function ProjectRow({ p }: { p: TrackedProject }) {
  const overrunColor = divergingColor(p.cost_overrun_cr, OVERRUN_SCALE_CR)
  const slipColor = divergingColor(p.schedule_slip_months, SLIP_SCALE_MONTHS)

  return (
    <Link
      href={indiaHref(`/projects/${p.project_code}`)}
      className="block bg-paper border border-ink/15 hover:bg-paper-muted hover:border-ink/35 transition-colors p-4
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-ink text-sm font-medium leading-snug">{p.project_name}</p>
          <p className="text-ink/60 text-xs mt-1">
            {[p.ministry, p.sector, p.state_raw].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className="text-ink/60 text-[11px] font-mono shrink-0">{p.project_code}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60">Sanctioned</p>
          <p className="text-ink text-sm font-semibold font-mono tabular-nums">{formatCrore(p.original_cost_cr)}</p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60">Cost change</p>
          <p className="text-ink text-sm font-semibold font-mono tabular-nums">
            <SignedValue color={overrunColor}>{formatCroreDelta(p.cost_overrun_cr)}</SignedValue>
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60">Schedule</p>
          <p className="text-ink text-sm font-semibold font-mono tabular-nums">
            <SignedValue color={slipColor}>{formatSlip(p.schedule_slip_months)}</SignedValue>
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60">Progress</p>
          {p.physical_progress_pct == null
            ? <p className="text-ink/60 text-xs italic">not reported</p>
            : <p className="text-ink text-sm font-semibold font-mono tabular-nums">{formatPct(p.physical_progress_pct)}</p>}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mt-2.5 pt-2.5 border-t border-ink/10 text-xs">
        <StaleLabel months={p.months_since_last_change} />
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink/60 text-right">
          {p.cost_revised || p.schedule_changed
            ? `changed in the ${formatMonth(p.report_month)} report`
            : `as of ${formatMonth(p.report_month)}`}
        </span>
      </div>
    </Link>
  )
}
