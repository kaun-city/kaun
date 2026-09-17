"use client"

import { useEffect, useMemo, useState } from "react"
import type { CommunityFact, LocalOffice, PinResult } from "@/lib/types"
import { fetchWardRoute, fetchWardUnknowns, loadBbmp198Crosswalk, lookupLocalOffices, voteFact } from "@/lib/api"
import { getCity } from "@/lib/cities"
import { BBMP_198_RECORDS_ATTRIBUTABLE } from "@/lib/ward-data-quality"
import type { CityConfig } from "@/lib/cities"
import { getVoterToken, groupOfficerFacts } from "@/lib/ward-utils"
import { attributableHistoricalWards } from "@/lib/gba-crosswalk"
import { preferredElectedReps } from "@/lib/current-ward"
import {
  LIVE_SECTIONS, RECORD_SECTIONS, buildWardLive, buildWardRecord, historicalWardsFor, wardRoutePath,
  type LoadSection, type WardLive, type WardRecord, type WardRecordSources, type WardUnknowns,
} from "@/lib/ward-record"

export type { LoadSection, WardUnknowns } from "@/lib/ward-record"
export { HEADLINE_SECTIONS, SNAPSHOT_SECTIONS } from "@/lib/ward-record"
export { BBMP_198_RECORDS_ATTRIBUTABLE } from "@/lib/ward-data-quality"

export type ShowAddFor = { category: string; subject: string; field: string; prompt: string }

/** A ward without a current GBA identity builds its record in the browser, from the public crosswalk assets. */
const BROWSER_SOURCES: WardRecordSources = { bbmp198Index: loadBbmp198Crosswalk }

/**
 * The ward card's data. A current GBA ward's record comes from Kaun's ward
 * route in two requests: the rarely-changing record (cached at the edge for a
 * day) and the live parts (reports, signals, unanswered questions, facts;
 * cached for a minute). A ward reached by an old ward number has no route, so
 * the same builders (lib/ward-record.ts) run here instead. Local offices depend
 * on the exact point, so they are read when the Reach tab opens.
 */
