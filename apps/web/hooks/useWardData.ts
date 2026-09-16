"use client"

import { useEffect, useMemo, useState } from "react"
import type {
  BudgetSummary, CommunityFact, ContractorProfile, Department, ElectedRep, GbaContact, LocalOffice,
  MlaLadFunds, PinResult, PropertyTaxData, RepReportCard,
  SakalaPerformance, WardAirQuality, WardAmenities, WardBusStats, WardCommitteeMeetings, WardGrievances, WardInfraStats, WardPotholes,
  WardProfile, WardRoadCrashes, WardSpendCategory, WardStats, WardTradeLicenses, WardWaterQuality, WorkOrder,
} from "@/lib/types"
import {
  fetchBudgetSummary, fetchCorpContacts, fetchDepartments, fetchElectedReps,
  fetchMlaLadFunds, fetchPropertyTax, fetchRepReportCard, fetchSakalaPerformance,
  fetchTradeLicenses, fetchWardAirQuality, fetchWardAmenities, fetchWardBusStats, fetchWardCommitteeMeetingsByBbmp198, fetchWardContractors, fetchWardGrievances, fetchWardInfraStats,
  fetchWardPotholesByBbmp198, fetchWardProfile, fetchWardReportCount, fetchWardRoadCrashes, fetchWardSignals, fetchWardSpendByBbmp198, fetchWardStats,
  fetchWardUnknowns, fetchWardWaterQuality, fetchWorkOrders, loadBbmp198Crosswalk, lookupLocalOffices, voteFact,
} from "@/lib/api"
import { getCity } from "@/lib/cities"
import { BBMP_198_RECORDS_ATTRIBUTABLE } from "@/lib/ward-data-quality"
import type { CityConfig } from "@/lib/cities"
import { getVoterToken, groupOfficerFacts } from "@/lib/ward-utils"
import { attributableHistoricalWards, type HistoricalWardRef } from "@/lib/gba-crosswalk"
import { allocateBbmp198, attributableBbmp198WardsForHistoricalWards, bbmp198AllocationWeights } from "@/lib/bbmp198-crosswalk"
import { preferredElectedReps } from "@/lib/current-ward"

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

export { BBMP_198_RECORDS_ATTRIBUTABLE } from "@/lib/ward-data-quality"

/**
 * ward_infra_stats.bus_stop_count and daily_trips are not read directly:
 * until migration 20260917 is applied, bmtc_stops holds ~14 rows per physical
 * stop (42,529 rows, 2,972 locations) and the view's traffic-signal join
 * multiplies daily_trips by the signal count. Bus figures come from
 * ward_bus_stops on every surface: today a static table equal to a
 * deduplicated spatial join, after the migration a view over the fixed
 * ward_infra_stats (see lib/ward-data-quality.ts). signal_count is a DISTINCT
 * count.
 */

