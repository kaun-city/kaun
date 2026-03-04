"use client"

import { useEffect, useRef, useState } from "react"
import type { BudgetSummary, CommunityFact, Department, PinResult, PropertyTaxData, RedditPost, WardProfile, WardStats, WardGrievances, SakalaPerformance, WardTradeLicenses, WardPotholes, WardSpendCategory } from "@/lib/types"
import { fetchWardProfile, fetchBuzz, fetchBudgetSummary, fetchDepartments, fetchPropertyTax, fetchWardStats, fetchWardUnknowns, fetchWardGrievances, fetchSakalaPerformance, fetchTradeLicenses, fetchWardPotholes, fetchWardSpend, submitFact, voteFact } from "@/lib/api"

interface Props {
  result: PinResult | null
  loading: boolean
  onClose: () => void
}

type Tab = "who" | "expenses" | "stats" | "report"

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
  official:           { bg: "bg-green-500/10",  text: "text-green-400",  border: "border-green-500/20", label: "Govt source",          icon: "OK" },
  rti:                { bg: "bg-blue-500/10",   text: "text-blue-400",   border: "border-blue-500/20",  label: "RTI sourced",          icon: "" },
  community_verified: { bg: "bg-amber-500/10",  text: "text-amber-400",  border: "border-amber-500/20", label: "Community verified",   icon: "OK" },
  unverified:         { bg: "bg-white/5",       text: "text-white/30",   border: "border-white/10",     label: "Unverified",           icon: "?" },
  disputed:           { bg: "bg-red-500/10",    text: "text-red-400",    border: "border-red-500/20",   label: "Disputed",             icon: "!" },
}

