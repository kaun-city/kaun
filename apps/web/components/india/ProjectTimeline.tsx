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
import { formatCrore, formatMonth, formatProgress } from "@/lib/india/format"
import type { CentralProjectChange } from "@/lib/india/types"

export function ProjectTimeline({ history }: { history: CentralProjectChange[] }) {
  if (history.length === 0) {
    return (
      <div className="bg-paper border border-ink/15 p-4">
        <p className="text-ink/75 text-sm">No monthly reports recorded for this project yet.</p>
      </div>
    )
  }

  // Newest first: what changed most recently is what a reader came for.
  const rows = [...history].reverse()

  return (
    <div className="bg-paper border border-ink/15 px-4">
      {/* The rail: one hairline down the months, a mark on it for each report.
          Solid where cost or completion moved, hollow where nothing did. */}
      <div className="ml-1 border-l border-ink/20 divide-y divide-ink/10">
        {rows.map((h, i) => {
          const moved = Boolean(h.cost_revised || h.schedule_changed)
          const first = i === rows.length - 1
          return (
            <div key={h.report_month} className="relative pl-4 py-3">
              <span
                aria-hidden="true"
                className={`absolute -left-[4.5px] top-4 block w-2 h-2 rounded-full ${
                  moved ? "bg-ink" : "bg-paper border border-ink/40"}`}
              />
              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <p className={`font-mono text-xs ${moved ? "text-ink font-semibold" : "text-ink/60"}`}>
                    {formatMonth(h.report_month)} report
                  </p>
                  <p className="text-ink/70 font-mono tabular-nums text-[11px] shrink-0">
                    {h.revised_cost_cr === null ? "cost not reported" : formatCrore(h.revised_cost_cr)}
                    {" · "}{formatProgress(h.physical_progress_pct)}
                  </p>
                </div>

                {h.cost_revised && (
                  <p className="text-ink/85 text-xs mt-1">
                    Cost revised from {formatCrore(h.prev_revised_cost_cr)} to {formatCrore(h.revised_cost_cr)}
                  </p>
                )}
                {h.schedule_changed && (
                  <p className="text-ink/85 text-xs mt-1">
                    Completion moved from {formatMonth(h.prev_revised_doc_month)} to {formatMonth(h.revised_doc_month)}
                  </p>
                )}
                {!moved && (
                  <p className="text-ink/60 text-xs mt-1">
                    {first
                      ? "First month in Kaun's record — nothing to compare against."
                      : "No change to cost or completion date."}
                  </p>
                )}

                {h.cumulative_expenditure_cr !== null && (
                  <p className="text-ink/60 text-xs mt-1">
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
