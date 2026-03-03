"use client"

import { useEffect, useState } from "react"
import type { PinResult, WardProfile, RedditPost } from "@/lib/types"
import { fetchWardProfile, fetchBuzz } from "@/lib/api"

interface Props {
  result: PinResult | null
  loading: boolean
  onClose: () => void
}

type Tab = "who" | "money" | "report"

const PARTY_COLORS: Record<string, string> = {
  INC: "#19AAED",
  BJP: "#FF6B00",
  "JD(S)": "#138808",
  JDS: "#138808",
  AAP: "#0066CC",
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  OPEN:      { bg: "bg-yellow-500/20", text: "text-yellow-400", label: "Open" },
  AWARDED:   { bg: "bg-blue-500/20",   text: "text-blue-400",   label: "Awarded" },
  COMPLETED: { bg: "bg-green-500/20",  text: "text-green-400",  label: "Done" },
  CANCELLED: { bg: "bg-red-500/20",    text: "text-red-400",    label: "Cancelled" },
}

function formatLakh(val: number): string {
  if (val >= 10000) return `Rs. ${(val / 10000).toFixed(1)} Cr`
  return `Rs. ${val.toFixed(0)}L`
}

function timeAgo(utc: number): string {
  const secs = Math.floor(Date.now() / 1000) - utc
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

function PartyBadge({ party }: { party: string }) {
  const color = PARTY_COLORS[party] ?? "#888"
  return (
    <span
      className="text-xs font-semibold px-1.5 py-0.5 rounded"
      style={{ backgroundColor: color + "25", color }}
    >
      {party}
    </span>
  )
}

export default function WardCard({ result, loading, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("who")
  const [profile, setProfile] = useState<WardProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [buzz, setBuzz] = useState<RedditPost[] | null>(null)
  const [buzzLoading, setBuzzLoading] = useState(false)

  // Reset on new pin
  useEffect(() => {
    setTab("who")
    setProfile(null)
    setProfileLoading(false)
    setBuzz(null)
    setBuzzLoading(false)
  }, [result?.ward_no])

  // Load profile when WHO tab opens (or on new result)
  useEffect(() => {
    if (!result?.found || !result.ward_no) return
    if (profile !== null || profileLoading) return

    setProfileLoading(true)
    fetchWardProfile(result.ward_no, result.city_id, result.assembly_constituency ?? undefined)
      .then((p) => { setProfile(p); setProfileLoading(false) })
  }, [result, profile, profileLoading])

  // Load buzz when MONEY/community tab opens
  useEffect(() => {
    if (tab !== "money" || !result?.found || !result.ward_name) return
    if (buzz !== null || buzzLoading) return

    setBuzzLoading(true)
    fetchBuzz(result.ward_name).then((posts) => {
      setBuzz(posts)
      setBuzzLoading(false)
    })
  }, [tab, result, buzz, buzzLoading])

  if (!loading && !result) return null

  const TABS: { id: Tab; label: string }[] = [
    { id: "who",    label: "Who" },
    { id: "money",  label: "Money" },
    { id: "report", label: "Report" },
  ]

  return (
    <div className="
      fixed bottom-0 left-0 right-0 z-[1000]
      md:bottom-6 md:right-6 md:left-auto md:w-[26rem]
      bg-[#111111] border border-white/10 rounded-t-2xl md:rounded-2xl
      shadow-2xl overflow-hidden animate-slide-up
    ">
      {/* Mobile drag handle */}
      <div className="flex justify-center pt-3 pb-1 md:hidden">
        <div className="w-10 h-1 rounded-full bg-white/20" />
      </div>

      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-white/10">
        {loading ? (
          <div className="space-y-2">
            <div className="h-4 w-40 bg-white/10 rounded animate-pulse" />
            <div className="h-3 w-24 bg-white/5 rounded animate-pulse" />
          </div>
        ) : result?.found ? (
          <div>
            <h2 className="text-white font-semibold text-base leading-snug">{result.ward_name}</h2>
            <p className="text-white/40 text-xs mt-0.5">
              Ward {result.ward_no}
              {result.zone ? ` · ${result.zone}` : ""}
              {result.assembly_constituency ? ` · ${result.assembly_constituency}` : ""}
            </p>
          </div>
        ) : (
          <div>
            <h2 className="text-white/60 font-medium text-base">Outside city boundary</h2>
            <p className="text-white/30 text-xs mt-0.5">No ward found at this location</p>
          </div>
        )}
        <button
          onClick={onClose}
          aria-label="Close"
          className="ml-4 mt-0.5 text-white/30 hover:text-white/70 transition-colors text-lg"
        >
          &times;
        </button>
      </div>

      {/* Tabs */}
      {!loading && result?.found && (
        <>
          <div className="flex border-b border-white/10">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors
                  ${tab === t.id
                    ? "text-[#FF9933] border-b-2 border-[#FF9933]"
                    : "text-white/30 hover:text-white/60"
                  }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ══ WHO TAB ══ */}
          {tab === "who" && (
            <div className="px-5 py-4 max-h-80 overflow-y-auto space-y-4">

              {/* Governance alert — no elected corporator */}
              {profile?.governance_alert && (
                <div className="flex gap-2.5 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                  <span className="text-yellow-400 text-base mt-0.5">!</span>
                  <div>
                    <p className="text-yellow-400 text-xs font-semibold">{profile.governance_alert.title}</p>
                    <p className="text-white/40 text-xs leading-snug mt-0.5">{profile.governance_alert.body}</p>
                  </div>
                </div>
              )}

              {profileLoading && !profile && (
                <div className="space-y-3">
                  {[1,2].map(i => (
                    <div key={i} className="p-3 rounded-xl bg-white/5 space-y-2">
                      <div className="h-3 w-32 bg-white/10 rounded animate-pulse" />
                      <div className="h-3 w-24 bg-white/5 rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              )}

              {/* Elected reps */}
              {profile && profile.elected_reps.length > 0 && (
                <div className="space-y-2">
                  <p className="text-white/30 text-xs uppercase tracking-wider">Elected Representatives</p>
                  {profile.elected_reps.map((rep) => (
                    <div key={rep.id} className="p-3 rounded-xl bg-white/5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white/40 text-xs">{rep.role}</span>
                            {rep.party && <PartyBadge party={rep.party} />}
                          </div>
                          <p className="text-white font-semibold text-sm mt-0.5">{rep.name}</p>
                          <p className="text-white/30 text-xs">{rep.constituency} constituency</p>
                          {rep.elected_since && (
                            <p className="text-white/25 text-xs">Elected {rep.elected_since}</p>
                          )}
                          {rep.notes && (
                            <p className="text-white/30 text-xs mt-1 italic">{rep.notes}</p>
                          )}
                        </div>
                        {rep.profile_url && (
                          <a
                            href={rep.profile_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#FF9933]/60 hover:text-[#FF9933] text-xs transition-colors whitespace-nowrap mt-1"
                          >
                            Profile &rarr;
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Officers */}
              <div className="space-y-2">
                <p className="text-white/30 text-xs uppercase tracking-wider">Ward Officers (GBA)</p>
                {profile && profile.officers.length > 0 ? (
                  profile.officers.map((o) => (
                    <div key={o.id} className="p-3 rounded-xl bg-white/5">
                      <p className="text-white/40 text-xs">{o.role} &middot; {o.department}</p>
                      <p className="text-white text-sm font-medium">{o.name ?? "Name not disclosed"}</p>
                      {o.phone && <p className="text-white/40 text-xs">{o.phone}</p>}
                      {o.source && <p className="text-white/20 text-xs">Source: {o.source}</p>}
                    </div>
                  ))
                ) : (
                  <div className="p-3 rounded-xl bg-white/5">
                    <p className="text-white/50 text-sm">Officer details not yet available</p>
                    <p className="text-white/30 text-xs mt-1">
                      File an RTI to get your ward officer&apos;s name and contact.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══ MONEY TAB ══ */}
          {tab === "money" && (
            <div className="px-5 py-4 max-h-80 overflow-y-auto">
              {profileLoading && !profile ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => (
                    <div key={i} className="space-y-1.5">
                      <div className="h-3 w-full bg-white/10 rounded animate-pulse" />
                      <div className="h-3 w-3/4 bg-white/5 rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : profile && profile.tenders.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-white/30 text-xs uppercase tracking-wider">
                      {profile.tender_count} tender{profile.tender_count !== 1 ? "s" : ""}
                    </p>
                    <p className="text-[#FF9933] text-xs font-semibold">
                      {formatLakh(profile.tender_total_lakh)} total
                    </p>
                  </div>
                  {profile.tenders.map((t) => {
                    const st = STATUS_STYLES[t.status] ?? STATUS_STYLES.OPEN
                    return (
                      <div key={t.id} className="p-3 rounded-xl bg-white/5">
                        <p className="text-white text-sm leading-snug line-clamp-2">{t.title}</p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${st.bg} ${st.text}`}>
                            {st.label}
                          </span>
                          {t.value_lakh != null && (
                            <span className="text-[#FF9933] text-xs font-semibold">
                              {formatLakh(t.value_lakh)}
                            </span>
                          )}
                          {t.issued_date && (
                            <span className="text-white/30 text-xs">{t.issued_date}</span>
                          )}
                        </div>
                        {t.contractor_name && (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            {t.contractor_blacklisted && (
                              <span className="text-red-400 text-xs font-bold">FLAGGED</span>
                            )}
                            <p className={`text-xs ${t.contractor_blacklisted ? "text-red-300" : "text-white/40"}`}>
                              {t.contractor_name}
                            </p>
                          </div>
                        )}
                        {t.source_url && (
                          <a
                            href={t.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#FF9933]/50 hover:text-[#FF9933] text-xs transition-colors mt-1 inline-block"
                          >
                            View on KPPP &rarr;
                          </a>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-white/30 text-sm">No tenders found for this ward</p>
                  <p className="text-white/20 text-xs mt-1">
                    File an RTI to get the complete works register.
                  </p>
                </div>
              )}

              {/* Reddit chatter below tenders */}
              {buzz && buzz.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
                  <p className="text-white/30 text-xs uppercase tracking-wider mb-2">r/bangalore chatter</p>
                  {buzz.map((post, i) => (
                    <a key={i} href={post.url} target="_blank" rel="noopener noreferrer" className="block group">
                      <div className="py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                        <p className="text-white text-xs leading-snug group-hover:text-[#FF9933] transition-colors line-clamp-2">
                          {post.title}
                        </p>
                        <p className="text-white/25 text-xs mt-1">
                          +{post.score} &middot; {post.num_comments} comments &middot; {timeAgo(post.created_utc)}
                        </p>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══ REPORT TAB ══ */}
          {tab === "report" && (
            <div className="px-5 py-4 max-h-80 overflow-y-auto space-y-3">
              {/* RTI — hero action */}
              <button
                onClick={() => alert("RTI Generator coming soon")}
                className="w-full py-3.5 rounded-xl bg-[#FF9933]/15 border border-[#FF9933]/40 text-[#FF9933] text-sm font-semibold hover:bg-[#FF9933]/25 transition-colors"
              >
                Generate RTI Application
              </button>
              <p className="text-white/25 text-xs text-center -mt-1">
                Right to Information Act, 2005 &middot; Rs. 10 fee &middot; 30-day response
              </p>

              <div className="pt-2 space-y-2">
                <p className="text-white/30 text-xs uppercase tracking-wider">File a Complaint</p>

                <a
                  href="https://sampark.karnataka.gov.in"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <div>
                    <p className="text-white text-sm font-medium">Sampark Karnataka</p>
                    <p className="text-white/30 text-xs">Universal grievance portal &middot; all agencies</p>
                  </div>
                  <span className="text-[#FF9933] text-sm font-mono font-semibold">1902</span>
                </a>

                {result.agencies
                  .filter((a) => a.complaint_url)
                  .map((agency) => (
                    <a
                      key={agency.short}
                      href={agency.complaint_url!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
                    >
                      <div>
                        <p className="text-white text-sm font-medium">{agency.short}</p>
                        <p className="text-white/30 text-xs">{agency.name}</p>
                      </div>
                      <span className="text-white/30 text-xs">&rarr;</span>
                    </a>
                  ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Outside boundary fallback */}
      {!loading && !result?.found && (
        <div className="px-5 py-6 text-center">
          <p className="text-white/30 text-sm">Try pinning a location within Bengaluru.</p>
        </div>
      )}
    </div>
  )
}
