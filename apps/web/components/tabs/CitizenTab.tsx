"use client"

import { timeAgo } from "@/lib/ward-utils"
import type { CityConfig } from "@/lib/cities"
import { useState, type ReactNode } from "react"
import type { WardAirQuality, WardAmenities, WardBusStats, WardInfraStats, WardPotholes, WardRoadCrashes, WardStats, WardWaterQuality } from "@/lib/types"
import { RTIDraftSheet } from "@/components/shared/RTIDraftSheet"
import type { RTIDraftRequest } from "@/app/api/rti-draft/route"
import { SkeletonCard, SkeletonStats } from "@/components/shared/Skeleton"
import type { CivicSignal } from "@/lib/api"

// City-wide averages for comparison (from ward_infra_stats materialized view)
const CITY_AVG_SIGNALS  = 5.5
const CITY_AVG_STOPS    = 155.6

interface Props {
  city: CityConfig
  wardStats: WardStats | null
  potholes: WardPotholes | null
  infraStats: WardInfraStats | null
  wardBusStats: WardBusStats | null
  roadCrashes: WardRoadCrashes | null
  airQuality: WardAirQuality | null
  amenities: WardAmenities | null
  waterQuality: WardWaterQuality[]
  wardNo: number
  wardName: string
  /** Citation for letters (current GBA identity when there is one). */
  wardLabel: string
  assemblyConstituency: string
  reportCount?: number
  signals?: CivicSignal[]
}

// Signal on Paper: hairline-ruled sections, mono figures, a source under each.
const SECTION = "border-t border-ink/15 pt-2"
const EYEBROW = "text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60"
const SUBHEAD = "text-xs font-semibold text-ink/80"
const FIGURE = "font-mono font-semibold tabular-nums"
const SOURCE = "font-mono text-[11px] uppercase leading-snug tracking-[0.06em] text-ink/60"
const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"

/** Where a section's figures come from. Same text the freshness chip carried. */
function Provenance({ label, source }: { label: string; source?: string }) {
  return <p className={`mt-1.5 ${SOURCE}`}>{source ? `${source} · ` : ""}{label}</p>
}

/** Label left, figure right, on a hairline. Laid out two-up in a ledger grid. */
function Row({ label, tone = "text-ink", children }: { label: string; tone?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-2 border-b border-ink/10 py-1.5">
      <span className="min-w-0 truncate text-xs text-ink/75">{label}</span>
      <span className={`shrink-0 text-sm ${FIGURE} ${tone}`}>{children}</span>
    </div>
  )
}

const LEDGER = "grid grid-cols-2 gap-x-4"