export function useWardData(result: PinResult | null) {
  // Resolve city config from result
  const city: CityConfig = getCity(result?.city_id)
  const historicalWards = useMemo(() => historicalWardsFor(result), [result])
  const recordWards = useMemo(() => attributableHistoricalWards(historicalWards), [historicalWards])
  const wardNo = historicalWards[0]?.ward_no
  const cityId = result?.city_id ?? city.id
  // Two current wards can share a primary former ward (Varthur/Gunjur -> 112),
  // so identity-scoped state must key on the current ward, not just wardNo.
  const wardIdentity = `${cityId}|${result?.gba_corporation_id ?? ""}|${result?.gba_ward_no ?? ""}|${wardNo ?? ""}`
  const routePath = wardRoutePath(result)

  // ── Record and live parts, tagged with the ward they belong to ──
  // On the first render after a ward change the previous ward's values are
  // still in state; the identity tag keeps them from showing (or flashing a
  // headline) until this ward's arrive.
  const [record, setRecord] = useState<{ identity: string; value: WardRecord | null; failed: boolean } | null>(null)
  const [live, setLive] = useState<{ identity: string; value: WardLive | null; failed: boolean } | null>(null)
  /** Bumped by retry(): the fetch effects list it, so they run again. */
  const [attempt, setAttempt] = useState(0)

  // ── WHO tab ──────────────────────────────────────────────
  const [extraFacts, setExtraFacts] = useState<CommunityFact[]>([])
  const [refreshedUnknowns, setRefreshedUnknowns] = useState<{ value: WardUnknowns | null } | null>(null)
  const [showAddFor, setShowAddFor] = useState<ShowAddFor | null>(null)

  // ── REACH tab: offices for the exact point ────────────────
  const [offices, setOffices] = useState<{ identity: string; value: LocalOffice[]; failed: boolean } | null>(null)

  // ── Tab state ─────────────────────────────────────────────
  const [tab, setTab] = useState<"who" | "spend" | "citizen" | "reach">("who")

  // ── Reset on ward change ─────────────────────────────────
  useEffect(() => {
    setTab("who")
    setExtraFacts([])
    setRefreshedUnknowns(null)
    setShowAddFor(null)
  }, [wardIdentity])

  // ── Record (rarely changing) ─────────────────────────────
  useEffect(() => {
    if (!result?.found) return
    let active = true
    const load = routePath ? fetchWardRoute<WardRecord>(routePath) : buildWardRecord(result, BROWSER_SOURCES)
    load.then(
      value => { if (active) setRecord({ identity: wardIdentity, value, failed: false }) },
      () => { if (active) setRecord({ identity: wardIdentity, value: null, failed: true }) },
    )
    return () => { active = false }
  }, [result, routePath, wardIdentity, attempt])

  // ── Live parts ───────────────────────────────────────────
  useEffect(() => {
    if (!result?.found) return
    let active = true
    const load = routePath ? fetchWardRoute<WardLive>(`${routePath}/live`) : buildWardLive(result)
    load.then(
      value => { if (active) setLive({ identity: wardIdentity, value, failed: false }) },
      () => { if (active) setLive({ identity: wardIdentity, value: null, failed: true }) },
    )
    return () => { active = false }
  }, [result, routePath, wardIdentity, attempt])

  // ── REACH: local offices, once the tab opens ─────────────
  useEffect(() => {
    if (tab !== "reach" || !result?.lat || !result.lng) return
    let active = true
    lookupLocalOffices(result.lat, result.lng).then(
      value => { if (active) setOffices({ identity: wardIdentity, value, failed: false }) },
      () => { if (active) setOffices({ identity: wardIdentity, value: [], failed: true }) },
    )
    return () => { active = false }
  }, [tab, result?.lat, result?.lng, wardIdentity, attempt])

  const recordState = record?.identity === wardIdentity ? record : null
  const liveState = live?.identity === wardIdentity ? live : null
  const officesState = offices?.identity === wardIdentity ? offices : null
  const data = recordState?.value ?? null
  const liveData = liveState?.value ?? null

  // Community facts are live; the rest of the profile is part of the record.
  const profile = useMemo(
    () => (data?.profile ? { ...data.profile, community_facts: liveData?.communityFacts ?? [] } : null),
    [data, liveData],
  )
  // Derived, not raced: the profile's MLA+MP+corporator list always wins.
  const electedReps = useMemo(() => preferredElectedReps(profile?.elected_reps, data?.mlaReps ?? []), [profile, data])

  // ── Failed reads ──────────────────────────────────────────
  function loadFailed(section: LoadSection): boolean {
    if (section === "offices") return !!officesState?.failed
    if (RECORD_SECTIONS.includes(section)) return !!recordState?.failed || !!data?.failed.includes(section)
    if (LIVE_SECTIONS.includes(section)) return !!liveState?.failed || !!liveData?.failed.includes(section)
    return false
  }
  /** The read finished, with or without rows: its placeholder can go. */
  function loadDone(section: LoadSection): boolean {
    if (section === "offices") return !!officesState || !result?.lat || !result.lng
    if (RECORD_SECTIONS.includes(section)) return !!data && !data.failed.includes(section)
    if (LIVE_SECTIONS.includes(section)) return !!liveData && !liveData.failed.includes(section)
    return false
  }

  /**
   * Load every failed part again. The headline and snapshot wait for the
   * record a second time, so a retry never shows a finding built without it.
   */
  function retry() {
    if (record?.failed || record?.value?.failed.length) setRecord(null)
    if (live?.failed || live?.value?.failed.length) setLive(null)
    if (offices?.failed) setOffices(null)
    setAttempt(value => value + 1)
  }

  // ── Derived values ────────────────────────────────────────
  const allFacts = [...(profile?.community_facts ?? []), ...extraFacts]
  const officerGroups = groupOfficerFacts(allFacts)
  const unknowns = refreshedUnknowns ? refreshedUnknowns.value : liveData?.unknowns ?? null
  const recordSettled = !!recordState

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
    setRefreshedUnknowns({ value: null })
    if (wardNo) {
      void fetchWardUnknowns(wardNo, cityId)
        .then(value => setRefreshedUnknowns({ value }))
        .catch(() => setRefreshedUnknowns(null))
    }
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
    profile, profileLoading: !recordSettled, electedReps,
    // who
    extraFacts, unknowns, showAddFor, setShowAddFor,
    committeeMeetings: data?.committeeMeetings ?? [], reportCard: data?.reportCard ?? null, ladFunds: data?.ladFunds ?? [],
    corpContacts: data?.corpContacts ?? [], corpName: data?.corpName ?? null,
    allFacts, officerGroups,
    handleCorroborate, handleNewFact, refreshUnknowns,
    // failed reads
    loadFailed, loadDone, retry,
    // expenses
    budget: data?.budget ?? null, workOrders: data?.workOrders ?? [], wardContractors: data?.wardContractors ?? [],
    tradeLicenses: data?.tradeLicenses ?? [], corporationTenders: data?.corporationTenders ?? null,
    // stats
    wardStats: data?.wardStats ?? null, grievances: data?.grievances ?? [], potholes: data?.potholes ?? null,
    infraStats: data?.infraStats ?? null, wardBusStats: data?.wardBusStats ?? null, roadCrashes: data?.roadCrashes ?? null,
    airQuality: data?.airQuality ?? null, amenities: data?.amenities ?? null, waterQuality: data?.waterQuality ?? [],
    wardSpend: data?.wardSpend ?? null, wardSpendSettled: recordSettled, propertyTax: data?.propertyTax ?? null,
    sakala: data?.sakala ?? null, reportCount: liveData?.reportCount ?? 0, signals: liveData?.signals ?? [],
    /** False while ward spend / potholes / committee meetings can't be matched to this ward (see BBMP_198_RECORDS_ATTRIBUTABLE). */
    bbmp198Attributable: BBMP_198_RECORDS_ATTRIBUTABLE,
    /** The record the headline ranks has arrived (or failed); render it only then so it never swaps. */
    headlineReady: recordSettled,
    /** The evidence snapshot draws from the same record. */
    snapshotReady: recordSettled,
    // report
    localOffices: officesState?.value ?? [], departments: data?.departments ?? [],
  }
}
