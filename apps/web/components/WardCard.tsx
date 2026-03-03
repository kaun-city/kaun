"use client"

import { useEffect, useRef, useState } from "react"
import type { BudgetSummary, CommunityFact, Department, PinResult, PropertyTaxData, RedditPost, WardProfile, WardStats } from "@/lib/types"
import { fetchWardProfile, fetchBuzz, fetchBudgetSummary, fetchDepartments, fetchPropertyTax, fetchWardStats, submitFact, voteFact } from "@/lib/api"

interface Props {
  result: PinResult | null
  loading: boolean
  onClose: () => void
}

type Tab = "who" | "money" | "stats" | "report"

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

const TRUST_STYLES: Record<string, { bg: string; text: string; border: string; label: string; icon: string }> = {
  official:           { bg: "bg-green-500/10",  text: "text-green-400",  border: "border-green-500/20", label: "Govt source",          icon: "✓" },
  rti:                { bg: "bg-blue-500/10",   text: "text-blue-400",   border: "border-blue-500/20",  label: "RTI sourced",          icon: "📄" },
  community_verified: { bg: "bg-amber-500/10",  text: "text-amber-400",  border: "border-amber-500/20", label: "Community verified",   icon: "✓" },
  unverified:         { bg: "bg-white/5",       text: "text-white/30",   border: "border-white/10",     label: "Unverified",           icon: "?" },
  disputed:           { bg: "bg-red-500/10",    text: "text-red-400",    border: "border-red-500/20",   label: "Disputed",             icon: "!" },
}

const OFFICER_SUBJECTS: Record<string, string> = {
  gba_ward_officer:   "Ward Officer (GBA)",
  gba_ae_works:       "AE – Works (GBA)",
  gba_ae_health:      "AE – Health (GBA)",
  bwssb_ae:           "AE (BWSSB)",
  bescom_ae:          "AE (BESCOM)",
}

// Stable anonymous token for this browser session
function getVoterToken(): string {
  if (typeof window === "undefined") return "ssr"
  let token = sessionStorage.getItem("kaun_voter_token")
  if (!token) {
    token = "v_" + Math.random().toString(36).slice(2) + Date.now().toString(36)
    sessionStorage.setItem("kaun_voter_token", token)
  }
  return token
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
    <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: color + "25", color }}>
      {party}
    </span>
  )
}

function TrustBadge({ level }: { level: string }) {
  const s = TRUST_STYLES[level] ?? TRUST_STYLES.unverified
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${s.bg} ${s.text} ${s.border}`}>
      {s.icon} {s.label}
    </span>
  )
}

// Group community facts by subject, then by field, picking the best (most corroborated) per field
function groupOfficerFacts(facts: CommunityFact[]): Record<string, Record<string, CommunityFact>> {
  const result: Record<string, Record<string, CommunityFact>> = {}
  for (const f of facts) {
    if (f.category !== "officer") continue
    if (!result[f.subject]) result[f.subject] = {}
    const existing = result[f.subject][f.field]
    if (!existing || f.corroboration_count > existing.corroboration_count) {
      result[f.subject][f.field] = f
    }
  }
  return result
}

// ── Community fact card with corroborate button
function FactCard({
  fact,
  onCorroborate,
}: {
  fact: CommunityFact
  onCorroborate: (id: number) => Promise<void>
}) {
  const [voting, setVoting] = useState(false)
  const [count, setCount] = useState(fact.corroboration_count)
  const [voted, setVoted] = useState(false)

  async function handleCorroborate() {
    if (voted || voting) return
    setVoting(true)
    const res = await onCorroborate(fact.id)
    setVoting(false)
    if (res !== undefined) {
      setVoted(true)
      setCount(c => c + 1)
    }
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex-1 min-w-0">
        <p className="text-white/40 text-[10px]">{fact.field}</p>
        <p className="text-white text-sm font-medium truncate">{fact.value}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <TrustBadge level={fact.trust_level} />
        <button
          onClick={handleCorroborate}
          disabled={voted || voting}
          title="I can verify this"
          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-colors
            ${voted
              ? "bg-amber-500/20 text-amber-400 cursor-default"
              : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70 cursor-pointer"
            }`}
        >
          <span>+</span>
          <span>{count}</span>
        </button>
      </div>
    </div>
  )
}

