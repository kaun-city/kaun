"use client"

import { useEffect, useMemo, useState } from "react"
import type {
  BudgetSummary, CommunityFact, ContractorProfile, Department, ElectedRep, GbaContact, LocalOffice,
  MlaLadFunds, PinResult, PropertyTaxData, RedditPost, RepReportCard,
  SakalaPerformance, WardAirQuality, WardAmenities, WardBusStats, WardCommitteeMeetings, WardGrievances, WardInfraStats, WardPotholes,
  WardProfile, WardRoadCrashes, WardSpendCategory, WardStats, WardTradeLicenses, WardWaterQuality, WorkOrder,
} from "@/lib/types"
import {
  fetchBudgetSummary, fetchBuzz, fetchCorpContacts, fetchDepartments, fetchElectedReps,
  fetchMlaLadFunds, fetchPropertyTax, fetchRepReportCard, fetchSakalaPerformance,
  fetchTradeLicenses, fetchWardAirQuality, fetchWardAmenities, fetchWardBusStats, fetchWardCommitteeMeetings, fetchWardContractors, fetchWardGrievances, fetchWardInfraStats,
  fetchWardPotholes, fetchWardProfile, fetchWardReportCount, fetchWardRoadCrashes, fetchWardSignals, fetchWardSpend, fetchWardStats,
  fetchWardUnknowns, fetchWardWaterQuality, fetchWorkOrders, lookupLocalOffices, voteFact,
} from "@/lib/api"
import { getCity } from "@/lib/cities"
import type { CityConfig } from "@/lib/cities"
import { getVoterToken, groupOfficerFacts } from "@/lib/ward-utils"
import type { HistoricalWardRef } from "@/lib/gba-crosswalk"

export type WardUnknowns = {
  total_questions: number
  answered: number
  unanswered: Array<{ category: string; subject: string; field: string; prompt: string; icon: string; priority: number }>
}

export type ShowAddFor = { category: string; subject: string; field: string; prompt: string }

const LEGACY_FALLBACK_REF = (wardNo: number, wardName: string | null): HistoricalWardRef => ({
  ward_no: wardNo,
  ward_name: wardName ?? `Ward ${wardNo}`,
  current_share: 1,
  legacy_share: 1,
})

function weightedNumber<T>(rows: Array<{ value: T; ref: HistoricalWardRef }>, read: (value: T) => number | null | undefined): number {
  return rows.reduce((sum, row) => sum + (Number(read(row.value)) || 0) * row.ref.legacy_share, 0)
}

function uniqueBy<T>(values: T[], key: (value: T) => string | number): T[] {
  return [...new Map(values.map(value => [key(value), value])).values()]
}

