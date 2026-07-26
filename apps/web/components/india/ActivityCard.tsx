/**
 * Parliamentary activity.
 *
 * THE MINISTER RULE, RENDERED HONESTLY.
 * Ministers and the Speaker do not sign the attendance register, do not ask
 * questions and do not introduce private member bills. sansad.in reports
 * signedDaysCount: 0 for them; PRS says it in words. Both are describing how
 * Parliament's paper trail works, not a gap in the data — and a "worst
 * attendance" list built on those zeros would be defamatory nonsense.
 *
 * The schema refuses to store the zero (in_mp_activity_excluded_is_null_not_zero
 * requires NULL plus a reason), and this component refuses to render one. The
 * copy matches the city app's MLA scorecard exactly — kaun.city already prints
 * "N/A (Minister)" in this situation, so the national layer prints the same
 * words in the same muted italic, with PRS's own sentence underneath.
 */
import { FreshnessBadge } from "@/components/shared/FreshnessBadge"
import { formatPct } from "@/lib/india/format"
import type { MpActivity } from "@/lib/india/types"

function Metric({
  label, value, benchmark,
}: { label: string; value: string | null; benchmark?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-white/30 text-[10px] uppercase tracking-wider">{label}</p>
      {value === null
        ? <p className="text-white/20 text-xs italic">N/A (Minister)</p>
        : <p className="text-white text-lg font-semibold">{value}</p>}
      {value !== null && benchmark && <p className="text-white/25 text-[10px]">{benchmark}</p>}
    </div>
  )
}

export function ActivityCard({
  activity, benchmarks,
}: {
  activity: MpActivity[]
  benchmarks?: { attendance_national_pct: number; questions_national: number } | null
}) {
  const term = activity.find(a => a.period_kind === "term") ?? activity[0] ?? null

  if (!term) {
    return (
      <div className="rounded-xl bg-white/5 p-4">
        <p className="text-white/50 text-sm">No activity record loaded for this member yet.</p>
      </div>
    )
  }

  const excluded = term.metrics_excluded

  return (
    <div className="rounded-xl bg-white/5 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-white/50 text-[10px] uppercase tracking-wider">This term</p>
        <FreshnessBadge label={term.session_label ?? "current term"} source="PRS India" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Metric
          label="Attendance"
          value={excluded ? null : formatPct(term.attendance_pct)}
          benchmark={benchmarks ? `national avg ${formatPct(benchmarks.attendance_national_pct)}` : undefined}
        />
        <Metric
          label="Questions asked"
          value={excluded ? null : term.questions_asked?.toLocaleString("en-IN") ?? "—"}
          benchmark={benchmarks ? `national avg ${benchmarks.questions_national.toLocaleString("en-IN")}` : undefined}
        />
        <Metric label="Debates" value={excluded ? null : term.debates?.toLocaleString("en-IN") ?? "—"} />
        <Metric
          label="Private member bills"
          value={excluded ? null : term.private_member_bills?.toLocaleString("en-IN") ?? "—"}
        />
      </div>

      {excluded && term.metrics_excluded_reason && (
        <p className="text-white/35 text-[11px] leading-snug border-t border-white/5 pt-2.5">
          {term.metrics_excluded_reason}
        </p>
      )}

      <p className="text-white/15 text-[10px]">Source: {term.data_source}</p>
    </div>
  )
}
