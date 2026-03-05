"use client"

import { useEffect, useState } from "react"
import type {
  BudgetSummary, CommunityFact, Department, GbaContact, LocalOffice,
  MlaLadFunds, PinResult, PropertyTaxData, RedditPost, RepReportCard,
  SakalaPerformance, WardCommitteeMeetings, WardGrievances, WardPotholes,
  WardProfile, WardSpendCategory, WardStats, WardTradeLicenses, WorkOrder,
} from "@/lib/types"
import {
  fetchBudgetSummary, fetchBuzz, fetchCorpContacts, fetchDepartments,
  fetchMlaLadFunds, fetchPropertyTax, fetchRepReportCard, fetchSakalaPerformance,
  fetchTradeLicenses, fetchWardCommitteeMeetings, fetchWardGrievances, fetchWardPotholes,
  fetchWardProfile, fetchWardSpend, fetchWardStats, fetchWardUnknowns, fetchWorkOrders,
  lookupLocalOffices, voteFact,
} from "@/lib/api"
import { getVoterToken, groupOfficerFacts } from "@/lib/ward-utils"

export type WardUnknowns = {
  total_questions: number
  answered: number
  unanswered: Array<{ category: string; subject: string; field: string; prompt: string; icon: string; priority: number }>
}

export type ShowAddFor = { category: string; subject: string; field: string; prompt: string }

