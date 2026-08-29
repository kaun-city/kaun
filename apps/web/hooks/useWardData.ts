"use client"

import { useEffect, useState } from "react"
import type {
  BudgetSummary, CommunityFact, ContractorProfile, Department, GbaContact, LocalOffice,
  MlaLadFunds, PinResult, PropertyTaxData, RedditPost, RepReportCard,
  SakalaPerformance, WardAirQuality, WardAmenities, WardBusStats, WardCommitteeMeetings, WardGrievances, WardInfraStats, WardPotholes,
  WardProfile, WardRoadCrashes, WardSpendCategory, WardStats, WardTradeLicenses, WardWaterQuality, WorkOrder,
} from "@/lib/types"
import {
  fetchBudgetSummary, fetchBuzz, fetchCorpContacts, fetchDepartments,
  fetchMlaLadFunds, fetchPropertyTax, fetchRepReportCard, fetchSakalaPerformance,
  fetchTradeLicenses, fetchWardAirQuality, fetchWardAmenities, fetchWardBusStats, fetchWardCommitteeMeetings, fetchWardContractors, fetchWardGrievances, fetchWardInfraStats,
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
  const wardNo = result?.found ? result.ward_no : undefined
  const cityId = result?.city_id ?? city.id
  const assemblyConstituency = result?.assembly_constituency ?? undefined

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
  const [wardContractors, setWardContractors] = useState<ContractorProfile[]>([])
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
    setWardContractors([])
    setTradeLicenses([])
    setBuzz(null)
    setBuzzLoading(false)
    setWardStats(null)
    setGrievances([])
    setPotholes(null)
    setInfraStats(null)
    setReportCount(0)
    setSignals([])
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
  }, [wardNo, cityId])

  // ── Profile (always) ─────────────────────────────────────
  useEffect(() => {
    if (!wardNo) return
    let active = true
    setProfileLoading(true)
    void fetchWardProfile(wardNo, cityId, assemblyConstituency).then(value => {
      if (!active) return
      setProfile(value)
      setProfileLoading(false)
    })
    return () => { active = false }
  }, [wardNo, cityId, assemblyConstituency])

  // ── WHO: unknowns (always-fetch) ──────────────────────────
  useEffect(() => {
    if (!wardNo) return
    let active = true
    void fetchWardUnknowns(wardNo, cityId).then(value => {
      if (active) setUnknowns(value)
    })
    return () => { active = false }
  }, [wardNo, cityId])

  // ── WHO: accountability records ──────────────────────────
  useEffect(() => {
    if (!wardNo) return
    let active = true

    if (city.features.wardCommitteeMeetings) {
      void fetchWardCommitteeMeetings(wardNo).then(value => {
        if (active) setCommitteeMeetings(value)
      })
    }
    if (assemblyConstituency && city.features.mlaLadFunds) {
      void fetchMlaLadFunds(assemblyConstituency).then(value => {
        if (active) setLadFunds(value ?? [])
      })
    }
    if (assemblyConstituency && city.features.repReportCards) {
      void fetchRepReportCard(assemblyConstituency).then(value => {
        if (active) setReportCard(value)
      })
    }

    return () => { active = false }
  }, [wardNo, assemblyConstituency, city.features.wardCommitteeMeetings, city.features.mlaLadFunds, city.features.repReportCards])

  // ── Local offices + corporation contacts ─────────────────
  useEffect(() => {
    if (!result?.lat || !result.lng) return
    let active = true
    void lookupLocalOffices(result.lat, result.lng).then(async offices => {
      if (!active) return
      setLocalOffices(offices)
      const corporation = offices.find(office => office.boundary_type === "gba_corporation")
      if (!corporation) return
      setCorpName(corporation.name)
      const contacts = await fetchCorpContacts(corporation.name)
      if (active) setCorpContacts(contacts)
    })
    return () => { active = false }
  }, [result?.lat, result?.lng])

  // ── SPEND tab ─────────────────────────────────────────────
  useEffect(() => {
    if (tab !== "spend" || !wardNo) return
    let active = true
    const wardName = result?.ward_name

    if (city.features.budget) {
      void fetchBudgetSummary(city.budgetYear).then(value => { if (active) setBudget(value) })
    }
    if (city.features.workOrders) {
      void fetchWorkOrders(wardNo, cityId).then(value => { if (active) setWorkOrders(value) })
    }
    if (wardName && city.features.tradeLicenses) {
      void fetchTradeLicenses(wardName, cityId).then(value => { if (active) setTradeLicenses(value) })
    }
    if (assemblyConstituency && city.features.propertyTax) {
      void fetchPropertyTax(assemblyConstituency, cityId).then(value => { if (active) setPropertyTax(value) })
    }
    if (city.features.wardSpend) {
      void fetchWardSpend(wardNo, cityId).then(value => { if (active) setWardSpend(value) })
    }

    return () => { active = false }
  }, [tab, wardNo, cityId, result?.ward_name, assemblyConstituency, city.budgetYear, city.features.budget, city.features.workOrders, city.features.tradeLicenses, city.features.propertyTax, city.features.wardSpend])

  // ── CITIZEN tab ───────────────────────────────────────────
  useEffect(() => {
    if (tab !== "citizen" || !wardNo) return
    let active = true
    const wardName = result?.ward_name

    if (assemblyConstituency) {
      void fetchWardStats(assemblyConstituency, cityId).then(value => { if (active) setWardStats(value) })
    }
    if (wardName && city.features.buzz) {
      setBuzzLoading(true)
      void fetchBuzz(wardName, city.subreddit).then(value => {
        if (!active) return
        setBuzz(value)
        setBuzzLoading(false)
      })
    }
    void fetchWardBusStats(wardNo).then(value => { if (active) setWardBusStats(value) })
    void fetchWardRoadCrashes(wardNo).then(value => { if (active) setRoadCrashes(value) })
    void fetchWardAirQuality(wardNo).then(value => { if (active) setAirQuality(value) })
    if (city.features.wardAmenities) {
      void fetchWardAmenities(wardNo, cityId).then(value => { if (active) setAmenities(value) })
    }
    if (city.features.wardWaterQuality) {
      void fetchWardWaterQuality(wardNo, cityId).then(value => { if (active) setWaterQuality(value) })
    }

    return () => { active = false }
  }, [tab, wardNo, cityId, result?.ward_name, assemblyConstituency, city.subreddit, city.features.buzz, city.features.wardAmenities, city.features.wardWaterQuality])

  // ── REACH tab ─────────────────────────────────────────────
  useEffect(() => {
    if (tab !== "reach" || !wardNo) return
    let active = true

    void fetchDepartments(cityId).then(value => { if (active) setDepartments(value as Department[]) })
    if (assemblyConstituency && city.features.sakala) {
      void fetchSakalaPerformance(assemblyConstituency).then(value => { if (active) setSakala(value) })
    }
    if (result?.ward_name && city.features.grievances) {
      void fetchWardGrievances(result.ward_name, cityId).then(value => { if (active) setGrievances(value) })
    }

    return () => { active = false }
  }, [tab, wardNo, cityId, result?.ward_name, assemblyConstituency, city.features.sakala, city.features.grievances])

  // ── Eager ward context used by the header and story card ─
  useEffect(() => {
    if (!wardNo) return
    let active = true

    void fetchWardInfraStats(wardNo, cityId).then(value => { if (active) setInfraStats(value) })
    void fetchWardReportCount(wardNo, cityId).then(value => { if (active) setReportCount(value) })
    void fetchWardSignals(wardNo, cityId).then(value => { if (active) setSignals(value) })
    if (city.features.wardPotholes) {
      void fetchWardPotholes(wardNo, cityId).then(value => { if (active) setPotholes(value) })
    }
    if (city.features.workOrders) {
      void fetchWardContractors(wardNo, cityId).then(value => { if (active) setWardContractors(value) })
    }

    return () => { active = false }
  }, [wardNo, cityId, city.features.wardPotholes, city.features.workOrders])

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
    if (wardNo) void fetchWardUnknowns(wardNo, cityId).then(setUnknowns)
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
    budget, workOrders, wardContractors, tradeLicenses, buzz, buzzLoading,
    // stats
    wardStats, grievances, potholes, infraStats, wardBusStats, roadCrashes, airQuality, amenities, waterQuality,
    wardSpend, propertyTax, sakala, reportCount, signals,
    // report
    localOffices, departments,
  }
}
