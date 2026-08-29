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
 *
 * THE OTHER ZERO: A SESSION THAT IS STILL SITTING.
 * 21 members have no PRS term-cumulative row, only per-session rows, and this
 * card used to fall back to activity[0] — which is the NEWEST session, usually
 * the one Parliament is sitting in, with the register barely signed. That
 * printed "0.0%" under "This term" for members whose completed sessions run 78%
 * to 100%. Row selection now lives in lib/india/activity.ts, which hands back
 * either the term row or the latest session that has ENDED; this card labels
 * the second case with that session's own dates and says the current session is
 * still sitting, so no half-finished figure is ever read as a term verdict.
 */
import { FreshnessBadge } from "@/components/shared/FreshnessBadge"
import { selectActivity } from "@/lib/india/activity"
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
  activity, benchmarks, todayIso,
}: {
  activity: MpActivity[]
  benchmarks?: { attendance_national_pct: number; questions_national: number } | null
  /** Injectable for tests; defaults to the render date. */
  todayIso?: string
}) {
  const today = todayIso ?? new Date().toISOString().slice(0, 10)
  const view = selectActivity(activity, today)

  if (view.kind === "none") {
    return (
      <div className="rounded-xl bg-white/5 p-4">
        <p className="text-white/50 text-sm">No activity record loaded for this member yet.</p>
      </div>
    )
  }

  if (view.kind === "sitting-only") {
    return (
      <div className="rounded-xl bg-white/5 p-4 space-y-2">
        <p className="text-white/50 text-sm">
          No completed session on record for this member yet.
        </p>
        <p className="text-white/35 text-[11px] leading-snug">
          Parliament is sitting now ({view.sitting.session_label ?? "current session"}) and the
          attendance register for it is still open. Kaun shows a session&apos;s figures once it has
          ended — a part-signed register is not an attendance record.
        </p>
      </div>
    )
  }

  const isTerm = view.kind === "term"
  const row = view.row
  const excluded = row.metrics_excluded

  return (
    <div className="rounded-xl bg-white/5 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-white/50 text-[10px] uppercase tracking-wider">
          {isTerm ? "This term" : "Latest completed session"}
        </p>
        <FreshnessBadge
          label={row.session_label ?? (isTerm ? "current term" : "session ended")}
          source={isTerm ? "PRS India" : "sansad.in"}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Metric
          label="Attendance"
          value={excluded ? null : formatPct(row.attendance_pct)}
          /* The PRS averages are term-wide. Printing them beside one session's
             number would invite a comparison neither figure supports. */
          benchmark={isTerm && benchmarks
            ? `national avg ${formatPct(benchmarks.attendance_national_pct)}` : undefined}
        />
        <Metric
          label="Questions asked"
          value={excluded ? null : row.questions_asked?.toLocaleString("en-IN") ?? "—"}
          benchmark={isTerm && benchmarks
            ? `national avg ${benchmarks.questions_national.toLocaleString("en-IN")}` : undefined}
        />
        <Metric label="Debates" value={excluded ? null : row.debates?.toLocaleString("en-IN") ?? "—"} />
        <Metric
          label="Private member bills"
          value={excluded ? null : row.private_member_bills?.toLocaleString("en-IN") ?? "—"}
        />
      </div>

      {excluded && row.metrics_excluded_reason && (
        <p className="text-white/35 text-[11px] leading-snug border-t border-white/5 pt-2.5">
          {row.metrics_excluded_reason}
        </p>
      )}

      {!isTerm && (
        <p className="text-white/35 text-[11px] leading-snug border-t border-white/5 pt-2.5">
          These are one session&rsquo;s figures, not the term&rsquo;s. PRS publishes no
          term-cumulative record for this member, so Kaun shows the most recent session that has
          ended rather than adding sessions together into a total PRS did not publish.
          {view.sitting && (
            <> Session {view.sitting.session_no} ({view.sitting.session_label ?? "dates not recorded"})
            {" "}is still sitting and is not shown — its register is only part-signed.</>
          )}
        </p>
      )}

      <p className="text-white/15 text-[10px]">Source: {row.data_source}</p>
    </div>
  )
}