export function useWardData(result: PinResult | null) {
  // ── Profile ──────────────────────────────────────────────
  const [profile, setProfile] = useState<WardProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)

  // ── WHO tab ──────────────────────────────────────────────
  const [extraFacts, setExtraFacts] = useState<CommunityFact[]>([])
  const [unknowns, setUnknowns] = useState<WardUnknowns | null>(null)
  const [showAddFor, setShowAddFor] = useState<ShowAddFor | null>(null)
  const [committeeMeetings, setCommitteeMeetings] = useState<WardCommitteeMeetings | null>(null)
  const [reportCard, setReportCard] = useState<RepReportCard | null>(null)
  const [ladFunds, setLadFunds] = useState<MlaLadFunds[]>([])
  const [corpContacts, setCorpContacts] = useState<GbaContact[]>([])
  const [corpName, setCorpName] = useState<string | null>(null)

  // ── EXPENSES tab ─────────────────────────────────────────
  const [budget, setBudget] = useState<BudgetSummary | null>(null)
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [tradeLicenses, setTradeLicenses] = useState<WardTradeLicenses[]>([])
  const [buzz, setBuzz] = useState<RedditPost[] | null>(null)
  const [buzzLoading, setBuzzLoading] = useState(false)

  // ── STATS tab ─────────────────────────────────────────────
  const [wardStats, setWardStats] = useState<WardStats | null>(null)
  const [grievances, setGrievances] = useState<WardGrievances[]>([])
  const [potholes, setPotholes] = useState<WardPotholes | null>(null)
  const [wardSpend, setWardSpend] = useState<WardSpendCategory | null>(null)
  const [propertyTax, setPropertyTax] = useState<PropertyTaxData | null>(null)
  const [sakala, setSakala] = useState<SakalaPerformance | null>(null)

  // ── REPORT tab ────────────────────────────────────────────
  const [localOffices, setLocalOffices] = useState<LocalOffice[]>([])
  const [departments, setDepartments] = useState<Department[]>([])

  // ── Tab state (lifted here so hook can gate fetches) ─────
  const [tab, setTab] = useState<"who" | "expenses" | "stats" | "report">("who")

  // ── Reset on ward change ─────────────────────────────────
  useEffect(() => {
    setTab("who")
    setProfile(null)
    setProfileLoading(false)
    setExtraFacts([])
    setUnknowns(null)
    setShowAddFor(null)
    setCommitteeMeetings(null)
    setReportCard(null)
    setLadFunds([])
    setCorpContacts([])
    setCorpName(null)
    setBudget(null)
    setWorkOrders([])
    setTradeLicenses([])
    setBuzz(null)
    setBuzzLoading(false)
    setWardStats(null)
    setGrievances([])
    setPotholes(null)
    setWardSpend(null)
    setPropertyTax(null)
    setSakala(null)
    setLocalOffices([])
    setDepartments([])
  }, [result?.ward_no])

  // ── Profile (always) ─────────────────────────────────────
  useEffect(() => {
    if (!result?.found || !result.ward_no) return
    if (profile !== null || profileLoading) return
    setProfileLoading(true)
    fetchWardProfile(result.ward_no, result.city_id, result.assembly_constituency ?? undefined)
      .then(p => { setProfile(p); setProfileLoading(false) })
  }, [result, profile, profileLoading])

  // ── WHO tab: always-fetch ─────────────────────────────────
  useEffect(() => {
    if (!result?.ward_no || unknowns) return
    fetchWardUnknowns(result.ward_no).then(setUnknowns)
  }, [result?.ward_no, unknowns])

  useEffect(() => {
    if (!result?.ward_no || committeeMeetings !== null) return
    fetchWardCommitteeMeetings(result.ward_no).then(setCommitteeMeetings)
  }, [result?.ward_no, committeeMeetings])

  useEffect(() => {
    if (!result?.assembly_constituency || ladFunds.length > 0) return
    fetchMlaLadFunds(result.assembly_constituency).then(funds => setLadFunds(funds ?? []))
  }, [result?.assembly_constituency, ladFunds.length])

  useEffect(() => {
    if (!result?.assembly_constituency || reportCard !== null) return
    fetchRepReportCard(result.assembly_constituency).then(rc => setReportCard(rc ?? null))
  }, [result?.assembly_constituency, reportCard])

  // ── Local offices + corp contacts (WHO + REPORT) ─────────
  useEffect(() => {
    if (tab !== "report" && tab !== "who") return
    if (tab === "report" && departments.length === 0) {
      fetchDepartments().then(d => setDepartments(d as Department[]))
    }
    if (localOffices.length === 0 && result?.lat && result?.lng) {
      lookupLocalOffices(result.lat, result.lng).then(offices => {
        setLocalOffices(offices)
        const corp = offices.find(o => o.boundary_type === "gba_corporation")
        if (corp) {
          setCorpName(corp.name)
          fetchCorpContacts(corp.name).then(setCorpContacts)
        }
      })
    }
  }, [tab, departments.length, localOffices.length, result?.lat, result?.lng])

  // ── EXPENSES tab ─────────────────────────────────────────
  useEffect(() => {
    if (tab !== "expenses" || !result?.ward_no) return
    if (!budget) fetchBudgetSummary("2025-26").then(setBudget)
    if (workOrders.length === 0) fetchWorkOrders(result.ward_no).then(setWorkOrders)
  }, [tab, budget, workOrders.length, result?.ward_no])

  useEffect(() => {
    if (tab !== "expenses" || !result?.found || !result.ward_name) return
    if (tradeLicenses.length === 0) fetchTradeLicenses(result.ward_name).then(setTradeLicenses)
    if (buzz !== null || buzzLoading) return
    setBuzzLoading(true)
    fetchBuzz(result.ward_name).then(posts => { setBuzz(posts); setBuzzLoading(false) })
  }, [tab, result, buzz, buzzLoading, tradeLicenses.length])

  // ── STATS tab ─────────────────────────────────────────────
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

  // ── Derived values ────────────────────────────────────────
  const allFacts = [...(profile?.community_facts ?? []), ...extraFacts]
  const officerGroups = groupOfficerFacts(allFacts)

  // ── Handlers ──────────────────────────────────────────────
  async function handleCorroborate(factId: number): Promise<void> {
    await voteFact(factId, "corroborate", getVoterToken())
  }

  function handleNewFact(fact: CommunityFact) {
    setExtraFacts(prev => {
      const exists = prev.find(f => f.id === fact.id) || profile?.community_facts.find(f => f.id === fact.id)
      return exists ? prev : [fact, ...prev]
    })
  }

  function refreshUnknowns() {
    setUnknowns(null)
  }

  return {
    // tab
    tab, setTab,
    // profile
    profile, profileLoading,
    // who
    extraFacts, unknowns, showAddFor, setShowAddFor,
    committeeMeetings, reportCard, ladFunds,
    corpContacts, corpName,
    allFacts, officerGroups,
    handleCorroborate, handleNewFact, refreshUnknowns,
    // expenses
    budget, workOrders, tradeLicenses, buzz, buzzLoading,
    // stats
    wardStats, grievances, potholes, wardSpend, propertyTax, sakala,
    // report
    localOffices, departments,
  }
}