export function CitizenTab({ city, wardStats, potholes, infraStats, wardBusStats, roadCrashes, airQuality, amenities, waterQuality, wardNo, wardName, wardLabel, assemblyConstituency, reportCount = 0, signals = [] }: Props) {
  const [rtiRequest, setRtiRequest] = useState<RTIDraftRequest | null>(null)
  return (
    <>
    <RTIDraftSheet request={rtiRequest} onClose={() => setRtiRequest(null)} />
    <div className="px-5 py-4 space-y-5 pb-safe-content">

      {/* Demographics + Infrastructure */}
      {!wardStats ? (
        <SkeletonStats />
      ) : wardStats.ward_count === 0 ? (
        <div className="bg-paper-muted px-4 py-5 text-center space-y-1">
          <p className="text-sm text-ink/75">No area data available</p>
          <p className="text-xs text-ink/60">This constituency isn&apos;t yet in our database.</p>
        </div>
      ) : (
        <>
          <p className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-ink/80">{wardStats.assembly_constituency}</p>

          {/* Population */}
          <section className={SECTION}>
            <p className={EYEBROW}>Population</p>
            <div className="mt-1.5 grid grid-cols-3 gap-3">
              <div className="min-w-0">
                <p className={`truncate text-lg text-ink ${FIGURE}`}>{wardStats.total_population?.toLocaleString("en-IN") ?? "--"}</p>
                <p className="text-xs text-ink/70">People</p>
              </div>
              <div className="min-w-0">
                <p className={`truncate text-lg text-ink ${FIGURE}`}>{wardStats.total_households?.toLocaleString("en-IN") ?? "--"}</p>
                <p className="text-xs text-ink/70">Households</p>
              </div>
              <div className="min-w-0">
                <p className={`truncate text-lg text-ink ${FIGURE}`}>{wardStats.avg_population_density?.toLocaleString("en-IN") ?? "--"}</p>
                <p className="text-xs text-ink/70">per km²</p>
              </div>
            </div>
            {wardStats.total_area_sqkm && <p className="mt-1 text-xs text-ink/70">Area: <span className="font-mono tabular-nums text-ink">{wardStats.total_area_sqkm}</span> km²</p>}
            <Provenance label={`Census ${wardStats.data_year}`} source="opencity.in" />
          </section>

          {/* Infrastructure */}
          <section className={SECTION}>
            <p className={EYEBROW}>Infrastructure</p>
            <div className={`mt-1 ${LEDGER}`}>
              {[
                { label: "Road length",    value: wardStats.total_road_length_km ? `${wardStats.total_road_length_km} km` : null },
                { label: "Streetlights",   value: (wardStats.streetlights ?? wardStats.total_streetlights)?.toLocaleString("en-IN") },
                { label: "Bus stops",      value: wardStats.total_bus_stops?.toLocaleString("en-IN") },
                { label: "Bus routes",     value: wardStats.total_bus_routes?.toLocaleString("en-IN") },
                { label: "Govt schools",   value: wardStats.total_govt_schools?.toLocaleString("en-IN") },
                { label: "Police stn.",    value: wardStats.total_police_stations?.toLocaleString("en-IN") },
                { label: "Fire stn.",      value: wardStats.total_fire_stations?.toLocaleString("en-IN") },
                { label: "Namma Clinics",  value: wardStats.namma_clinics?.toLocaleString("en-IN") },
                { label: "Waste centers",  value: wardStats.dwcc_count?.toLocaleString("en-IN") },
              ].filter(s => s.value).map(s => (
                <Row key={s.label} label={s.label}>{s.value}</Row>
              ))}
            </div>
            <Provenance label="2022-23" source="BBMP" />
          </section>

          {/* Green spaces */}
          {(wardStats.total_lakes || wardStats.total_parks || wardStats.total_playgrounds || wardStats.trees) && (
            <section className={SECTION}>
              <p className={EYEBROW}>Green Spaces</p>
              <div className={`mt-1 ${LEDGER}`}>
                {wardStats.total_lakes      ? <Row label="Lakes">{wardStats.total_lakes}</Row> : null}
                {wardStats.total_parks      ? <Row label="Parks">{wardStats.total_parks}</Row> : null}
                {wardStats.total_playgrounds ? <Row label="Playgrounds">{wardStats.total_playgrounds}</Row> : null}
                {wardStats.trees            ? <Row label="Trees">{wardStats.trees.toLocaleString("en-IN")}</Row> : null}
              </div>
              <Provenance label="2022" source="BBMP/KGIS" />
            </section>
          )}

          {/* Traffic Signals + Bus Stops */}
          {infraStats && (
            <section className={SECTION}>
              <p className={EYEBROW}>Road Infrastructure</p>
              <div className="mt-1.5 grid grid-cols-2 gap-4">
                <div className="min-w-0">
                  <p className={`text-lg ${FIGURE} ${infraStats.signal_count === 0 ? "text-danger" : infraStats.signal_count < CITY_AVG_SIGNALS ? "text-warning" : "text-ink"}`}>
                    {infraStats.signal_count}
                  </p>
                  <p className="text-xs text-ink/75">Traffic signals</p>
                  <p className="font-mono text-[11px] tabular-nums text-ink/60">city avg {CITY_AVG_SIGNALS}</p>
                </div>
                <div className="min-w-0">
                  <p className={`text-lg ${FIGURE} ${infraStats.bus_stop_count === 0 ? "text-danger" : infraStats.bus_stop_count < CITY_AVG_STOPS ? "text-warning" : "text-ink"}`}>
                    {infraStats.bus_stop_count}
                  </p>
                  <p className="text-xs text-ink/75">Bus stops</p>
                  <p className="font-mono text-[11px] tabular-nums text-ink/60">city avg {Math.round(CITY_AVG_STOPS)}</p>
                </div>
              </div>
              {infraStats.daily_trips > 0 && (
                <p className="mt-1.5 text-xs text-ink/70">
                  <span className="font-mono tabular-nums text-ink">{infraStats.daily_trips.toLocaleString("en-IN")}</span> daily bus trips through this ward
                </p>
              )}
              <Provenance label="2026" source="OSM / BMTC" />
            </section>
          )}

          {/* Live reports count */}
          <section className={SECTION}>
            <div className="flex items-baseline justify-between gap-4">
              <p className={EYEBROW}>Civic Reports (last 30 days)</p>
              <p className={`text-2xl ${FIGURE} ${reportCount > 0 ? "text-ink" : "text-ink/60"}`}>
                {reportCount}
              </p>
            </div>
            <p className="text-xs text-ink/70">
              {reportCount === 0 ? "No reports yet — be the first" : reportCount === 1 ? "1 issue reported by residents" : `issues reported by residents`}
            </p>
          </section>

          {potholes && (
            <section className={SECTION}>
              <div className="flex items-baseline justify-between gap-4">
                <p className={EYEBROW}>Pothole Complaints</p>
                <p className={`text-lg text-ink ${FIGURE}`}>{potholes.complaints.toLocaleString("en-IN")}</p>
              </div>
              <div className="flex items-center justify-between gap-4">
                <p className={SOURCE}>Fix My Street 2022</p>
                {potholes.complaints > 0 && (
                  <button
                    type="button"
                    onClick={() => setRtiRequest({ issue_type: "pothole_complaints", ward_no: wardNo, ward_label: wardLabel, ward_name: wardName, assembly_constituency: assemblyConstituency, pothole_complaints: potholes.complaints })}
                    className={`inline-flex min-h-11 shrink-0 items-center text-xs font-medium text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent ${FOCUS}`}
                  >
                    File RTI
                  </button>
                )}
              </div>
            </section>
          )}

          {/* Bus connectivity (BMTC 2026) */}
          {wardBusStats && wardBusStats.stop_count > 0 && (
            <section className={SECTION}>
              <div className="flex items-baseline justify-between gap-4">
                <p className={EYEBROW}>Bus Connectivity</p>
                <p className="text-xs text-ink/70">
                  <span className={`text-lg text-ink ${FIGURE}`}>{wardBusStats.stop_count}</span> stops
                </p>
              </div>
              {wardBusStats.total_trips > 0 && (
                <p className="text-xs text-ink/70"><span className="font-mono tabular-nums text-ink">{wardBusStats.total_trips.toLocaleString("en-IN")}</span> daily trips through this ward</p>
              )}
              <p className={`mt-1.5 ${SOURCE}`}>BMTC 2026</p>
            </section>
          )}

          {/* Road safety (BTP 2024-25) */}
          {roadCrashes && (roadCrashes.crashes_2024 > 0 || roadCrashes.crashes_2025 > 0) && (
            <section className={SECTION}>
              <p className={EYEBROW}>Road Safety</p>
              <div className="mt-1.5 grid grid-cols-2 gap-4">
                {roadCrashes.crashes_2024 > 0 && (
                  <div className="min-w-0">
                    <p className={`text-lg text-ink ${FIGURE}`}>{roadCrashes.crashes_2024}</p>
                    <p className="text-xs text-ink/75">crashes in 2024</p>
                    {roadCrashes.fatal_2024 > 0 && <p className="text-xs text-danger"><span className={FIGURE}>{roadCrashes.fatal_2024}</span> fatal</p>}
                  </div>
                )}
                {roadCrashes.crashes_2025 > 0 && (
                  <div className="min-w-0">
                    <p className={`text-lg text-ink ${FIGURE}`}>{roadCrashes.crashes_2025}</p>
                    <p className="text-xs text-ink/75">crashes in 2025</p>
                    {roadCrashes.fatal_2025 > 0 && <p className="text-xs text-danger"><span className={FIGURE}>{roadCrashes.fatal_2025}</span> fatal</p>}
                  </div>
                )}
              </div>
              <Provenance label="BTP 2025" source="Bengaluru Traffic Police" />
            </section>
          )}

          {/* Air quality (KSPCB/CPCB 2024-25) */}
          {airQuality && (airQuality.avg_pm25 || airQuality.avg_pm10) && (
            <section className={SECTION}>
              <p className={EYEBROW}>Air Quality</p>
              <p className="mt-0.5 text-xs text-ink/70">Nearest station: {airQuality.station_name}</p>
              <div className="mt-1.5 grid grid-cols-2 gap-4">
                {airQuality.avg_pm25 && (
                  <div className="min-w-0">
                    <p className={`text-lg ${FIGURE} ${Number(airQuality.avg_pm25) > 60 ? "text-danger" : Number(airQuality.avg_pm25) > 35 ? "text-warning" : "text-success"}`}>
                      {airQuality.avg_pm25}
                    </p>
                    <p className="text-xs text-ink/75">PM2.5 avg (ug/m3)</p>
                  </div>
                )}
                {airQuality.avg_pm10 && (
                  <div className="min-w-0">
                    <p className={`text-lg ${FIGURE} ${Number(airQuality.avg_pm10) > 100 ? "text-danger" : Number(airQuality.avg_pm10) > 60 ? "text-warning" : "text-success"}`}>
                      {airQuality.avg_pm10}
                    </p>
                    <p className="text-xs text-ink/75">PM10 avg (ug/m3)</p>
                  </div>
                )}
              </div>
              <Provenance label="2024-25" source="KSPCB / CPCB" />
            </section>
          )}

          {/* Neighbourhood Amenities (OSM) */}
          {amenities && (
            <section className={SECTION}>
              <p className={EYEBROW}>Neighbourhood Amenities</p>

              {/* Healthcare */}
              {(amenities.hospitals > 0 || amenities.clinics > 0 || amenities.pharmacies > 0) && (
                <div className="mt-2">
                  <p className={SUBHEAD}>Healthcare</p>
                  <div className={LEDGER}>
                    {amenities.hospitals > 0 && <Row label="Hospitals">{amenities.hospitals}</Row>}
                    {amenities.clinics > 0 && <Row label="Clinics">{amenities.clinics}</Row>}
                    {amenities.pharmacies > 0 && <Row label="Pharmacies">{amenities.pharmacies}</Row>}
                  </div>
                </div>
              )}

              {/* Financial */}
              {(amenities.atms > 0 || amenities.banks > 0) && (
                <div className="mt-2">
                  <p className={SUBHEAD}>Financial</p>
                  <div className={LEDGER}>
                    {amenities.atms > 0 && <Row label="ATMs">{amenities.atms}</Row>}
                    {amenities.banks > 0 && <Row label="Banks">{amenities.banks}</Row>}
                    {amenities.post_offices > 0 && <Row label="Post Offices">{amenities.post_offices}</Row>}
                  </div>
                </div>
              )}

              {/* Mobility & Energy */}
              {(amenities.metro_stations > 0 || amenities.ev_charging > 0 || amenities.petrol_pumps > 0) && (
                <div className="mt-2">
                  <p className={SUBHEAD}>Mobility</p>
                  <div className={LEDGER}>
                    {amenities.metro_stations > 0 && <Row label="Metro Stations">{amenities.metro_stations}</Row>}
                    {amenities.ev_charging > 0 && <Row label="EV Charging">{amenities.ev_charging}</Row>}
                    {amenities.petrol_pumps > 0 && <Row label="Petrol Pumps">{amenities.petrol_pumps}</Row>}
                  </div>
                </div>
              )}

              {/* Civic & Public */}
              {(amenities.public_toilets > 0 || amenities.libraries > 0 || amenities.community_halls > 0) && (
                <div className="mt-2">
                  <p className={SUBHEAD}>Public Facilities</p>
                  <div className={LEDGER}>
                    {amenities.public_toilets > 0 && (
                      <Row label="Public Toilets" tone={amenities.public_toilets === 0 ? "text-danger" : "text-ink"}>{amenities.public_toilets}</Row>
                    )}
                    {amenities.libraries > 0 && <Row label="Libraries">{amenities.libraries}</Row>}
                    {amenities.community_halls > 0 && <Row label="Community Halls">{amenities.community_halls}</Row>}
                  </div>
                </div>
              )}

              {/* Food & Commerce */}
              {(amenities.restaurants > 0 || amenities.cafes > 0) && (
                <div className="mt-2">
                  <p className={SUBHEAD}>Food & Commerce</p>
                  <div className={LEDGER}>
                    {amenities.restaurants > 0 && <Row label="Restaurants">{amenities.restaurants}</Row>}
                    {amenities.cafes > 0 && <Row label="Cafes">{amenities.cafes}</Row>}
                    {amenities.places_of_worship > 0 && <Row label="Places of Worship">{amenities.places_of_worship}</Row>}
                  </div>
                </div>
              )}
              <Provenance label="2026" source="OpenStreetMap" />
            </section>
          )}

          {/* Water Body Quality */}
          {waterQuality.length > 0 && (
            <section className={SECTION}>
              <p className={EYEBROW}>Water Body Health</p>
              <div className="divide-y divide-ink/10 border-b border-ink/10">
                {waterQuality.map((wq, i) => (
                  <div key={i} className="py-2">
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <p className="min-w-0 text-sm font-medium text-ink">{wq.water_body_name}</p>
                      {wq.quality_class && (
                        <span className={`inline-flex shrink-0 items-center border px-1.5 py-0.5 font-mono text-[11px] ${
                          wq.quality_class === "A" || wq.quality_class === "B" ? "border-success/35 bg-success/[0.07] text-success" :
                          wq.quality_class === "C" ? "border-warning/35 bg-warning/[0.07] text-warning" :
                          "border-danger/35 bg-danger/[0.07] text-danger"
                        }`}>
                          Class {wq.quality_class}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {wq.ph != null && <div className="min-w-0"><p className={`text-sm text-ink ${FIGURE}`}>{wq.ph}</p><p className="text-[11px] text-ink/70">pH</p></div>}
                      {wq.do_level != null && (
                        <div className="min-w-0">
                          <p className={`text-sm ${FIGURE} ${wq.do_level < 4 ? "text-danger" : wq.do_level < 6 ? "text-warning" : "text-success"}`}>{wq.do_level}</p>
                          <p className="text-[11px] text-ink/70">DO mg/L</p>
                        </div>
                      )}
                      {wq.bod != null && (
                        <div className="min-w-0">
                          <p className={`text-sm ${FIGURE} ${wq.bod > 6 ? "text-danger" : wq.bod > 3 ? "text-warning" : "text-success"}`}>{wq.bod}</p>
                          <p className="text-[11px] text-ink/70">BOD mg/L</p>
                        </div>
                      )}
                      {wq.coliform != null && (
                        <div className="min-w-0">
                          <p className={`truncate text-sm ${FIGURE} ${wq.coliform > 5000 ? "text-danger" : wq.coliform > 500 ? "text-warning" : "text-success"}`}>{wq.coliform.toLocaleString("en-IN")}</p>
                          <p className="text-[11px] text-ink/70">Coliform</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <Provenance label={waterQuality[0].data_year} source={waterQuality[0].data_source} />
            </section>
          )}

          <p className={`text-center ${SOURCE}`}>{wardStats.source} · {wardStats.ward_count} wards aggregated</p>
        </>
      )}

      {/* Ward Pulse — geotagged civic signals from news + twitter RSS */}
      {signals.length > 0 && (
        <section className={SECTION}>
          <p className={EYEBROW}>Ward Pulse</p>
          <div className="mt-1 divide-y divide-ink/10 border-b border-ink/10">
            {signals.map(s => (
              <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer" className={`group -mx-2 block px-2 py-2.5 hover:bg-ink/5 ${FOCUS}`}>
                <div className="mb-1 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.06em]">
                  <span className="font-semibold text-ink/75">{s.issue_type}</span>
                  <span className="text-ink/60" aria-hidden="true">·</span>
                  <span className="text-ink/60">{s.source}</span>
                </div>
                <p className="line-clamp-2 text-sm leading-snug text-ink/85 group-hover:text-ink group-hover:underline group-hover:decoration-ink/30 group-hover:underline-offset-2">{s.title}</p>
                <p className="mt-1 font-mono text-[11px] tabular-nums text-ink/60">+{s.upvotes} · {timeAgo(new Date(s.signal_at).getTime() / 1000)}</p>
              </a>
            ))}
          </div>
          <Provenance label="7d" source="news + X" />
        </section>
      )}

      {/* Community Buzz — Reddit removed, civic signals now cover this via Ward Pulse above */}
    </div>
    </>
  )
}
