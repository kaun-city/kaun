/**
 * A project's month-by-month history.
 *
 * This is the reason in_central_project_snapshots stores one immutable row per
 * project per report month instead of overwriting a "current" row. A revision
 * is only visible against what it replaced: "revised for the third time,
 * +₹4,290 crore, now 66 months later than first promised" is a sentence you can
 * only write if you kept the earlier months.
 *
 * Each row states what moved that month and what it moved from. Months where
 * nothing moved are shown too, greyed — a project sitting untouched for a year
 * is itself the finding, and hiding those rows would hide it.
 */
import { formatCrore, formatMonth, formatPct } from "@/lib/india/format"
import { RAMP_DIVERGING } from "@/lib/india/viz"
import type { CentralProjectChange } from "@/lib/india/types"

export function ProjectTimeline({ history }: { history: CentralProjectChange[] }) {
  if (history.length === 0) {
    return (
      <div className="rounded-xl bg-white/5 p-4">
        <p className="text-white/50 text-sm">No monthly reports recorded for this project yet.</p>
      </div>
    )
  }

  // Newest first: what changed most recently is what a reader came for.
  const rows = [...history].reverse()

  return (
    <div className="rounded-xl bg-white/5 overflow-hidden">
      <div className="divide-y divide-white/5">
        {rows.map((h, i) => {
          const moved = Boolean(h.cost_revised || h.schedule_changed)
          const first = i === rows.length - 1
          return (
            <div key={h.report_month} className="px-4 py-3 flex gap-3">
              <div className="pt-1 shrink-0">
                <span
                  className="block w-2 h-2 rounded-full"
                  style={{ backgroundColor: moved ? RAMP_DIVERGING[3] : "#3a3a3a" }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className={`text-xs font-medium ${moved ? "text-white/85" : "text-white/40"}`}>
                    {formatMonth(h.report_month)} report
                  </p>
                  <p className="text-white/30 text-[11px] shrink-0">
                    {formatCrore(h.revised_cost_cr)} · {formatPct(h.physical_progress_pct)} complete
                  </p>
                </div>

                {h.cost_revised && (
                  <p className="text-white/60 text-[11px] mt-1">
                    Cost revised from {formatCrore(h.prev_revised_cost_cr)} to {formatCrore(h.revised_cost_cr)}
                  </p>
                )}
                {h.schedule_changed && (
                  <p className="text-white/60 text-[11px] mt-1">
                    Completion moved from {formatMonth(h.prev_revised_doc_month)} to {formatMonth(h.revised_doc_month)}
                  </p>
                )}
                {!moved && (
                  <p className="text-white/25 text-[11px] mt-1">
                    {first
                      ? "First month in Kaun's record — nothing to compare against."
                      : "No change to cost or completion date."}
                  </p>
                )}

                {h.cumulative_expenditure_cr !== null && (
                  <p className="text-white/25 text-[11px] mt-1">
                    Spent to date: {formatCrore(h.cumulative_expenditure_cr)}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