export function useWardData(result: PinResult | null) {
  // Resolve city config from result
  const city: CityConfig = getCity(result?.city_id)
  const historicalWards = useMemo(() => {
    if (!result?.found) return []
    if (result.historical_wards?.length) return result.historical_wards
    return result.ward_no ? [LEGACY_FALLBACK_REF(result.ward_no, result.ward_name)] : []
  }, [result])
  // Additive totals (spend, amenities, signals counts…) use the full overlap
  // vector weighted by legacy_share. Record *lists* (work orders, contractors,
  // signals, grievances, licences, water/air readings) may only come from
  // former wards that overlap materially (>= 10% both ways, primary always).
  const recordWards = useMemo(() => attributableHistoricalWards(historicalWards), [historicalWards])
  const wardNo = historicalWards[0]?.ward_no
  const cityId = result?.city_id ?? city.id
  // Two current wards can share a primary former ward (Varthur/Gunjur -> 112),
  // so identity-scoped fetches must key on the current ward, not just wardNo.
  const wardIdentity = `${cityId}|${result?.gba_corporation_id ?? ""}|${result?.gba_ward_no ?? ""}|${wardNo ?? ""}`
  const assemblyConstituency = result?.gba_ac ?? result?.assembly_constituency ?? undefined
  const currentWardName = result?.gba_ward_name ?? result?.ward_name ?? "Current ward"

  // ── Profile ──────────────────────────────────────────────
  const [profile, setProfile] = useState<WardProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [mlaReps, setMlaReps] = useState<ElectedRep[]>([])

  // ── WHO tab ──────────────────────────────────────────────
  const [extraFacts, setExtraFacts] = useState<CommunityFact[]>([])
  const [unknowns, setUnknowns] = useState<WardUnknowns | null>(null)
  const [showAddFor, setShowAddFor] = useState<ShowAddFor | null>(null)
  /** Former BBMP-198 ward committees that materially overlap this ward, largest overlap first. Never summed. */
  const [committeeMeetings, setCommitteeMeetings] = useState<WardCommitteeMeetings[]>([])
  const [reportCard, setReportCard] = useState<RepReportCard | null>(null)
  const [ladFunds, setLadFunds] = useState<MlaLadFunds[]>([])
  const [corpContacts, setCorpContacts] = useState<GbaContact[]>([])
  const [corpName, setCorpName] = useState<string | null>(null)

  // ── EXPENSES tab ─────────────────────────────────────────
  const [budget, setBudget] = useState<BudgetSummary | null>(null)
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [wardContractors, setWardContractors] = useState<ContractorProfile[]>([])
  const [tradeLicenses, setTradeLicenses] = useState<WardTradeLicenses[]>([])
  /** Ward spend has been fetched for this ward (rows or none). Until then the spend tab shows a skeleton, not "no data". */
  const [wardSpendSettled, setWardSpendSettled] = useState(false)

  // ── Settled flags for what the headline and snapshot rank ──
  // A source is "settled" once its fetch has resolved (with or without a row)
  // or once it is known not to apply. The headline waits for all of them so
  // it never shows one finding and then swaps to another.
  const [reportCardSettled, setReportCardSettled] = useState(false)
  const [committeeSettled, setCommitteeSettled] = useState(false)
  const [infraSettled, setInfraSettled] = useState(false)
  const [contractorsSettled, setContractorsSettled] = useState(false)
  const [potholesSettled, setPotholesSettled] = useState(false)
  // The ward the flags above belong to. On the first render after a ward
  // change the reset effect has not run yet, so the previous ward's flags (and
  // data) are still in state; this keeps its headline from flashing.
  const [settledIdentity, setSettledIdentity] = useState<string | null>(null)

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
    setMlaReps([])
    setExtraFacts([])
    setUnknowns(null)
    setShowAddFor(null)
    setCommitteeMeetings([])
    setReportCard(null)
    setLadFunds([])
    setCorpContacts([])
    setCorpName(null)
    setBudget(null)
    setWorkOrders([])
    setWardContractors([])
    setTradeLicenses([])
    setWardSpendSettled(false)
    setSettledIdentity(wardIdentity)
    setReportCardSettled(false)
    setCommitteeSettled(false)
    setInfraSettled(false)
    setContractorsSettled(false)
    setPotholesSettled(false)
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
  }, [wardIdentity])

  // ── Profile (always) ─────────────────────────────────────
  useEffect(() => {
    if (!wardNo && !assemblyConstituency) return
    let active = true
    setProfileLoading(true)
    if (assemblyConstituency) {
      void fetchElectedReps(assemblyConstituency, cityId).then(value => {
        if (active) setMlaReps(value)
      })
    }
    if (wardNo) {
      void fetchWardProfile(wardNo, cityId, assemblyConstituency).then(value => {
        if (!active) return
        setProfile(value)
        setProfileLoading(false)
      })
    } else {
      setProfileLoading(false)
    }
    return () => { active = false }
  }, [wardIdentity, wardNo, cityId, assemblyConstituency])
  // Derived, not raced: the profile's MLA+MP+corporator list always wins.
  const electedReps = useMemo(() => preferredElectedReps(profile?.elected_reps, mlaReps), [profile, mlaReps])

  // ── WHO: unknowns (always-fetch) ──────────────────────────
  useEffect(() => {
    if (!wardNo) return
    let active = true
    void fetchWardUnknowns(wardNo, cityId).then(value => {
      if (active) setUnknowns(value)
    })
    return () => { active = false }
  }, [wardIdentity, wardNo, cityId])

  // ── WHO: accountability records ──────────────────────────
  useEffect(() => {
    let active = true

    if (historicalWards.length && city.features.wardCommitteeMeetings && BBMP_198_RECORDS_ATTRIBUTABLE) {
      // A committee's meeting count belongs to that committee: name each
      // materially overlapping former 198-ward committee, never split or sum.
      void loadBbmp198Crosswalk().then(async index => {
        const committees = index ? attributableBbmp198WardsForHistoricalWards(historicalWards, index) : []
        const rows = await fetchWardCommitteeMeetingsByBbmp198(committees.map(committee => committee.ward_no))
        if (!active) return
        const order = new Map(committees.map((committee, position) => [committee.ward_no, position]))
        setCommitteeMeetings(rows.sort((a, b) => (order.get(a.ward_no) ?? 0) - (order.get(b.ward_no) ?? 0)))
        setCommitteeSettled(true)
      })
    } else {
      setCommitteeSettled(true)
    }
    if (assemblyConstituency && city.features.mlaLadFunds) {
      void fetchMlaLadFunds(assemblyConstituency).then(value => {
        if (active) setLadFunds(value ?? [])
      })
    }
    if (assemblyConstituency && city.features.repReportCards) {
      void fetchRepReportCard(assemblyConstituency).then(value => {
        if (!active) return
        setReportCard(value)
        setReportCardSettled(true)
      })
    } else {
      setReportCardSettled(true)
    }

    return () => { active = false }
  }, [wardIdentity, historicalWards, assemblyConstituency, city.features.wardCommitteeMeetings, city.features.mlaLadFunds, city.features.repReportCards])

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
    if (recordWards.length && city.features.workOrders) {
      void Promise.all(recordWards.map(ref => fetchWorkOrders(ref.ward_no, cityId))).then(groups => {
        if (active) setWorkOrders(uniqueBy(groups.flat(), row => row.work_order_id || row.id))
      })
    }
    if (recordWards.length && city.features.tradeLicenses) {
      void Promise.all(recordWards.map(ref => fetchTradeLicenses(ref.ward_name, cityId))).then(values => {
        if (active) setTradeLicenses(values.flat())
      })
    }
    if (assemblyConstituency && city.features.propertyTax) {
      void fetchPropertyTax(assemblyConstituency, cityId).then(value => { if (active) setPropertyTax(value) })
    }
    if (!historicalWards.length || !city.features.wardSpend || !BBMP_198_RECORDS_ATTRIBUTABLE) {
      setWardSpendSettled(true)
    } else {
      // Spend is recorded on the 198-ward map: allocate each 198 ward's total
      // by legacy_share (current -> 243) x bbmp198_share (243 -> 198).
      void loadBbmp198Crosswalk().then(async index => {
        const weights = index ? bbmp198AllocationWeights(historicalWards, index) : new Map<number, number>()
        const rows = await fetchWardSpendByBbmp198(weights.keys())
        if (!active) return
        setWardSpendSettled(true)
        if (!rows.length) return setWardSpend(null)
        const fields: Array<keyof WardSpendCategory> = ["buildings_facilities", "drainage", "roads_and_drains", "roads_and_infrastructure", "streetlighting", "waste_management", "water_and_sanitation", "grand_total"]
        const estimate = { ward_no: 0, ward_name: currentWardName, period: rows[0].period } as WardSpendCategory
        for (const field of fields) Object.assign(estimate, { [field]: allocateBbmp198(weights, rows, row => Number(row[field])) ?? 0 })
        setWardSpend(estimate)
      })
    }

    return () => { active = false }
  }, [tab, wardNo, cityId, result?.ward_name, historicalWards, recordWards, currentWardName, assemblyConstituency, city.budgetYear, city.features.budget, city.features.workOrders, city.features.tradeLicenses, city.features.propertyTax, city.features.wardSpend])

  // ── CITIZEN tab ───────────────────────────────────────────
  // Reddit "buzz" is not fetched: reddit.com blocks browser requests (CORS)
  // and nothing renders it. Ward Pulse covers resident signals.
  useEffect(() => {
    if (tab !== "citizen") return
    let active = true

    if (assemblyConstituency) {
      void fetchWardStats(assemblyConstituency, cityId).then(value => { if (active) setWardStats(value) })
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
      void Promise.all(recordWards.map(ref => fetchWardAirQuality(ref.ward_no))).then(values => {
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
    if (recordWards.length && city.features.wardWaterQuality) {
      void Promise.all(recordWards.map(ref => fetchWardWaterQuality(ref.ward_no, cityId))).then(values => {
        if (active) setWaterQuality(uniqueBy(values.flat(), row => `${row.water_body_name}:${row.data_year}`))
      })
    }

    return () => { active = false }
  }, [tab, wardNo, cityId, historicalWards, recordWards, assemblyConstituency, city.features.wardAmenities, city.features.wardWaterQuality])

  // ── REACH tab ─────────────────────────────────────────────
  useEffect(() => {
    if (tab !== "reach") return
    let active = true

    void fetchDepartments(cityId).then(value => { if (active) setDepartments(value as Department[]) })
    if (assemblyConstituency && city.features.sakala) {
      void fetchSakalaPerformance(assemblyConstituency).then(value => { if (active) setSakala(value) })
    }
    if (recordWards.length && city.features.grievances) {
      void Promise.all(recordWards.map(ref => fetchWardGrievances(ref.ward_name, cityId))).then(values => {
        if (active) setGrievances(values.flat())
      })
    }

    return () => { active = false }
  }, [tab, wardNo, cityId, recordWards, assemblyConstituency, city.features.sakala, city.features.grievances])

  // ── Eager ward context used by the header and story card ─
  useEffect(() => {
    if (!historicalWards.length) {
      // Current ward outside the older map: nothing ward-tagged to wait for.
      setInfraSettled(true)
      setContractorsSettled(true)
      setPotholesSettled(true)
      return
    }
    let active = true

    void Promise.all(historicalWards.map(async ref => ({ ref, value: await fetchWardInfraStats(ref.ward_no, cityId) }))).then(results => {
      if (!active) return
      const rows = results.filter((row): row is { ref: HistoricalWardRef; value: WardInfraStats } => !!row.value)
      // bus_stop_count / daily_trips are inflated in the view (see note at
      // the top); only signal_count is carried. Bus figures: wardBusStats.
      if (rows.length) setInfraStats({ ward_no: 0, ward_name: currentWardName, signal_count: Math.round(weightedNumber(rows, v => v.signal_count)), bus_stop_count: 0, daily_trips: 0 })
      setInfraSettled(true)
    })
    void Promise.all(historicalWards.map(async ref => ({ ref, value: await fetchWardReportCount(ref.ward_no, cityId) }))).then(rows => {
      if (active) setReportCount(Math.round(weightedNumber(rows, value => value)))
    })
    void Promise.all(recordWards.map(ref => fetchWardSignals(ref.ward_no, cityId))).then(values => {
      if (active) setSignals(uniqueBy(values.flat(), row => row.id))
    })
    if (city.features.wardPotholes && BBMP_198_RECORDS_ATTRIBUTABLE) {
      // Complaints are counted on the 198-ward map: allocate like spend.
      void loadBbmp198Crosswalk().then(async index => {
        const weights = index ? bbmp198AllocationWeights(historicalWards, index) : new Map<number, number>()
        const rows = await fetchWardPotholesByBbmp198(weights.keys())
        if (!active) return
        const complaints = allocateBbmp198(weights, rows, row => row.complaints)
        if (complaints != null) setPotholes({ ward_no: 0, ward_name: currentWardName, complaints: Math.round(complaints), data_year: rows[0].data_year })
        setPotholesSettled(true)
      })
    } else {
      setPotholesSettled(true)
    }
    if (city.features.workOrders) {
      void Promise.all(recordWards.map(ref => fetchWardContractors(ref.ward_no, cityId))).then(values => {
        if (!active) return
        const contractors = uniqueBy(values.flat(), row => row.entity_id)
        setWardContractors(contractors.sort((a, b) => (Number(b.total_value_lakh) || 0) - (Number(a.total_value_lakh) || 0)))
        setContractorsSettled(true)
      })
    } else {
      setContractorsSettled(true)
    }

    return () => { active = false }
  }, [historicalWards, recordWards, currentWardName, cityId, city.features.wardPotholes, city.features.workOrders])

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
    /** Full overlap vector: provenance for the additive, legacy_share-weighted estimates. */
    historicalWards,
    /** Former wards that ward-tagged record lists (work orders, contractors, signals, grievances, licences, water/air) are drawn from. */
    recordWards,
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
    budget, workOrders, wardContractors, tradeLicenses,
    // stats
    wardStats, grievances, potholes, infraStats, wardBusStats, roadCrashes, airQuality, amenities, waterQuality,
    wardSpend, wardSpendSettled, propertyTax, sakala, reportCount, signals,
    /** False while ward spend / potholes / committee meetings can't be matched to this ward (see BBMP_198_RECORDS_ATTRIBUTABLE). */
    bbmp198Attributable: BBMP_198_RECORDS_ATTRIBUTABLE,
    /** Every input the headline ranks has settled; render it only then so it never swaps. */
    headlineReady: settledIdentity === wardIdentity && reportCardSettled && committeeSettled && infraSettled && contractorsSettled,
    /** The headline inputs plus potholes: the evidence snapshot can draw without rows jumping in. */
    snapshotReady: settledIdentity === wardIdentity && reportCardSettled && committeeSettled && infraSettled && contractorsSettled && potholesSettled,
    // report
    localOffices, departments,
  }
}
