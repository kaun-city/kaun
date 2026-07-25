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
      <div className="rounded-xl bg-white/5 p-4">
        <p className="text-white/50 text-sm">No sitting MP on record for this seat.</p>
        <p className="text-white/25 text-xs mt-1 leading-snug">
          A seat reads as vacant here when its member has died or resigned and the bypoll result is not
          yet in the roster. Three seats were in that state when the roster was last pulled.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-white/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white/40 text-xs">Member of Parliament</span>
            {mp.party_abbr && <PartyBadge party={mp.party_abbr} />}
          </div>
          <p className="text-white font-semibold text-base mt-1">{mp.name}</p>
          <p className="text-white/30 text-xs mt-0.5">
            {mp.no_of_terms ? `${mp.no_of_terms} term${mp.no_of_terms === 1 ? "" : "s"}` : null}
            {mp.no_of_terms && mp.age ? " · " : ""}
            {mp.age ? `age ${mp.age}` : null}
            {mp.qualification ? ` · ${mp.qualification}` : null}
          </p>
          {mp.is_minister && (
            <p className="text-white/40 text-xs mt-1.5 leading-snug">
              Holds ministerial office.{mp.minister_note ? ` ${mp.minister_note}` : ""}
            </p>
          )}
        </div>
        {mp.profile_url && (
          <a href={mp.profile_url} target="_blank" rel="noopener noreferrer"
            className="text-[#FF9933]/60 hover:text-[#FF9933] text-xs transition-colors whitespace-nowrap mt-1">
            sansad.in &rarr;
          </a>
        )}
      </div>

      {affidavit ? (
        <>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="space-y-0.5">
              <p className="text-white/30 text-[10px] uppercase tracking-wider">Declared assets</p>
              <p className="text-white text-sm font-semibold">{formatRupees(affidavit.total_assets_inr)}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-white/30 text-[10px] uppercase tracking-wider">Declared liabilities</p>
              <p className="text-white text-sm font-semibold">{formatRupees(affidavit.liabilities_inr)}</p>
            </div>
            <div className="space-y-0.5 col-span-2">
              <p className="text-white/30 text-[10px] uppercase tracking-wider">Education</p>
              <p className="text-white/70 text-xs">{affidavit.education_category ?? "Not stated"}</p>
              {affidavit.education_detail && (
                <p className="text-white/30 text-[11px] leading-snug">{affidavit.education_detail}</p>
              )}
            </div>
          </div>

          <p className="text-white/20 text-[10px] italic">
            Assets and liabilities: self-declared in the EC nomination affidavit for {affidavit.election}.
          </p>

          {/* Criminal cases — the city's treatment, nothing louder. */}
          {affidavit.criminal_cases === null ? (
            <div className="flex flex-col gap-1 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10">
              <span className="text-white/40 text-xs">Criminal cases not recorded</span>
              <span className="text-white/25 text-[10px]">
                The affidavit page could not be read in full. This is not a declaration of zero.
              </span>
            </div>
          ) : affidavit.criminal_cases > 0 ? (
            <div className="flex flex-col gap-1 px-2 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
              <span className="text-red-400 text-xs font-bold">
                {affidavit.criminal_cases} criminal case{affidavit.criminal_cases !== 1 ? "s" : ""} declared
              </span>
              <span className="text-white/25 text-[10px]">
                Self-declared in Election Commission nomination affidavit
                {affidavit.profile_url && (
                  <> · <a href={affidavit.profile_url} target="_blank" rel="noopener noreferrer"
                    className="text-white/40 hover:text-white/70 underline">see the declaration</a></>
                )}
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-1 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10">
              <span className="text-white/60 text-xs">No criminal cases declared</span>
              <span className="text-white/25 text-[10px]">
                Self-declared in Election Commission nomination affidavit
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2.5">
          <p className="text-white/50 text-xs">No affidavit matched to this seat yet</p>
          <p className="text-white/25 text-[11px] mt-1 leading-snug">
            MyNeta numbers its constituencies its own way and shares no identifier with the parliamentary
            roster, so an affidavit is only published here once its seat is confirmed and reviewed. Until
            then Kaun shows nothing rather than a guess.
          </p>
        </div>
      )}
    </div>
  )
}