const OFFICER_SUBJECTS: Record<string, string> = {
  gba_ward_officer:   "Ward Officer (GBA)",
  gba_ae_works:       "AE  -  Works (GBA)",
  gba_ae_health:      "AE  -  Health (GBA)",
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

//  Community fact card with corroborate button
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

//  Inline add-what-you-know form
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
        OK Added! Others can now corroborate this.
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
              {submitting ? "Submitting..." : "Submit"}
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
  const [grievances, setGrievances] = useState<WardGrievances[]>([])
  const [potholes, setPotholes] = useState<WardPotholes | null>(null)
  const [wardSpend, setWardSpend] = useState<WardSpendCategory | null>(null)
  const [sakala, setSakala] = useState<SakalaPerformance | null>(null)
  const [propertyTax, setPropertyTax] = useState<PropertyTaxData | null>(null)
  const [budget, setBudget] = useState<BudgetSummary | null>(null)
  const [tradeLicenses, setTradeLicenses] = useState<WardTradeLicenses[]>([])
  const [unknowns, setUnknowns] = useState<{ total_questions: number; answered: number; unanswered: Array<{ category: string; subject: string; field: string; prompt: string; icon: string; priority: number }> } | null>(null)
  const [showAddFor, setShowAddFor] = useState<{ category: string; subject: string; field: string; prompt: string } | null>(null)

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
    setUnknowns(null)
    setShowAddFor(null)
    setGrievances([])
    setSakala(null)
    setTradeLicenses([])
    setPotholes(null)
    setWardSpend(null)
  }, [result?.ward_no])

  useEffect(() => {
    if (!result?.found || !result.ward_no) return
    if (profile !== null || profileLoading) return
    setProfileLoading(true)
    fetchWardProfile(result.ward_no, result.city_id, result.assembly_constituency ?? undefined)
      .then((p) => { setProfile(p); setProfileLoading(false) })
  }, [result, profile, profileLoading])

  useEffect(() => {
    if (!result?.ward_no || unknowns) return
    fetchWardUnknowns(result.ward_no).then(setUnknowns)
  }, [result?.ward_no, unknowns])

  useEffect(() => {
    if (tab !== "stats" || !result?.assembly_constituency) return
    if (!wardStats) fetchWardStats(result.assembly_constituency).then(setWardStats)
    if (!propertyTax) fetchPropertyTax(result.assembly_constituency).then(setPropertyTax)
    if (!sakala) fetchSakalaPerformance(result.assembly_constituency).then(setSakala)
  }, [tab, wardStats, propertyTax, sakala, result?.assembly_constituency])

  useEffect(() => {
    if (tab !== "stats" || !result?.ward_name || grievances.length > 0) return
    fetchWardGrievances(result.ward_name).then(setGrievances)
  }, [tab, grievances, result?.ward_name])

  useEffect(() => {
    if (tab !== "stats" || !result?.ward_no) return
    if (!potholes) fetchWardPotholes(result.ward_no).then(setPotholes)
    if (!wardSpend) fetchWardSpend(result.ward_no).then(setWardSpend)
  }, [tab, potholes, wardSpend, result?.ward_no])

  useEffect(() => {
    if (tab !== "expenses" || budget) return
    fetchBudgetSummary("2020-21").then(setBudget)
  }, [tab, budget])

  useEffect(() => {
    if (tab !== "report" || departments.length > 0) return
    fetchDepartments().then(d => setDepartments(d as Department[]))
  }, [tab, departments.length])

  useEffect(() => {
    if (tab !== "expenses" || !result?.found || !result.ward_name) return
    if (tradeLicenses.length === 0) fetchTradeLicenses(result.ward_name).then(setTradeLicenses)
    if (buzz !== null || buzzLoading) return
    setBuzzLoading(true)
    fetchBuzz(result.ward_name).then((posts) => { setBuzz(posts); setBuzzLoading(false) })
  }, [tab, result, buzz, buzzLoading, tradeLicenses.length])

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
    { id: "expenses",  label: "Expenses" },
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
              {result.zone ? `  -  ${result.zone}` : ""}
              {result.assembly_constituency ? `  -  ${result.assembly_constituency}` : ""}
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

          {/*  WHO TAB  */}
          {tab === "who" && (
            <div className="px-5 py-4 max-h-[28rem] overflow-y-auto space-y-4">

              {/* Knowledge Score */}
              {unknowns && (
                <div className="rounded-xl bg-white/5 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-white/50 text-xs uppercase tracking-wider">Community Knowledge</p>
                    <span className="text-white/40 text-xs font-mono">{unknowns.answered}/{unknowns.total_questions}</span>
                  </div>
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(2, (unknowns.answered / unknowns.total_questions) * 100)}%`,
                        background: unknowns.answered === 0 ? '#ef4444' : unknowns.answered < unknowns.total_questions / 2 ? '#f59e0b' : '#22c55e',
                      }}
                    />
                  </div>
                  <p className="text-white/25 text-[10px]">
                    {unknowns.answered === 0
                      ? "Nobody has contributed data about this ward yet. Be the first."
                      : unknowns.unanswered?.length
                        ? `${unknowns.unanswered.length} things still unknown. Help fill the gaps.`
                        : "This ward is fully mapped by the community! !"}
                  </p>
                </div>
              )}

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

              {/*  Officers -- civic Wikipedia section */}
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
                        <p className="text-white/40 text-xs">{o.role}  -  {o.department}</p>
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
                      Government doesn&apos;t publish this. If you know your ward officer&apos;s name or number, share it below -- others will benefit.
                    </p>
                  </div>
                )}

                {/* Unanswered questions -- the civic Wikipedia prompts */}
                {unknowns && unknowns.unanswered && unknowns.unanswered.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <p className="text-white/30 text-xs uppercase tracking-wider">Help fill the gaps</p>
                    {unknowns.unanswered.slice(0, showAddFor ? 3 : 6).map((q) => (
                      <button
                        key={`${q.category}-${q.subject}-${q.field}`}
                        onClick={() => setShowAddFor(q)}
                        className={`w-full text-left p-2.5 rounded-lg transition-colors ${
                          showAddFor?.field === q.field && showAddFor?.subject === q.subject
                            ? 'bg-[#FF9933]/10 border border-[#FF9933]/30'
                            : 'bg-white/[0.03] hover:bg-white/[0.06] border border-transparent'
                        }`}
                      >
                        <span className="text-sm mr-2">{q.icon}</span>
                        <span className="text-white/50 text-xs">{q.prompt}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Quick answer form for selected question */}
                {showAddFor && result.ward_no && (
                  <div className="rounded-xl bg-[#FF9933]/5 border border-[#FF9933]/20 p-3 space-y-2">
                    <p className="text-white/60 text-xs">{showAddFor.prompt}</p>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault()
                        const form = e.target as HTMLFormElement
                        const input = form.elements.namedItem("answer") as HTMLInputElement
                        if (!input.value.trim()) return
                        const token = typeof window !== "undefined"
                          ? sessionStorage.getItem("kaun_voter_token") || (() => { const t = crypto.randomUUID(); sessionStorage.setItem("kaun_voter_token", t); return t })()
                          : null
                        const res = await submitFact({
                          city_id: result.city_id,
                          ward_no: result.ward_no!,
                          category: showAddFor!.category,
                          subject: showAddFor!.subject,
                          field: showAddFor!.field,
                          value: input.value.trim(),
                          source_type: "community",
                          contributor_token: token ?? undefined,
                        })
                        if (res?.fact) {
                          handleNewFact(res.fact)
                          setShowAddFor(null)
                          setUnknowns(null) // refresh unknowns
                          input.value = ""
                        }
                      }}
                      className="flex gap-2"
                    >
                      <input
                        name="answer"
                        type="text"
                        placeholder="Type what you know..."
                        className="flex-1 bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-[#FF9933]/50"
                        autoFocus
                      />
                      <button
                        type="submit"
                        className="bg-[#FF9933] text-black text-xs font-semibold px-4 py-2 rounded-lg hover:bg-[#FF9933]/80 transition-colors shrink-0"
                      >
                        Share
                      </button>
                    </form>
                    <button onClick={() => setShowAddFor(null)} className="text-white/20 text-[10px] hover:text-white/40">cancel</button>
                  </div>
                )}

                {/* Generic add fact form (for custom contributions) */}
                {!showAddFor && profile && result.ward_no && (
                  <AddFactForm
                    wardNo={result.ward_no}
                    cityId={result.city_id}
                    onSubmitted={handleNewFact}
                  />
                )}
              </div>
            </div>
          )}

          {/*  EXPENSES TAB  */}
          {tab === "expenses" && (
            <div className="px-5 py-4 max-h-[28rem] overflow-y-auto space-y-4">
              {/* City-wide Budget */}
              {budget && (
                <div className="rounded-xl bg-white/5 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-white/50 text-[10px] uppercase tracking-wider">BBMP Budget {budget.financial_year}</p>
                    <p className="text-[#FF9933] text-lg font-bold">Rs.{budget.total_expenditure_lakh ? Math.round(budget.total_expenditure_lakh / 100).toLocaleString('en-IN') : '--'} Cr</p>
                  </div>
                  {budget.departments && budget.departments.length > 0 && (
                    <div className="space-y-2">
                      {budget.departments.map((dept, i) => (
                        <div key={i}>
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <p className="text-white/60 text-xs truncate flex-1">{dept.department}</p>
                            <p className="text-white/40 text-xs font-mono shrink-0">Rs.{dept.amount_cr} Cr <span className="text-white/20">({dept.pct}%)</span></p>
                          </div>
                          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-[#FF9933]/60 rounded-full" style={{ width: `${Math.min(dept.pct, 100)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-white/15 text-[10px]">Source: BBMP Budget Book 2024-25 via opencity.in</p>
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
              <p className="text-white/15 text-[10px] px-1">Source: KPPP karnataka.gov.in</p>

              {/* Trade Licenses */}
              {tradeLicenses.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-white/30 text-[10px] uppercase tracking-wider">Trade Licenses (BBMP)</p>
                    <p className="text-white/15 text-[10px]">opencity.in</p>
                  </div>
                  <div className="space-y-2">
                    {tradeLicenses.map((tl) => (
                      <div key={tl.year} className="rounded-xl bg-white/5 px-4 py-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-white text-sm font-semibold">{tl.year}</span>
                          <span className="text-[#FF9933] text-sm font-bold">{tl.total_licenses.toLocaleString("en-IN")} licenses</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="rounded-lg bg-white/5 py-1.5">
                            <p className="text-green-400 text-xs font-bold">{tl.new_licenses.toLocaleString("en-IN")}</p>
                            <p className="text-white/30 text-[10px]">New</p>
                          </div>
                          <div className="rounded-lg bg-white/5 py-1.5">
                            <p className="text-blue-400 text-xs font-bold">{tl.renewals.toLocaleString("en-IN")}</p>
                            <p className="text-white/30 text-[10px]">Renewed</p>
                          </div>
                          <div className="rounded-lg bg-white/5 py-1.5">
                            <p className="text-white text-xs font-bold">
                              {tl.total_revenue >= 10000000
                                ? `${(tl.total_revenue / 10000000).toFixed(1)} Cr`
                                : tl.total_revenue >= 100000
                                ? `${(tl.total_revenue / 100000).toFixed(1)} L`
                                : `${Math.round(tl.total_revenue / 1000)}K`}
                            </p>
                            <p className="text-white/30 text-[10px]">Revenue</p>
                          </div>
                        </div>
                        {tl.top_trade_type && (
                          <p className="text-white/20 text-[10px] mt-1.5 truncate">Top: {tl.top_trade_type}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {buzz && buzz.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-white/30 text-xs uppercase tracking-wider">r/bangalore chatter</p>
                    <p className="text-white/15 text-[10px]">reddit.com/r/bangalore</p>
                  </div>
                  {buzz.map((post, i) => (
                    <a key={i} href={post.url} target="_blank" rel="noopener noreferrer" className="block group">
                      <div className="py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                        <p className="text-white text-xs leading-snug group-hover:text-[#FF9933] transition-colors line-clamp-2">{post.title}</p>
                        <p className="text-white/25 text-xs mt-1">+{post.score}  -  {post.num_comments} comments  -  {timeAgo(post.created_utc)}</p>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/*  AREA STATS TAB  */}
          {tab === "stats" && (
            <div className="px-5 py-4 max-h-[28rem] overflow-y-auto space-y-3">
              {!wardStats ? (
                <p className="text-white/30 text-sm animate-pulse">Loading area data...</p>
              ) : wardStats.ward_count === 0 ? (
                <p className="text-white/30 text-sm">No data available for this constituency</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-white/50 text-xs uppercase tracking-wider truncate">
                      {wardStats.assembly_constituency}
                    </p>
                    <span className="text-white/20 text-[10px] shrink-0 ml-2">Census {wardStats.data_year}</span>
                  </div>

                  {/* Population card */}
                  <div className="rounded-xl bg-white/5 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-white/50 text-[10px] uppercase tracking-wider">Population</p>
                      <p className="text-white/15 text-[10px]">Census 2011 via opencity.in</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="min-w-0">
                        <p className="text-lg font-bold text-white truncate">{wardStats.total_population?.toLocaleString('en-IN') ?? '--'}</p>
                        <p className="text-white/30 text-[10px]">People</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-lg font-bold text-white truncate">{wardStats.total_households?.toLocaleString('en-IN') ?? '--'}</p>
                        <p className="text-white/30 text-[10px]">Households</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-lg font-bold text-[#FF9933] truncate">{wardStats.avg_population_density?.toLocaleString('en-IN') ?? '--'}</p>
                        <p className="text-white/30 text-[10px]">per km2</p>
                      </div>
                    </div>
                    {wardStats.total_area_sqkm && (
                      <p className="text-white/20 text-[10px]">Area: {wardStats.total_area_sqkm} km2</p>
                    )}
                  </div>

                  {/* Infrastructure grid */}
                  <div className="rounded-xl bg-white/5 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-white/50 text-[10px] uppercase tracking-wider">Infrastructure</p>
                      <p className="text-white/15 text-[10px]">BBMP via opencity.in</p>
                    </div>
                    <div className="grid grid-cols-2 gap-y-2 gap-x-3">
                      {[
                        { icon: "", label: "Roads", value: wardStats.total_road_length_km ? `${wardStats.total_road_length_km} km` : null },
                        { icon: "", label: "Streetlights", value: wardStats.total_streetlights?.toLocaleString('en-IN') },
                        { icon: "", label: "Bus stops", value: wardStats.total_bus_stops?.toLocaleString('en-IN') },
                        { icon: "", label: "Bus routes", value: wardStats.total_bus_routes?.toLocaleString('en-IN') },
                        { icon: "", label: "Govt schools", value: wardStats.total_govt_schools?.toLocaleString('en-IN') },
                        { icon: "", label: "Police stations", value: wardStats.total_police_stations?.toLocaleString('en-IN') },
                        { icon: "", label: "Fire stations", value: wardStats.total_fire_stations?.toLocaleString('en-IN') },
                      ].filter(s => s.value).map((s) => (
                        <div key={s.label} className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm shrink-0">{s.icon}</span>
                          <div className="min-w-0">
                            <p className="text-white text-sm font-semibold">{s.value}</p>
                            <p className="text-white/30 text-[10px]">{s.label}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Green spaces */}
                  {(wardStats.total_lakes || wardStats.total_parks || wardStats.total_playgrounds) ? (
                    <div className="rounded-xl bg-white/5 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-white/50 text-[10px] uppercase tracking-wider">Green Spaces</p>
                        <p className="text-white/15 text-[10px]">BBMP via opencity.in</p>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {wardStats.total_lakes ? (
                          <div className="text-center">
                            <p className="text-lg font-bold text-blue-400">{wardStats.total_lakes}</p>
                            <p className="text-white/30 text-[10px]">Lakes</p>
                          </div>
                        ) : null}
                        {wardStats.total_parks ? (
                          <div className="text-center">
                            <p className="text-lg font-bold text-green-400">{wardStats.total_parks}</p>
                            <p className="text-white/30 text-[10px]">Parks</p>
                          </div>
                        ) : null}
                        {wardStats.total_playgrounds ? (
                          <div className="text-center">
                            <p className="text-lg font-bold text-yellow-400">{wardStats.total_playgrounds}</p>
                            <p className="text-white/30 text-[10px]">Playgrounds</p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {/* Roads & Spending (2018-2023) */}
                  {wardSpend && wardSpend.grand_total > 0 && (
                    <div className="rounded-xl bg-white/5 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-white/50 text-[10px] uppercase tracking-wider">BBMP Spending 2018-23</p>
                        <p className="text-white/30 text-[10px]">Rs.{(wardSpend.grand_total / 10000000).toFixed(1)} Cr total</p>
                      </div>
                      {[
                        { label: "Roads & Infrastructure", val: wardSpend.roads_and_infrastructure },
                        { label: "Roads & Drains", val: wardSpend.roads_and_drains },
                        { label: "Drainage", val: wardSpend.drainage },
                        { label: "Streetlighting", val: wardSpend.streetlighting },
                        { label: "Waste Management", val: wardSpend.waste_management },
                        { label: "Water & Sanitation", val: wardSpend.water_and_sanitation },
                        { label: "Buildings & Facilities", val: wardSpend.buildings_facilities },
                      ].filter(x => x.val > 0).map(({ label, val }) => {
                        const pct = wardSpend.grand_total > 0 ? Math.round((val / wardSpend.grand_total) * 100) : 0
                        return (
                          <div key={label}>
                            <div className="flex justify-between text-[10px] mb-0.5">
                              <span className="text-white/40">{label}</span>
                              <span className="text-white/60 font-mono">Rs.{(val / 10000000).toFixed(1)} Cr ({pct}%)</span>
                            </div>
                            <div className="h-1 rounded-full bg-white/10">
                              <div className="h-1 rounded-full bg-[#FF9933]/60" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        )
                      })}
                      {potholes && (
                        <p className="text-white/25 text-[10px] pt-1 border-t border-white/10">
                          Pothole complaints (Fix My Street 2022): <span className="text-red-400 font-semibold">{potholes.complaints.toLocaleString('en-IN')}</span>
                        </p>
                      )}
                      <p className="text-white/15 text-[10px] pt-1">Source: BBMP work orders via opencity.in · Fix My Street via opencity.in</p>
                    </div>
                  )}

                  {/* Property Tax */}
                  {propertyTax && propertyTax.years && propertyTax.years.length > 0 && (
                    <div className="rounded-xl bg-white/5 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-white/50 text-[10px] uppercase tracking-wider">Property Tax Collected</p>
                        <p className="text-white/15 text-[10px]">BBMP via opencity.in</p>
                      </div>
                      {propertyTax.years.map((yr) => (
                        <div key={yr.financial_year} className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-white text-xs font-mono">{yr.financial_year}</p>
                            <p className="text-white/30 text-[10px]">{yr.total_applications?.toLocaleString('en-IN')} properties</p>
                          </div>
                          <p className="text-[#FF9933] text-sm font-bold shrink-0">Rs.{(yr.total_collection_lakh / 100).toFixed(0)} Cr</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="text-white/15 text-[10px] text-center">
                    {wardStats.source} · {wardStats.ward_count} wards aggregated
                  </p>
                </>
              )}

              {/* Grievances */}
              {grievances.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-white/30 text-[10px] uppercase tracking-wider">Citizen Complaints (BBMP)</p>
                    <p className="text-white/15 text-[10px]">opencity.in</p>
                  </div>
                  <div className="space-y-2">
                    {grievances.map((g) => {
                      const closeRate = g.total_complaints > 0 ? Math.round((g.closed / g.total_complaints) * 100) : 0
                      return (
                        <div key={g.year} className="rounded-xl bg-white/5 px-4 py-3 flex items-center justify-between">
                          <div>
                            <p className="text-white text-sm font-semibold">{g.year}</p>
                            <p className="text-white/30 text-xs">{g.total_complaints.toLocaleString("en-IN")} complaints</p>
                          </div>
                          <div className="text-right">
                            <p className={`text-sm font-bold ${closeRate >= 90 ? "text-green-400" : closeRate >= 70 ? "text-yellow-400" : "text-red-400"}`}>
                              {closeRate}% closed
                            </p>
                            {g.registered > 0 && (
                              <p className="text-white/30 text-xs">{g.registered.toLocaleString("en-IN")} pending</p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Sakala service delivery */}
              {sakala && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-white/30 text-[10px] uppercase tracking-wider">Sakala Service Delivery ({sakala.year})</p>
                    <p className="text-white/15 text-[10px]">sakala.kar.nic.in</p>
                  </div>
                  <div className="rounded-xl bg-white/5 px-4 py-3 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-white/40 text-xs">BBMP rank ({sakala.assembly_name})</span>
                      <span className="text-white text-xs font-semibold">
                        {sakala.rank_overall != null ? `#${sakala.rank_overall} of 28` : "--"}
                      </span>
                    </div>
                    {sakala.intime_pct != null && (
                      <div className="flex justify-between">
                        <span className="text-white/40 text-xs">In-time delivery</span>
                        <span className={`text-xs font-semibold ${sakala.intime_pct >= 90 ? "text-green-400" : sakala.intime_pct >= 75 ? "text-yellow-400" : "text-red-400"}`}>
                          {sakala.intime_pct.toFixed(1)}%
                        </span>
                      </div>
                    )}
                    {sakala.pending != null && (
                      <div className="flex justify-between">
                        <span className="text-white/40 text-xs">Pending applications</span>
                        <span className="text-white text-xs font-semibold">{sakala.pending.toLocaleString("en-IN")}</span>
                      </div>
                    )}
                  </div>
                  <p className="text-white/15 text-[10px] mt-1 px-1">Bengaluru Urban ranks 31st of 32 districts statewide</p>
                </div>
              )}
            </div>
          )}

          {/*  REPORT TAB  */}
          {tab === "report" && (
            <div className="px-5 py-4 max-h-[28rem] overflow-y-auto space-y-3">
              <button
                onClick={() => alert("RTI Generator coming soon")}
                className="w-full py-3.5 rounded-xl bg-[#FF9933]/15 border border-[#FF9933]/40 text-[#FF9933] text-sm font-semibold hover:bg-[#FF9933]/25 transition-colors"
              >
                Generate RTI Application
              </button>
              <p className="text-white/25 text-xs text-center -mt-1">
                Right to Information Act, 2005  -  Rs. 10 fee  -  30-day response
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
