import type { PinResult } from "@/lib/types"
import { bsrpCorridor2MalligeLine } from "./civic-projects/bsrp-corridor-2-mallige-line.ts"
import { cauveryWaterSupplySchemeStageV } from "./civic-projects/cauvery-water-supply-scheme-stage-v.ts"
import { ejipuraKendriyaSadanFlyover } from "./civic-projects/ejipura-kendriya-sadan-flyover.ts"
import { nammaMetroPhase2aOrr } from "./civic-projects/namma-metro-phase-2a-orr.ts"
import { peripheralRingRoadBengaluruBusinessCorridor } from "./civic-projects/peripheral-ring-road-bengaluru-business-corridor.ts"
import { varthurGunjurRoad } from "./civic-projects/varthur-gunjur-road.ts"

export type EvidenceState = "verified" | "reported" | "conflicting" | "unknown"
export type ProjectRecordKind = "start" | "deadline" | "scope" | "cost" | "land" | "court" | "accountability"

export interface CivicProjectSource {
  id: string
  title: string
  publisher: string
  url: string
  publishedOn: string | null
  /** "company" is a party's own announcement, such as a contractor's award press release. */
  kind: "official" | "court" | "news" | "company"
}

export interface CivicProjectMetric {
  label: string
  value: string
  note: string
  evidence: EvidenceState
}

export interface CivicProjectRecord {
  id: string
  date: string
  dateLabel: string
  kind: ProjectRecordKind
  title: string
  body: string
  evidence: EvidenceState
  sourceIds: string[]
}

export interface CivicProjectSignal {
  id: string
  label: string
  value: string
  explanation: string
  evidence: EvidenceState
  asOf: string | null
  sourceIds: string[]
}

export interface AffectedWard {
  corporationId: number
  /** GBA corporation short name, e.g. "East". */
  corporation: string
  wardNo: number
  name: string
}

export interface CivicProject {
  slug: string
  cityId: string
  title: string
  shortTitle: string
  routeName: string
  projectType: string
  road: string
  status: "Delayed" | "In progress" | "Completed" | "Paused"
  statusNote: string
  ownerAgency: string
  /** Short agency name used in compact labels (e.g. "KRDCL"). */
  ownerAgencyShort: string
  /** Latest publicly reported completion target, as displayed. */
  nextTarget: string
  /** One-line evidence summary shown on ward cards that link to the record. */
  wardSignalNote: string
  /** Current GBA-369 wards the project runs through or directly affects. */
  affectedWards: AffectedWard[]
  /** How the ward list was arrived at, shown beside it. */
  wardBasis: string
  /**
   * Other names people use for the project, its stations or its parties
   * ("ORR metro", "Mallige Line", "PRR"). Map search and the research desk's
   * scope check treat them like the title.
   */
  aliases: string[]
  summary: string
  latestAsOf: string
  alert: string
  metrics: CivicProjectMetric[]
  records: CivicProjectRecord[]
  signals: CivicProjectSignal[]
  sources: CivicProjectSource[]
  suggestedQuestions: string[]
}

/** Record numbers on the project pages follow this order, so append new projects. */
export const CIVIC_PROJECTS: CivicProject[] = [
  varthurGunjurRoad,
  ejipuraKendriyaSadanFlyover,
  nammaMetroPhase2aOrr,
  bsrpCorridor2MalligeLine,
  peripheralRingRoadBengaluruBusinessCorridor,
  cauveryWaterSupplySchemeStageV,
]

/** Red status is kept for records that are behind; on-track or finished work reads in ink. */
export function isBehindSchedule(status: CivicProject["status"]): boolean {
  return status === "Delayed" || status === "Paused"
}

export function wardLabel(ward: AffectedWard): string {
  return `${ward.name} · ${ward.corporation} Ward ${ward.wardNo}`
}

export function projectWardLabels(project: CivicProject): string[] {
  return project.affectedWards.map(wardLabel)
}

export function getCivicProject(slug: string): CivicProject | null {
  return CIVIC_PROJECTS.find(project => project.slug === slug) ?? null
}

/**
 * Projects attached to the pin's current ward. Matching is by GBA corporation
 * and ward number, never by name: a pin's older ward name belongs to a larger
 * historical ward that a project may not touch.
 */
export function getCivicProjectsForPin(result: PinResult | null): CivicProject[] {
  if (!result?.found || result.gba_corporation_id == null || result.gba_ward_no == null) return []
  return CIVIC_PROJECTS.filter(project =>
    project.cityId === result.city_id &&
    project.affectedWards.some(ward =>
      ward.corporationId === result.gba_corporation_id && ward.wardNo === result.gba_ward_no),
  )
}

function searchText(project: CivicProject): string {
  return [
    project.title, project.shortTitle, project.routeName, project.road,
    project.ownerAgency, project.ownerAgencyShort, project.projectType, ...project.aliases,
    // Names only: ward numbers would let "SH-35" match any project touching a Ward 35.
    ...project.affectedWards.map(ward => ward.name),
  ].join(" ").toLowerCase()
}

/**
 * Projects whose name, road, agency or affected wards contain every word of
 * the query (2+ characters). Used by map search so a record is findable
 * without first opening one of its wards.
 */
export function searchCivicProjects(query: string, cityId: string): CivicProject[] {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length >= 2)
  if (!words.length) return []
  return CIVIC_PROJECTS.filter(project =>
    project.cityId === cityId && words.every(word => searchText(project).includes(word)),
  )
}

export function sourceMap(project: CivicProject): Map<string, CivicProjectSource> {
  return new Map(project.sources.map(source => [source.id, source]))
}
