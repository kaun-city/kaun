/**
 * The MP card — who holds this seat, and what their own affidavit says.
 *
 * FIELD SCOPE IS COPIED FROM THE MLA CARD ON kaun.city, deliberately: declared
 * criminal cases, declared assets, education, party, term. Nothing extra is
 * introduced at national scale that the city surface has not already been
 * publishing about MLAs.
 *
 * THE CRIMINAL-CASE BLOCK IS THE CITY'S, VERBATIM IN TONE.
 * components/tabs/WhoTab.tsx renders exactly:
 *     "{n} criminal case{s} declared"
 *     "Self-declared in Election Commission nomination affidavit"
 * in a small red-tinted block. This reproduces that — same words, same weight,
 * no larger type, no icon, no adjective. A count and where it came from. The
 * one addition is a link to the affidavit itself, which strengthens the claim
 * rather than amplifying it.
 *
 * NO COMPOSITE SCORE. The ward pages compute an accountability grade out of
 * 100. That is not ported here: reducing a named national politician to one
 * number is an editorial position, and this surface takes none. Components,
 * each with its source, and the reader draws the conclusion.
 */
import { PartyBadge } from "@/components/shared/PartyBadge"
import { formatRupees } from "@/lib/india/format"
import type { Mp, MpAffidavit } from "@/lib/india/types"

export function MpCard({ mp, affidavit }: { mp: Mp | null; affidavit: MpAffidavit | null }) {
  if (!mp) {
    return (
      <div className="bg-paper border border-ink/15 p-4">
        <p className="text-ink/75 text-sm">No sitting MP on record for this seat.</p>
        <p className="text-ink/60 text-xs mt-1 leading-snug">
          A seat reads as vacant here when its member has died or resigned and the bypoll result is not
          yet in the roster. Three seats were in that state when the roster was last pulled.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-paper border border-ink/15 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60">Member of Parliament</span>
            {mp.party_abbr && <PartyBadge party={mp.party_abbr} />}
          </div>
          <p className="text-ink font-semibold text-base mt-1">{mp.name}</p>
          <p className="text-ink/70 text-xs mt-0.5">
            {mp.no_of_terms ? `${mp.no_of_terms} term${mp.no_of_terms === 1 ? "" : "s"}` : null}
            {mp.no_of_terms && mp.age ? " · " : ""}
            {mp.age ? `age ${mp.age}` : null}
            {mp.qualification ? ` · ${mp.qualification}` : null}
          </p>
          {mp.is_minister && (
            <p className="text-ink/75 text-xs mt-1.5 leading-snug">
              Holds ministerial office.{mp.minister_note ? ` ${mp.minister_note}` : ""}
            </p>
          )}
        </div>
        {mp.profile_url && (
          <a href={mp.profile_url} target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center -mt-2.5 -mr-2 px-2 shrink-0
              text-accent text-xs underline decoration-accent/40 underline-offset-2 hover:decoration-accent
              transition-colors whitespace-nowrap">
            sansad.in &rarr;
          </a>
        )}
      </div>

      {affidavit ? (
        <>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="space-y-0.5">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60">Declared assets</p>
              <p className="text-ink text-sm font-semibold font-mono tabular-nums">{formatRupees(affidavit.total_assets_inr)}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60">Declared liabilities</p>
              <p className="text-ink text-sm font-semibold font-mono tabular-nums">{formatRupees(affidavit.liabilities_inr)}</p>
            </div>
            <div className="space-y-0.5 col-span-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60">Education</p>
              <p className="text-ink/85 text-sm">{affidavit.education_category ?? "Not stated"}</p>
              {affidavit.education_detail && (
                <p className="text-ink/60 text-xs leading-snug">{affidavit.education_detail}</p>
              )}
            </div>
          </div>

          <p className="text-ink/60 text-xs">
            Assets and liabilities: self-declared in the EC nomination affidavit for {affidavit.election}.
          </p>

          {/* Criminal cases — the city's treatment, nothing louder. */}
          {affidavit.criminal_cases === null ? (
            <div className="flex flex-col gap-1 px-2.5 py-2 bg-paper-muted border border-ink/15">
              <span className="text-ink/75 text-xs">Criminal cases not recorded</span>
              <span className="text-ink/60 text-xs">
                The affidavit page could not be read in full. This is not a declaration of zero.
              </span>
            </div>
          ) : affidavit.criminal_cases > 0 ? (
            <div className="flex flex-col gap-1 px-2.5 py-2 bg-danger/[0.07] border border-danger/35">
              <span className="text-danger text-xs font-bold">
                {affidavit.criminal_cases} criminal case{affidavit.criminal_cases !== 1 ? "s" : ""} declared
              </span>
              <span className="text-ink/70 text-xs">
                Self-declared in Election Commission nomination affidavit
                {affidavit.profile_url && (
                  <> · <a href={affidavit.profile_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">see the declaration</a></>
                )}
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-1 px-2.5 py-2 bg-paper-muted border border-ink/15">
              <span className="text-ink/85 text-xs">No criminal cases declared</span>
              <span className="text-ink/60 text-xs">
                Self-declared in Election Commission nomination affidavit
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="bg-paper-muted border border-ink/15 px-3 py-2.5">
          <p className="text-ink/75 text-xs">No affidavit matched to this seat yet</p>
          <p className="text-ink/60 text-xs mt-1 leading-snug">
            MyNeta numbers its constituencies its own way and shares no identifier with the parliamentary
            roster, so an affidavit is only published here once its seat is confirmed and reviewed. Until
            then Kaun shows nothing rather than a guess.
          </p>
        </div>
      )}
    </div>
  )
}
