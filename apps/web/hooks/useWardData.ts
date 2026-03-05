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
import { getCity } from "@/lib/cities"
import type { CityConfig } from "@/lib/cities"
import { getVoterToken, groupOfficerFacts } from "@/lib/ward-utils"

export type WardUnknowns = {
  total_questions: number
  answered: number
  unanswered: Array<{ category: string; subject: string; field: string; prompt: string; icon: string; priority: number }>
}

export type ShowAddFor = { category: string; subject: string; field: string; prompt: string }

export function useWardData(result: PinResult | null) {
  // Resolve city config from result
  const city: CityConfig = getCity(result?.city_id)

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

  // ── Tab state ─────────────────────────────────────────────
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

  // ── WHO: unknowns (always-fetch) ──────────────────────────
  useEffect(() => {
    if (!result?.ward_no || unknowns) return
    fetchWardUnknowns(result.ward_no, result.city_id).then(setUnknowns)
  }, [result?.ward_no, result?.city_id, unknowns])

  // ── WHO: ward committee meetings ─────────────────────────
  useEffect(() => {
    if (!city.features.wardCommitteeMeetings) return
    if (!result?.ward_no || committeeMeetings !== null) return
    fetchWardCommitteeMeetings(result.ward_no).then(setCommitteeMeetings)
  }, [result?.ward_no, committeeMeetings, city.features.wardCommitteeMeetings])

  // ── WHO: MLA LAD funds ───────────────────────────────────
  useEffect(() => {
    if (!city.features.mlaLadFunds) return
    if (!result?.assembly_constituency || ladFunds.length > 0) return
    fetchMlaLadFunds(result.assembly_constituency).then(funds => setLadFunds(funds ?? []))
  }, [result?.assembly_constituency, ladFunds.length, city.features.mlaLadFunds])

  // ── WHO: rep report card ─────────────────────────────────
  useEffect(() => {
    if (!city.features.repReportCards) return
    if (!result?.assembly_constituency || reportCard !== null) return
    fetchRepReportCard(result.assembly_constituency).then(rc => setReportCard(rc ?? null))
  }, [result?.assembly_constituency, reportCard, city.features.repReportCards])

  // ── Local offices + corp contacts (WHO + REPORT) ─────────
  useEffect(() => {
    if (tab !== "report" && tab !== "who") return
    if (tab === "report" && departments.length === 0) {
      fetchDepartments(result?.city_id).then(d => setDepartments(d as Department[]))
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
  }, [tab, departments.length, localOffices.length, result?.lat, result?.lng, result?.city_id])

  // ── EXPENSES: budget + work orders ───────────────────────
  useEffect(() => {
    if (tab !== "expenses" || !result?.ward_no) return
    if (city.features.budget && !budget) {
      fetchBudgetSummary(city.budgetYear).then(setBudget)
    }
    if (city.features.workOrders && workOrders.length === 0) {
      fetchWorkOrders(result.ward_no).then(setWorkOrders)
    }
  }, [tab, budget, workOrders.length, result?.ward_no, city.features.budget, city.features.workOrders, city.budgetYear])

  // ── EXPENSES: trade licenses + buzz ──────────────────────
  useEffect(() => {
    if (tab !== "expenses" || !result?.found || !result.ward_name) return
    if (city.features.tradeLicenses && tradeLicenses.length === 0) {
      fetchTradeLicenses(result.ward_name).then(setTradeLicenses)
    }
    if (city.features.buzz && buzz === null && !buzzLoading) {
      setBuzzLoading(true)
      fetchBuzz(result.ward_name, city.subreddit).then(posts => { setBuzz(posts); setBuzzLoading(false) })
    }
  }, [tab, result, buzz, buzzLoading, tradeLicenses.length, city.features.tradeLicenses, city.features.buzz, city.subreddit])

  // ── STATS: constituency-level data ───────────────────────
  useEffect(() => {
    if (tab !== "stats" || !result?.assembly_constituency) return
    if (!wardStats) fetchWardStats(result.assembly_constituency).then(setWardStats)
    if (city.features.propertyTax && !propertyTax) {
      fetchPropertyTax(result.assembly_constituency).then(setPropertyTax)
    }
    if (city.features.sakala && !sakala) {
      fetchSakalaPerformance(result.assembly_constituency).then(setSakala)
    }
  }, [tab, wardStats, propertyTax, sakala, result?.assembly_constituency, city.features.propertyTax, city.features.sakala])

  // ── STATS: ward-name-level data ───────────────────────────
  useEffect(() => {
    if (tab !== "stats" || !result?.ward_name || grievances.length > 0) return
    if (city.features.grievances) fetchWardGrievances(result.ward_name).then(setGrievances)
  }, [tab, grievances, result?.ward_name, city.features.grievances])

  // ── STATS: ward-number-level data ─────────────────────────
  useEffect(() => {
    if (tab !== "stats" || !result?.ward_no) return
    if (city.features.wardPotholes && !potholes) fetchWardPotholes(result.ward_no).then(setPotholes)
    if (city.features.wardSpend && !wardSpend) fetchWardSpend(result.ward_no).then(setWardSpend)
  }, [tab, potholes, wardSpend, result?.ward_no, city.features.wardPotholes, city.features.wardSpend])

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
    city,
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
