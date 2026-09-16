/**
 * MPLADS — the ₹5 crore a year each MP can direct at works in their seat.
 *
 * The schema lets eSAKSHI (official, aggregate only) and Empowered Indian
 * (unofficial, richer) rows coexist per MP, because they disagree and a reader
 * is entitled to know which one they are looking at. So each row renders with
 * its source named on the row, never merged into one blended figure.
 */
import { FreshnessBadge } from "@/components/shared/FreshnessBadge"
import { formatPct, formatRupees } from "@/lib/india/format"
import { barFraction } from "@/lib/india/viz"
import type { MpladsSummary } from "@/lib/india/types"

const SOURCE_LABEL: Record<string, string> = {
  esakshi: "eSAKSHI (official)",
  empoweredindian: "Empowered Indian (unofficial)",
}

export function MpladsCard({ rows }: { rows: MpladsSummary[] }) {
  if (rows.length === 0) {
    return (
      <div className="bg-paper border border-ink/15 p-4">
        <p className="text-ink/75 text-sm">No MPLADS figures loaded for this member yet.</p>
        <p className="text-ink/60 text-xs mt-1 leading-snug">
          eSAKSHI publishes allocation and expenditure per MP. Until that pipeline runs, this stays
          empty rather than showing an estimate.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {rows.map(r => {
        const used = barFraction(r.utilization_pct, 100)
        return (
          <div key={r.id} className="bg-paper border border-ink/15 p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink/75">
                {SOURCE_LABEL[r.source] ?? r.source}
              </p>
              <FreshnessBadge label={r.term_label} source="MPLADS" />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-0.5">
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60">Allocated</p>
                <p className="text-ink text-sm font-semibold font-mono tabular-nums">{formatRupees(r.allocated_inr)}</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60">Spent</p>
                <p className="text-ink text-sm font-semibold font-mono tabular-nums">{formatRupees(r.expenditure_inr)}</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60">Unspent</p>
                <p className="text-ink text-sm font-semibold font-mono tabular-nums">{formatRupees(r.unspent_inr)}</p>
              </div>
            </div>

            {used !== null && (
              <div className="space-y-1">
                <div className="w-full h-1.5 bg-ink/10 overflow-hidden">
                  <div className="h-full bg-ink/70" style={{ width: `${used * 100}%` }} />
                </div>
                <p className="text-ink/70 text-xs">{formatPct(r.utilization_pct)} of the allocation spent</p>
              </div>
            )}

            {(r.works_recommended !== null || r.works_completed !== null) && (
              <p className="text-ink/70 text-xs">
                {r.works_recommended?.toLocaleString("en-IN") ?? "—"} works recommended ·{" "}
                {r.works_sanctioned?.toLocaleString("en-IN") ?? "—"} sanctioned ·{" "}
                {r.works_completed?.toLocaleString("en-IN") ?? "—"} completed
              </p>
            )}

            <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink/60">Source: {r.data_source}</p>
          </div>
        )
      })}
    </div>
  )
}
