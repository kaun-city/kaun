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
import { barFraction, KAUN_SAFFRON } from "@/lib/india/viz"
import type { MpladsSummary } from "@/lib/india/types"

const SOURCE_LABEL: Record<string, string> = {
  esakshi: "eSAKSHI (official)",
  empoweredindian: "Empowered Indian (unofficial)",
}

export function MpladsCard({ rows }: { rows: MpladsSummary[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl bg-white/5 p-4">
        <p className="text-white/50 text-sm">No MPLADS figures loaded for this member yet.</p>
        <p className="text-white/25 text-xs mt-1 leading-snug">
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
          <div key={r.id} className="rounded-xl bg-white/5 p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-white/50 text-[10px] uppercase tracking-wider">
                {SOURCE_LABEL[r.source] ?? r.source}
              </p>
              <FreshnessBadge label={r.term_label} source="MPLADS" />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-0.5">
                <p className="text-white/30 text-[10px] uppercase tracking-wider">Allocated</p>
                <p className="text-white text-sm font-semibold">{formatRupees(r.allocated_inr)}</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-white/30 text-[10px] uppercase tracking-wider">Spent</p>
                <p className="text-white text-sm font-semibold">{formatRupees(r.expenditure_inr)}</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-white/30 text-[10px] uppercase tracking-wider">Unspent</p>
                <p className="text-white text-sm font-semibold">{formatRupees(r.unspent_inr)}</p>
              </div>
            </div>

            {used !== null && (
              <div className="space-y-1">
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full rounded-full"
                    style={{ width: `${used * 100}%`, backgroundColor: KAUN_SAFFRON }} />
                </div>
                <p className="text-white/40 text-[11px]">{formatPct(r.utilization_pct)} of the allocation spent</p>
              </div>
            )}

            {(r.works_recommended !== null || r.works_completed !== null) && (
              <p className="text-white/40 text-[11px]">
                {r.works_recommended?.toLocaleString("en-IN") ?? "—"} works recommended ·{" "}
                {r.works_sanctioned?.toLocaleString("en-IN") ?? "—"} sanctioned ·{" "}
                {r.works_completed?.toLocaleString("en-IN") ?? "—"} completed
              </p>
            )}

            <p className="text-white/15 text-[10px]">Source: {r.data_source}</p>
          </div>
        )
      })}
    </div>
  )
}
