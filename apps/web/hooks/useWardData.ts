"use client"

import { useEffect, useState } from "react"
import type {
  BudgetSummary, CommunityFact, Department, GbaContact, LocalOffice,
  MlaLadFunds, PinResult, PropertyTaxData, RedditPost, RepReportCard,
  SakalaPerformance, WardAirQuality, WardAmenities, WardBusStats, WardCommitteeMeetings, WardGrievances, WardInfraStats, WardPotholes,
  WardProfile, WardRoadCrashes, WardSpendCategory, WardStats, WardTradeLicenses, WardWaterQuality, WorkOrder,
} from "@/lib/types"
import {
  fetchBudgetSummary, fetchBuzz, fetchCorpContacts, fetchDepartments,
  fetchMlaLadFunds, fetchPropertyTax, fetchRepReportCard, fetchSakalaPerformance,
  fetchTradeLicenses, fetchWardAirQuality, fetchWardAmenities, fetchWardBusStats, fetchWardCommitteeMeetings, fetchWardGrievances, fetchWardInfraStats,
  fetchWardPotholes, fetchWardProfile, fetchWardReportCount, fetchWardRoadCrashes, fetchWardSignals, fetchWardSpend, fetchWardStats,
  fetchWardUnknowns, fetchWardWaterQuality, fetchWorkOrders, lookupLocalOffices, voteFact,
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
  const [infraStats, setInfraStats] = useState<WardInfraStats | null>(null)
  const [reportCount, setReportCount]   = useState<number>(0)
  const [signals, setSignals]           = useState<import("@/lib/api").CivicSignal[]>([])
  const [wardBusStats, setWardBusStats] = useState<WardBusStats | null>(null)
  const [roadCrashes, setRoadCrashes]   = useState<WardRoadCrashes | null>(null)
  const [airQuality, setAirQuality]     = useState<WardAirQuality | null>(null)
  const [amenities, setAmenities]       = useState<WardAmenities | null>(null)
  const [waterQuality, setWaterQuality] = useState<WardWaterQuality[]>([])
  const [wardSpend, setWardSpend] = useState<WardSpendCategory | null>(null)
  const [propertyTax, setPropertyTax] = useState<PropertyTaxData | null>(null)
  const [sakala, setSakala] = useState<SakalaPerformance | null>(null)

  // ── REPORT tab ────────────────────────────────────────────
  const [localOffices, setLocalOffices] = useState<LocalOffice[]>([])
  const [departments, setDepartments] = useState<Department[]>([])

  // ── Tab state ─────────────────────────────────────────────
  const [tab, setTab] = useState<"who" | "spend" | "citizen" | "reach">("who")

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
    setInfraStats(null)
    setWardBusStats(null)
    setRoadCrashes(null)
    setAirQuality(null)
    setAmenities(null)
    setWaterQuality([])
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

  // ── Local offices + corp contacts (WHO + REACH) ──────────
  useEffect(() => {
    if (tab !== "reach" && tab !== "who") return
    if (tab === "reach" && departments.length === 0) {
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

  // ── SPEND: budget + work orders ──────────────────────────
  useEffect(() => {
    if (tab !== "spend" || !result?.ward_no) return
    if (city.features.budget && !budget) {
      fetchBudgetSummary(city.budgetYear).then(setBudget)
    }
    if (city.features.workOrders && workOrders.length === 0) {
      fetchWorkOrders(result.ward_no).then(setWorkOrders)
    }
  }, [tab, budget, workOrders.length, result?.ward_no, city.features.budget, city.features.workOrders, city.budgetYear])

  // ── SPEND: trade licenses + ward spend + property tax ────
  useEffect(() => {
    if (tab !== "spend" || !result?.found || !result.ward_name) return
    if (city.features.tradeLicenses && tradeLicenses.length === 0) {
      fetchTradeLicenses(result.ward_name).then(setTradeLicenses)
    }
  }, [tab, result, tradeLicenses.length, city.features.tradeLicenses])

  useEffect(() => {
    if (tab !== "spend" || !result?.assembly_constituency) return
    if (city.features.propertyTax && !propertyTax) {
      fetchPropertyTax(result.assembly_constituency).then(setPropertyTax)
    }
  }, [tab, propertyTax, result?.assembly_constituency, city.features.propertyTax])

  // ── CITIZEN: demographics + buzz ─────────────────────────
  useEffect(() => {
    if (tab !== "citizen" || !result?.assembly_constituency) return
    if (!wardStats) fetchWardStats(result.assembly_constituency).then(setWardStats)
  }, [tab, wardStats, result?.assembly_constituency])

  useEffect(() => {
    if (tab !== "citizen" || !result?.found || !result.ward_name) return
    if (city.features.buzz && buzz === null && !buzzLoading) {
      setBuzzLoading(true)
      fetchBuzz(result.ward_name, city.subreddit).then(posts => { setBuzz(posts); setBuzzLoading(false) })
    }
  }, [tab, result, buzz, buzzLoading, city.features.buzz, city.subreddit])

  // ── REACH: grievances + sakala ────────────────────────────
  useEffect(() => {
    if (tab !== "reach" || !result?.assembly_constituency) return
    if (city.features.sakala && !sakala) {
      fetchSakalaPerformance(result.assembly_constituency).then(setSakala)
    }
  }, [tab, sakala, result?.assembly_constituency, city.features.sakala])

  useEffect(() => {
    if (tab !== "reach" || !result?.ward_name || grievances.length > 0) return
    if (city.features.grievances) fetchWardGrievances(result.ward_name).then(setGrievances)
  }, [tab, grievances, result?.ward_name, city.features.grievances])

  // ── WHO + CITIZEN: infra stats (needed for story card on WHO tab) ──
  useEffect(() => {
    if (!result?.ward_no || infraStats) return
    fetchWardInfraStats(result.ward_no).then(setInfraStats)
  }, [result?.ward_no, infraStats])

  useEffect(() => {
    if (!result?.ward_no) return
    fetchWardReportCount(result.ward_no).then(setReportCount)
    fetchWardSignals(result.ward_no).then(setSignals)
  }, [result?.ward_no])

  // ── CITIZEN: potholes ────────────────────────────────────
  useEffect(() => {
    if (tab !== "citizen" || !result?.ward_no) return
    if (city.features.wardPotholes && !potholes) fetchWardPotholes(result.ward_no).then(setPotholes)
  }, [tab, potholes, result?.ward_no, city.features.wardPotholes])

  // ── CITIZEN: bus stats + road crashes + air quality ──────
  useEffect(() => {
    if (tab !== "citizen" || !result?.ward_no) return
    if (!wardBusStats) fetchWardBusStats(result.ward_no).then(setWardBusStats)
    if (!roadCrashes)  fetchWardRoadCrashes(result.ward_no).then(setRoadCrashes)
    if (!airQuality)   fetchWardAirQuality(result.ward_no).then(setAirQuality)
    if (city.features.wardAmenities && !amenities) fetchWardAmenities(result.ward_no).then(setAmenities)
    if (city.features.wardWaterQuality && waterQuality.length === 0) fetchWardWaterQuality(result.ward_no).then(setWaterQuality)
  }, [tab, result?.ward_no, wardBusStats, roadCrashes, airQuality, amenities, waterQuality.length, city.features.wardAmenities, city.features.wardWaterQuality])

  // ── SPEND: ward-number-level data (ward spend) ────────────
  useEffect(() => {
    if (tab !== "spend" || !result?.ward_no) return
    if (city.features.wardSpend && !wardSpend) fetchWardSpend(result.ward_no).then(setWardSpend)
  }, [tab, wardSpend, result?.ward_no, city.features.wardSpend])

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
    wardStats, grievances, potholes, infraStats, wardBusStats, roadCrashes, airQuality, amenities, waterQuality,
    wardSpend, propertyTax, sakala, reportCount, signals,
    // report
    localOffices, departments,
  }
}
