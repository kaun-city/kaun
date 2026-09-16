/**
 * What the member has declared, election by election.
 *
 * MyNeta's "Other Elections" block is a genuine time series — the same person's
 * own declarations across every nomination they have filed — and it is the one
 * place a reader can see a trajectory rather than a snapshot. It is stored
 * verbatim as jsonb (in_mp_affidavits.declared_assets_history) precisely so it
 * can be shown like this.
 *
 * Presented as declarations, not as a finding. No growth percentage is computed
 * and nothing is flagged: the numbers are years apart, cover different offices,
 * and are not inflation-adjusted. The reader gets the sequence and the source.
 */
import { formatRupees } from "@/lib/india/format"
import type { MpAffidavit } from "@/lib/india/types"

export function AffidavitTimeline({ affidavit }: { affidavit: MpAffidavit }) {
  const history = affidavit.declared_assets_history ?? []
  const rows = [
    {
      election: affidavit.election.replace(/^LokSabha/, "Lok Sabha "),
      assets: affidavit.total_assets_inr,
      cases: affidavit.criminal_cases,
      current: true,
    },
    ...history.map(h => ({
      election: h.election,
      assets: h.declared_assets_inr,
      cases: h.declared_cases,
      current: false,
    })),
  ]
  if (rows.length < 2) return null

  const max = Math.max(...rows.map(r => r.assets ?? 0), 1)

  return (
    <div className="bg-paper border border-ink/15 p-4 space-y-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink/75">Declarations over time</p>
      <div className="ml-1 border-l border-ink/20 pl-3 space-y-2.5">
        {rows.map(r => {
          const share = r.assets !== null ? Math.max(0.02, r.assets / max) : 0
          return (
            <div key={r.election} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className={`font-mono text-xs ${r.current ? "text-ink font-semibold" : "text-ink/70"}`}>
                  {r.election}{r.current ? " · current" : ""}
                </span>
                <span className="text-ink text-xs font-semibold font-mono tabular-nums shrink-0">{formatRupees(r.assets)}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-ink/10 overflow-hidden">
                  <div
                    className={`h-full ${r.current ? "bg-ink/70" : "bg-ink/35"}`}
                    style={{ width: `${share * 100}%` }}
                  />
                </div>
                <span className="text-ink/60 text-[11px] shrink-0 w-28 text-right">
                  {r.cases === null
                    ? "cases not recorded"
                    : `${r.cases} case${r.cases === 1 ? "" : "s"} declared`}
                </span>
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-ink/60 text-xs leading-snug">
        Each row is a separate nomination affidavit filed by the same person. Amounts are as declared,
        not adjusted for inflation, and the elections are for different offices in some years.
      </p>
    </div>
  )
}