export function useWardData(result: PinResult | null) {
  // Resolve city config from result
  const city: CityConfig = getCity(result?.city_id)
  const historicalWards = useMemo(() => {
    if (!result?.found) return []
    if (result.historical_wards?.length) return result.historical_wards
    return result.ward_no ? [LEGACY_FALLBACK_REF(result.ward_no, result.ward_name)] : []
  }, [result])
  const wardNo = historicalWards[0]?.ward_no
  const cityId = result?.city_id ?? city.id
  const assemblyConstituency = result?.gba_ac ?? result?.assembly_constituency ?? undefined
  const currentWardName = result?.gba_ward_name ?? result?.ward_name ?? "Current ward"

  // ── Profile ──────────────────────────────────────────────
  const [profile, setProfile] = useState<WardProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [electedReps, setElectedReps] = useState<ElectedRep[]>([])

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
    setElectedReps([])
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
  }, [wardNo, cityId, result?.gba_corporation_id, result?.gba_ward_no])

  // ── Profile (always) ─────────────────────────────────────
  useEffect(() => {
    if (!wardNo && !assemblyConstituency) return
    let active = true
    setProfileLoading(true)
    if (assemblyConstituency) {
      void fetchElectedReps(assemblyConstituency, cityId).then(value => {
        if (active) setElectedReps(value)
      })
    }
    if (wardNo) {
      void fetchWardProfile(wardNo, cityId, assemblyConstituency).then(value => {
        if (!active) return
        setProfile(value)
        if (value?.elected_reps?.length) setElectedReps(value.elected_reps)
        setProfileLoading(false)
      })
    } else {
      setProfileLoading(false)
    }
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
    let active = true

    if (wardNo && city.features.wardCommitteeMeetings) {
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
    if (!result?.lat || !result.lng) {
      if (result?.gba_corporation) {
        setCorpName(result.gba_corporation)
        void fetchCorpContacts(result.gba_corporation).then(setCorpContacts)
      }
      return
    }
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
  }, [result?.lat, result?.lng, result?.gba_corporation])

  // ── SPEND tab ─────────────────────────────────────────────
  useEffect(() => {
    if (tab !== "spend") return
    let active = true

    if (city.features.budget) {
      void fetchBudgetSummary(city.budgetYear).then(value => { if (active) setBudget(value) })
    }
    if (historicalWards.length && city.features.workOrders) {
      void Promise.all(historicalWards.map(ref => fetchWorkOrders(ref.ward_no, cityId))).then(groups => {
        if (active) setWorkOrders(uniqueBy(groups.flat(), row => row.work_order_id || row.id))
      })
    }
    if (historicalWards.length && city.features.tradeLicenses) {
      void Promise.all(historicalWards.map(ref => fetchTradeLicenses(ref.ward_name, cityId))).then(values => {
        if (active) setTradeLicenses(values.flat())
      })
    }
    if (assemblyConstituency && city.features.propertyTax) {
      void fetchPropertyTax(assemblyConstituency, cityId).then(value => { if (active) setPropertyTax(value) })
    }
    if (historicalWards.length && city.features.wardSpend) {
      void Promise.all(historicalWards.map(async ref => ({ ref, value: await fetchWardSpend(ref.ward_no, cityId) }))).then(results => {
        if (!active) return
        const rows = results.filter((row): row is { ref: HistoricalWardRef; value: WardSpendCategory } => !!row.value)
        if (!rows.length) return setWardSpend(null)
        const fields: Array<keyof WardSpendCategory> = ["buildings_facilities", "drainage", "roads_and_drains", "roads_and_infrastructure", "streetlighting", "waste_management", "water_and_sanitation", "grand_total"]
        const estimate = { ward_no: 0, ward_name: currentWardName, period: rows[0].value.period } as WardSpendCategory
        for (const field of fields) Object.assign(estimate, { [field]: weightedNumber(rows, value => Number(value[field])) })
        setWardSpend(estimate)
      })
    }

    return () => { active = false }
  }, [tab, wardNo, cityId, result?.ward_name, historicalWards, currentWardName, assemblyConstituency, city.budgetYear, city.features.budget, city.features.workOrders, city.features.tradeLicenses, city.features.propertyTax, city.features.wardSpend])

  // ── CITIZEN tab ───────────────────────────────────────────
  useEffect(() => {
    if (tab !== "citizen") return
    let active = true
    const wardName = result?.ward_name ?? historicalWards[0]?.ward_name

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
    if (historicalWards.length) {
      void Promise.all(historicalWards.map(async ref => ({ ref, value: await fetchWardBusStats(ref.ward_no) }))).then(results => {
        const rows = results.filter((row): row is { ref: HistoricalWardRef; value: WardBusStats } => !!row.value)
        if (active && rows.length) setWardBusStats({ ward_no: 0, stop_count: Math.round(weightedNumber(rows, v => v.stop_count)), total_trips: Math.round(weightedNumber(rows, v => v.total_trips)) })
      })
      void Promise.all(historicalWards.map(async ref => ({ ref, value: await fetchWardRoadCrashes(ref.ward_no) }))).then(results => {
        const rows = results.filter((row): row is { ref: HistoricalWardRef; value: WardRoadCrashes } => !!row.value)
        if (!active || !rows.length) return
        setRoadCrashes({ ward_no: 0, crashes_2024: Math.round(weightedNumber(rows, v => v.crashes_2024)), fatal_2024: Math.round(weightedNumber(rows, v => v.fatal_2024)), crashes_2025: Math.round(weightedNumber(rows, v => v.crashes_2025)), fatal_2025: Math.round(weightedNumber(rows, v => v.fatal_2025)) })
      })
      void Promise.all(historicalWards.map(ref => fetchWardAirQuality(ref.ward_no))).then(values => {
        if (active) setAirQuality(values.find(Boolean) ?? null)
      })
    }
    if (historicalWards.length && city.features.wardAmenities) {
      void Promise.all(historicalWards.map(async ref => ({ ref, value: await fetchWardAmenities(ref.ward_no, cityId) }))).then(results => {
        const rows = results.filter((row): row is { ref: HistoricalWardRef; value: WardAmenities } => !!row.value)
        if (!active || !rows.length) return
        const fields: Array<keyof WardAmenities> = ["hospitals", "clinics", "pharmacies", "atms", "banks", "public_toilets", "ev_charging", "petrol_pumps", "post_offices", "libraries", "community_halls", "places_of_worship", "restaurants", "cafes", "metro_stations"]
        const estimate = { ward_no: 0, city_id: cityId, data_source: "Historical 243-ward overlap estimate", updated_at: rows[0].value.updated_at } as WardAmenities
        for (const field of fields) Object.assign(estimate, { [field]: Math.round(weightedNumber(rows, value => Number(value[field]))) })
        setAmenities(estimate)
      })
    }
    if (historicalWards.length && city.features.wardWaterQuality) {
      void Promise.all(historicalWards.map(ref => fetchWardWaterQuality(ref.ward_no, cityId))).then(values => {
        if (active) setWaterQuality(uniqueBy(values.flat(), row => `${row.water_body_name}:${row.data_year}`))
      })
    }

    return () => { active = false }
  }, [tab, wardNo, cityId, result?.ward_name, historicalWards, assemblyConstituency, city.subreddit, city.features.buzz, city.features.wardAmenities, city.features.wardWaterQuality])

  // ── REACH tab ─────────────────────────────────────────────
  useEffect(() => {
    if (tab !== "reach") return
    let active = true

    void fetchDepartments(cityId).then(value => { if (active) setDepartments(value as Department[]) })
    if (assemblyConstituency && city.features.sakala) {
      void fetchSakalaPerformance(assemblyConstituency).then(value => { if (active) setSakala(value) })
    }
    if (historicalWards.length && city.features.grievances) {
      void Promise.all(historicalWards.map(ref => fetchWardGrievances(ref.ward_name, cityId))).then(values => {
        if (active) setGrievances(values.flat())
      })
    }

    return () => { active = false }
  }, [tab, wardNo, cityId, historicalWards, assemblyConstituency, city.features.sakala, city.features.grievances])

  // ── Eager ward context used by the header and story card ─
  useEffect(() => {
    if (!historicalWards.length) return
    let active = true

    void Promise.all(historicalWards.map(async ref => ({ ref, value: await fetchWardInfraStats(ref.ward_no, cityId) }))).then(results => {
      const rows = results.filter((row): row is { ref: HistoricalWardRef; value: WardInfraStats } => !!row.value)
      if (active && rows.length) setInfraStats({ ward_no: 0, ward_name: currentWardName, signal_count: Math.round(weightedNumber(rows, v => v.signal_count)), bus_stop_count: Math.round(weightedNumber(rows, v => v.bus_stop_count)), daily_trips: Math.round(weightedNumber(rows, v => v.daily_trips)) })
    })
    void Promise.all(historicalWards.map(async ref => ({ ref, value: await fetchWardReportCount(ref.ward_no, cityId) }))).then(rows => {
      if (active) setReportCount(Math.round(weightedNumber(rows, value => value)))
    })
    void Promise.all(historicalWards.map(ref => fetchWardSignals(ref.ward_no, cityId))).then(values => {
      if (active) setSignals(uniqueBy(values.flat(), row => row.id))
    })
    if (city.features.wardPotholes) {
      void Promise.all(historicalWards.map(async ref => ({ ref, value: await fetchWardPotholes(ref.ward_no, cityId) }))).then(results => {
        const rows = results.filter((row): row is { ref: HistoricalWardRef; value: WardPotholes } => !!row.value)
        if (active && rows.length) setPotholes({ ward_no: 0, ward_name: currentWardName, complaints: Math.round(weightedNumber(rows, v => v.complaints)), data_year: rows[0].value.data_year })
      })
    }
    if (city.features.workOrders) {
      void Promise.all(historicalWards.map(ref => fetchWardContractors(ref.ward_no, cityId))).then(values => {
        if (active) setWardContractors(uniqueBy(values.flat(), row => row.entity_id))
      })
    }

    return () => { active = false }
  }, [historicalWards, currentWardName, cityId, city.features.wardPotholes, city.features.workOrders])

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
    historicalWards,
    // tab
    tab, setTab,
    // profile
    profile, profileLoading, electedReps,
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