// ── Inline add-what-you-know form
function AddFactForm({
  wardNo,
  cityId,
  onSubmitted,
}: {
  wardNo: number
  cityId: string
  onSubmitted: (fact: CommunityFact) => void
}) {
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState("gba_ward_officer")
  const [field, setField] = useState("name")
  const [value, setValue] = useState("")
  const [sourceNote, setSourceNote] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const fieldOptions: Record<string, string[]> = {
    name: ["name"],
    contact: ["phone", "email"],
  }
  const allFields = ["name", "phone", "email", "note"]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!value.trim()) return
    setSubmitting(true)
    const res = await submitFact({
      city_id: cityId,
      ward_no: wardNo,
      category: "officer",
      subject,
      field,
      value: value.trim(),
      source_note: sourceNote.trim() || undefined,
      contributor_token: getVoterToken(),
    })
    setSubmitting(false)
    if (res?.ok) {
      onSubmitted(res.fact)
      setDone(true)
      setValue("")
      setSourceNote("")
      setTimeout(() => { setDone(false); setOpen(false) }, 2000)
    }
  }

  if (done) {
    return (
      <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs text-center font-medium">
        ✓ Added! Others can now corroborate this.
      </div>
    )
  }

  return (
    <div className="mt-3">
      {!open ? (
        <button
          onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 100) }}
          className="w-full py-2.5 rounded-xl border border-dashed border-white/20 text-white/30 text-xs hover:border-white/40 hover:text-white/50 transition-colors"
        >
          + Know something? Add it for your community
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-2.5 p-3 rounded-xl bg-white/5 border border-white/10">
          <p className="text-white/50 text-xs font-semibold">Add what you know</p>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-white/30 text-[10px] uppercase tracking-wider block mb-1">Officer type</label>
              <select
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white/70 text-xs focus:outline-none focus:border-white/30"
              >
                {Object.entries(OFFICER_SUBJECTS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-white/30 text-[10px] uppercase tracking-wider block mb-1">Field</label>
              <select
                value={field}
                onChange={e => setField(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white/70 text-xs focus:outline-none focus:border-white/30"
              >
                {allFields.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
          </div>

          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={field === "phone" ? "98XXXXXXXX" : field === "email" ? "officer@gba.gov.in" : "Enter value"}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-white/30"
            required
          />

          <input
            type="text"
            value={sourceNote}
            onChange={e => setSourceNote(e.target.value)}
            placeholder="Source (optional): GBA notice board, RTI reply, etc."
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white/60 text-xs placeholder-white/20 focus:outline-none focus:border-white/30"
          />

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting || !value.trim()}
              className="flex-1 py-2 rounded-lg bg-[#FF9933]/20 border border-[#FF9933]/40 text-[#FF9933] text-xs font-semibold hover:bg-[#FF9933]/30 disabled:opacity-40 transition-colors"
            >
              {submitting ? "Submitting…" : "Submit"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-2 rounded-lg bg-white/5 text-white/30 text-xs hover:text-white/50 transition-colors"
            >
              Cancel
            </button>
          </div>

          <p className="text-white/20 text-[10px] text-center leading-relaxed">
            No login required. Your submission is anonymous.<br />
            Others can +1 it to verify.
          </p>
        </form>
      )}
    </div>
  )
}

export default function WardCard({ result, loading, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("who")
  const [profile, setProfile] = useState<WardProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [buzz, setBuzz] = useState<RedditPost[] | null>(null)
  const [buzzLoading, setBuzzLoading] = useState(false)
  const [extraFacts, setExtraFacts] = useState<CommunityFact[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [wardStats, setWardStats] = useState<WardStats | null>(null)
  const [propertyTax, setPropertyTax] = useState<PropertyTaxData | null>(null)
  const [budget, setBudget] = useState<BudgetSummary | null>(null)

  useEffect(() => {
    setTab("who")
    setProfile(null)
    setProfileLoading(false)
    setBuzz(null)
    setBuzzLoading(false)
    setExtraFacts([])
    setDepartments([])
    setWardStats(null)
    setPropertyTax(null)
    setBudget(null)
  }, [result?.ward_no])

  useEffect(() => {
    if (!result?.found || !result.ward_no) return
    if (profile !== null || profileLoading) return
    setProfileLoading(true)
    fetchWardProfile(result.ward_no, result.city_id, result.assembly_constituency ?? undefined)
      .then((p) => { setProfile(p); setProfileLoading(false) })
  }, [result, profile, profileLoading])

  useEffect(() => {
    if (tab !== "stats" || !result?.assembly_constituency) return
    if (!wardStats) fetchWardStats(result.assembly_constituency).then(setWardStats)
    if (!propertyTax) fetchPropertyTax(result.assembly_constituency).then(setPropertyTax)
  }, [tab, wardStats, propertyTax, result?.assembly_constituency])

  useEffect(() => {
    if (tab !== "money" || budget) return
    fetchBudgetSummary("2020-21").then(setBudget)
  }, [tab, budget])

  useEffect(() => {
    if (tab !== "report" || departments.length > 0) return
    fetchDepartments().then(d => setDepartments(d as Department[]))
  }, [tab, departments.length])

  useEffect(() => {
    if (tab !== "money" || !result?.found || !result.ward_name) return
    if (buzz !== null || buzzLoading) return
    setBuzzLoading(true)
    fetchBuzz(result.ward_name).then((posts) => { setBuzz(posts); setBuzzLoading(false) })
  }, [tab, result, buzz, buzzLoading])

  const allFacts = [...(profile?.community_facts ?? []), ...extraFacts]
  const officerGroups = groupOfficerFacts(allFacts)

  async function handleCorroborate(factId: number): Promise<void> {
    await voteFact(factId, "corroborate", getVoterToken())
  }

  function handleNewFact(fact: CommunityFact) {
    setExtraFacts(prev => {
      const exists = prev.find(f => f.id === fact.id) || profile?.community_facts.find(f => f.id === fact.id)
      return exists ? prev : [fact, ...prev]
    })
  }

  if (!loading && !result) return null

  const TABS: { id: Tab; label: string }[] = [
    { id: "who",    label: "Who" },
    { id: "money",  label: "Money" },
    { id: "stats",  label: "Area" },
    { id: "report", label: "Report" },
  ]

  return (
    <div className="
      fixed bottom-0 left-0 right-0 z-[1000]
      md:bottom-6 md:right-6 md:left-auto md:w-[26rem]
      bg-[#111111] border border-white/10 rounded-t-2xl md:rounded-2xl
      shadow-2xl overflow-hidden animate-slide-up
    ">
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
        <button onClick={onClose} aria-label="Close" className="ml-4 mt-0.5 text-white/30 hover:text-white/70 transition-colors text-lg">
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
                  ${tab === t.id ? "text-[#FF9933] border-b-2 border-[#FF9933]" : "text-white/30 hover:text-white/60"}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ══ WHO TAB ══ */}
          {tab === "who" && (
            <div className="px-5 py-4 max-h-[28rem] overflow-y-auto space-y-4">

              {/* Governance alert */}
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
                          {rep.elected_since && <p className="text-white/25 text-xs">Elected {rep.elected_since}</p>}
                          {rep.notes && <p className="text-white/30 text-xs mt-1 italic">{rep.notes}</p>}
                        </div>
                        {rep.profile_url && (
                          <a href={rep.profile_url} target="_blank" rel="noopener noreferrer"
                            className="text-[#FF9933]/60 hover:text-[#FF9933] text-xs transition-colors whitespace-nowrap mt-1">
                            Profile &rarr;
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Officers — civic Wikipedia section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-white/30 text-xs uppercase tracking-wider">Ward Officers</p>
                  {allFacts.filter(f => f.category === "officer").length > 0 && (
                    <span className="text-white/20 text-[10px]">community reported</span>
                  )}
                </div>

                {/* Official officers from DB */}
                {profile && profile.officers.length > 0 ? (
                  profile.officers.map((o) => (
                    <div key={o.id} className="p-3 rounded-xl bg-white/5">
                      <div className="flex items-center justify-between">
                        <p className="text-white/40 text-xs">{o.role} · {o.department}</p>
                        <TrustBadge level={o.source === "rti" ? "rti" : "official"} />
                      </div>
                      <p className="text-white text-sm font-medium">{o.name ?? "Name not disclosed"}</p>
                      {o.phone && <p className="text-white/40 text-xs">{o.phone}</p>}
                    </div>
                  ))
                ) : Object.keys(officerGroups).length > 0 ? (
                  // Community-sourced officers
                  Object.entries(officerGroups).map(([subject, fields]) => (
                    <div key={subject} className="p-3 rounded-xl bg-white/5 space-y-2">
                      <p className="text-white/40 text-xs font-medium">
                        {OFFICER_SUBJECTS[subject] ?? subject}
                      </p>
                      {Object.values(fields).map(fact => (
                        <FactCard key={fact.id} fact={fact} onCorroborate={handleCorroborate} />
                      ))}
                    </div>
                  ))
                ) : (
                  <div className="p-3 rounded-xl bg-white/5">
                    <p className="text-white/50 text-sm">No officer details yet</p>
                    <p className="text-white/25 text-xs mt-1 leading-relaxed">
                      Government doesn&apos;t publish this. If you know your ward officer&apos;s name or number, share it below — others will benefit.
                    </p>
                  </div>
                )}

                {/* Add what you know */}
                {profile && result.ward_no && (
                  <AddFactForm
                    wardNo={result.ward_no}
                    cityId={result.city_id}
                    onSubmitted={handleNewFact}
                  />
                )}
              </div>
            </div>
          )}

          {/* ══ MONEY TAB ══ */}
          {tab === "money" && (
            <div className="px-5 py-4 max-h-[28rem] overflow-y-auto space-y-4">
              {/* City-wide Budget */}
              {budget && (
                <div className="rounded-xl bg-white/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-white/50 text-xs uppercase tracking-wider">BBMP Budget {budget.financial_year}</p>
                    <span className="text-white/20 text-[10px]">City-wide</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-green-400 text-xl font-bold">₹{budget.total_receipts_lakh ? Math.round(budget.total_receipts_lakh / 100).toLocaleString('en-IN') : '—'} Cr</p>
                      <p className="text-white/30 text-xs">Revenue</p>
                    </div>
                    <div>
                      <p className="text-red-400 text-xl font-bold">₹{budget.total_payments_lakh ? Math.round(budget.total_payments_lakh / 100).toLocaleString('en-IN') : '—'} Cr</p>
                      <p className="text-white/30 text-xs">Expenditure</p>
                    </div>
                  </div>
                  {budget.top_expenditures && budget.top_expenditures.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-white/5">
                      <p className="text-white/30 text-[10px] uppercase tracking-wider">Top expenditures</p>
                      {budget.top_expenditures.slice(0, 8).map((item, i) => (
                        <div key={i} className="flex items-center justify-between gap-2">
                          <p className="text-white/60 text-xs truncate flex-1">{item.description}</p>
                          <p className="text-[#FF9933] text-xs font-mono shrink-0">₹{Math.round(item.amount_lakh / 100).toLocaleString('en-IN')} Cr</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-white/15 text-[10px]">Source: opencity.in/BBMP Budget</p>
                </div>
              )}

              {/* Tenders */}
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
                    <p className="text-[#FF9933] text-xs font-semibold">{formatLakh(profile.tender_total_lakh)} total</p>
                  </div>
                  {profile.tenders.map((t) => {
                    const st = STATUS_STYLES[t.status] ?? STATUS_STYLES.OPEN
                    return (
                      <div key={t.id} className="p-3 rounded-xl bg-white/5">
                        <p className="text-white text-sm leading-snug line-clamp-2">{t.title}</p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${st.bg} ${st.text}`}>{st.label}</span>
                          {t.value_lakh != null && (
                            <span className="text-[#FF9933] text-xs font-semibold">{formatLakh(t.value_lakh)}</span>
                          )}
                          {t.issued_date && <span className="text-white/30 text-xs">{t.issued_date}</span>}
                        </div>
                        {t.contractor_name && (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            {t.contractor_blacklisted && <span className="text-red-400 text-xs font-bold">FLAGGED</span>}
                            <p className={`text-xs ${t.contractor_blacklisted ? "text-red-300" : "text-white/40"}`}>
                              {t.contractor_name}
                            </p>
                          </div>
                        )}
                        {t.source_url && (
                          <a href={t.source_url} target="_blank" rel="noopener noreferrer"
                            className="text-[#FF9933]/50 hover:text-[#FF9933] text-xs transition-colors mt-1 inline-block">
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
                  <p className="text-white/20 text-xs mt-1">File an RTI to get the complete works register.</p>
                </div>
              )}

              {buzz && buzz.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
                  <p className="text-white/30 text-xs uppercase tracking-wider mb-2">r/bangalore chatter</p>
                  {buzz.map((post, i) => (
                    <a key={i} href={post.url} target="_blank" rel="noopener noreferrer" className="block group">
                      <div className="py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                        <p className="text-white text-xs leading-snug group-hover:text-[#FF9933] transition-colors line-clamp-2">{post.title}</p>
                        <p className="text-white/25 text-xs mt-1">+{post.score} · {post.num_comments} comments · {timeAgo(post.created_utc)}</p>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══ AREA STATS TAB ══ */}
          {tab === "stats" && (
            <div className="space-y-4">
              {!wardStats ? (
                <p className="text-white/30 text-sm animate-pulse">Loading area data...</p>
              ) : wardStats.ward_count === 0 ? (
                <p className="text-white/30 text-sm">No data available for this constituency</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-white/50 text-xs uppercase tracking-wider">
                      {wardStats.assembly_constituency} constituency
                    </p>
                    <span className="text-white/20 text-[10px]">Census {wardStats.data_year}</span>
                  </div>

                  {/* Population card */}
                  <div className="rounded-xl bg-white/5 p-4 space-y-3">
                    <p className="text-white/50 text-xs uppercase tracking-wider">Population</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-2xl font-bold text-white">{wardStats.total_population?.toLocaleString('en-IN') ?? '—'}</p>
                        <p className="text-white/30 text-xs">People</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-white">{wardStats.total_households?.toLocaleString('en-IN') ?? '—'}</p>
                        <p className="text-white/30 text-xs">Households</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-[#FF9933]">{wardStats.avg_population_density?.toLocaleString('en-IN') ?? '—'}</p>
                        <p className="text-white/30 text-xs">per km²</p>
                      </div>
                    </div>
                    {wardStats.total_area_sqkm && (
                      <p className="text-white/20 text-xs">Area: {wardStats.total_area_sqkm} km²</p>
                    )}
                  </div>

                  {/* Infrastructure grid */}
                  <div className="rounded-xl bg-white/5 p-4 space-y-3">
                    <p className="text-white/50 text-xs uppercase tracking-wider">Infrastructure</p>
                    <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                      {[
                        { icon: "🛣️", label: "Road length", value: wardStats.total_road_length_km ? `${wardStats.total_road_length_km} km` : null },
                        { icon: "💡", label: "Streetlights", value: wardStats.total_streetlights?.toLocaleString('en-IN') },
                        { icon: "🚏", label: "Bus stops", value: wardStats.total_bus_stops?.toLocaleString('en-IN') },
                        { icon: "🚌", label: "Bus routes", value: wardStats.total_bus_routes?.toLocaleString('en-IN') },
                        { icon: "🏫", label: "Govt schools", value: wardStats.total_govt_schools?.toLocaleString('en-IN') },
                        { icon: "👮", label: "Police stations", value: wardStats.total_police_stations?.toLocaleString('en-IN') },
                        { icon: "🚒", label: "Fire stations", value: wardStats.total_fire_stations?.toLocaleString('en-IN') },
                      ].filter(s => s.value).map((s) => (
                        <div key={s.label} className="flex items-center gap-2">
                          <span className="text-base">{s.icon}</span>
                          <div>
                            <p className="text-white text-sm font-semibold">{s.value}</p>
                            <p className="text-white/30 text-[10px]">{s.label}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Green spaces */}
                  {(wardStats.total_lakes || wardStats.total_parks || wardStats.total_playgrounds) ? (
                    <div className="rounded-xl bg-white/5 p-4 space-y-3">
                      <p className="text-white/50 text-xs uppercase tracking-wider">Green Spaces</p>
                      <div className="grid grid-cols-3 gap-3">
                        {wardStats.total_lakes ? (
                          <div className="text-center">
                            <p className="text-2xl font-bold text-blue-400">{wardStats.total_lakes}</p>
                            <p className="text-white/30 text-xs">Lakes</p>
                          </div>
                        ) : null}
                        {wardStats.total_parks ? (
                          <div className="text-center">
                            <p className="text-2xl font-bold text-green-400">{wardStats.total_parks}</p>
                            <p className="text-white/30 text-xs">Parks</p>
                          </div>
                        ) : null}
                        {wardStats.total_playgrounds ? (
                          <div className="text-center">
                            <p className="text-2xl font-bold text-yellow-400">{wardStats.total_playgrounds}</p>
                            <p className="text-white/30 text-xs">Playgrounds</p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {/* Property Tax */}
                  {propertyTax && propertyTax.years && propertyTax.years.length > 0 && (
                    <div className="rounded-xl bg-white/5 p-4 space-y-3">
                      <p className="text-white/50 text-xs uppercase tracking-wider">Property Tax Collected</p>
                      {propertyTax.years.map((yr) => (
                        <div key={yr.financial_year} className="flex items-center justify-between">
                          <div>
                            <p className="text-white text-sm font-mono">{yr.financial_year}</p>
                            <p className="text-white/30 text-[10px]">{yr.total_applications?.toLocaleString('en-IN')} properties · {yr.ward_count} wards</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[#FF9933] text-lg font-bold">₹{(yr.total_collection_lakh / 100).toFixed(0)} Cr</p>
                            <p className="text-white/20 text-[10px]">₹{yr.total_collection_lakh.toLocaleString('en-IN')} lakh</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="text-white/15 text-[10px] text-center">
                    Source: {wardStats.source} · {wardStats.ward_count} wards in this constituency
                  </p>
                </>
              )}
            </div>
          )}

          {/* ══ REPORT TAB ══ */}
          {tab === "report" && (
            <div className="px-5 py-4 max-h-[28rem] overflow-y-auto space-y-3">
              <button
                onClick={() => alert("RTI Generator coming soon")}
                className="w-full py-3.5 rounded-xl bg-[#FF9933]/15 border border-[#FF9933]/40 text-[#FF9933] text-sm font-semibold hover:bg-[#FF9933]/25 transition-colors"
              >
                Generate RTI Application
              </button>
              <p className="text-white/25 text-xs text-center -mt-1">
                Right to Information Act, 2005 · Rs. 10 fee · 30-day response
              </p>
              <div className="pt-2 space-y-2">
                <p className="text-white/30 text-xs uppercase tracking-wider">Government Agencies & Helplines</p>
                {departments.filter(d => d.complaint_url || d.toll_free || d.helpline).map((dept) => (
                  <a key={dept.short} href={dept.complaint_url || dept.website || "#"} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium">{dept.short}</p>
                      <p className="text-white/30 text-xs truncate">{dept.name}</p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      {dept.toll_free && (
                        <span className="text-[#FF9933] text-sm font-mono font-semibold">{dept.toll_free}</span>
                      )}
                      {!dept.toll_free && dept.helpline && (
                        <span className="text-white/40 text-xs font-mono">{dept.helpline}</span>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!loading && !result?.found && (
        <div className="px-5 py-6 text-center">
          <p className="text-white/30 text-sm">Try pinning a location within Bengaluru.</p>
        </div>
      )}
    </div>
  )
}
