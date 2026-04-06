"use client"

import { timeAgo } from "@/lib/ward-utils"
import type { CityConfig } from "@/lib/cities"
import { useState } from "react"
import type { WardAirQuality, WardAmenities, WardBusStats, WardInfraStats, WardPotholes, WardRoadCrashes, WardStats, WardWaterQuality } from "@/lib/types"
import { RTIDraftSheet } from "@/components/shared/RTIDraftSheet"
import type { RTIDraftRequest } from "@/app/api/rti-draft/route"
import { FreshnessBadge } from "@/components/shared/FreshnessBadge"
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
  assemblyConstituency: string
  reportCount?: number
  signals?: CivicSignal[]
}

export function CitizenTab({ city, wardStats, potholes, infraStats, wardBusStats, roadCrashes, airQuality, amenities, waterQuality, wardNo, wardName, assemblyConstituency, reportCount = 0, signals = [] }: Props) {
  const [rtiRequest, setRtiRequest] = useState<RTIDraftRequest | null>(null)
  return (
    <>
    <RTIDraftSheet request={rtiRequest} onClose={() => setRtiRequest(null)} />
    <div className="px-5 py-4 space-y-4 pb-safe-content">

      {/* Demographics + Infrastructure */}
      {!wardStats ? (
        <SkeletonStats />
      ) : wardStats.ward_count === 0 ? (
        <div className="p-6 rounded-xl bg-white/5 text-center space-y-2">
          <p className="text-white/30 text-sm">No area data available</p>
          <p className="text-white/20 text-xs">This constituency isn&apos;t yet in our database.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-white/50 text-xs uppercase tracking-wider truncate">{wardStats.assembly_constituency}</p>
            <FreshnessBadge label={`Census ${wardStats.data_year}`} source="opencity.in" />
          </div>

          {/* Population */}
          <div className="rounded-xl bg-white/5 p-3 space-y-2">
            <p className="text-white/50 text-[10px] uppercase tracking-wider">Population</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="min-w-0">
                <p className="text-lg font-bold text-white truncate">{wardStats.total_population?.toLocaleString("en-IN") ?? "--"}</p>
                <p className="text-white/30 text-[10px]">People</p>
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold text-white truncate">{wardStats.total_households?.toLocaleString("en-IN") ?? "--"}</p>
                <p className="text-white/30 text-[10px]">Households</p>
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold text-[#FF9933] truncate">{wardStats.avg_population_density?.toLocaleString("en-IN") ?? "--"}</p>
                <p className="text-white/30 text-[10px]">per km²</p>
              </div>
            </div>
            {wardStats.total_area_sqkm && <p className="text-white/20 text-[10px]">Area: {wardStats.total_area_sqkm} km²</p>}
          </div>

          {/* Infrastructure */}
          <div className="rounded-xl bg-white/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-white/50 text-[10px] uppercase tracking-wider">Infrastructure</p>
              <FreshnessBadge label="2022-23" source="BBMP" />
            </div>
            <div className="grid grid-cols-2 gap-y-2 gap-x-3">
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
                <div key={s.label} className="min-w-0">
                  <p className="text-white text-sm font-semibold">{s.value}</p>
                  <p className="text-white/30 text-[10px]">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Green spaces */}
          {(wardStats.total_lakes || wardStats.total_parks || wardStats.total_playgrounds || wardStats.trees) && (
            <div className="rounded-xl bg-white/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-white/50 text-[10px] uppercase tracking-wider">Green Spaces</p>
                <FreshnessBadge label="2022" source="BBMP/KGIS" />
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                {wardStats.total_lakes      ? <div><p className="text-lg font-bold text-blue-400">{wardStats.total_lakes}</p><p className="text-white/30 text-[10px]">Lakes</p></div> : null}
                {wardStats.total_parks      ? <div><p className="text-lg font-bold text-green-400">{wardStats.total_parks}</p><p className="text-white/30 text-[10px]">Parks</p></div> : null}
                {wardStats.total_playgrounds ? <div><p className="text-lg font-bold text-yellow-400">{wardStats.total_playgrounds}</p><p className="text-white/30 text-[10px]">Playgrounds</p></div> : null}
                {wardStats.trees            ? <div><p className="text-lg font-bold text-green-300">{wardStats.trees.toLocaleString("en-IN")}</p><p className="text-white/30 text-[10px]">Trees</p></div> : null}
              </div>
            </div>
          )}

          {/* Traffic Signals + Bus Stops */}
          {infraStats && (
            <div className="rounded-xl bg-white/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-white/50 text-[10px] uppercase tracking-wider">Road Infrastructure</p>
                <FreshnessBadge label="2026" source="OSM / BMTC" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-white/5 px-3 py-2">
                  <p className={`text-lg font-bold ${infraStats.signal_count === 0 ? "text-red-400" : infraStats.signal_count < CITY_AVG_SIGNALS ? "text-yellow-400" : "text-green-400"}`}>
                    {infraStats.signal_count}
                  </p>
                  <p className="text-white/30 text-[10px]">Traffic signals</p>
                  <p className="text-white/20 text-[10px]">city avg {CITY_AVG_SIGNALS}</p>
                </div>
                <div className="rounded-lg bg-white/5 px-3 py-2">
                  <p className={`text-lg font-bold ${infraStats.bus_stop_count === 0 ? "text-red-400" : infraStats.bus_stop_count < CITY_AVG_STOPS ? "text-yellow-400" : "text-green-400"}`}>
                    {infraStats.bus_stop_count}
                  </p>
                  <p className="text-white/30 text-[10px]">Bus stops</p>
                  <p className="text-white/20 text-[10px]">city avg {Math.round(CITY_AVG_STOPS)}</p>
                </div>
              </div>
              {infraStats.daily_trips > 0 && (
                <p className="text-white/20 text-[10px] text-right">
                  {infraStats.daily_trips.toLocaleString("en-IN")} daily bus trips through this ward
                </p>
              )}
            </div>
          )}

          {/* Live reports count */}
          <div className={`rounded-xl px-4 py-3 flex items-center justify-between ${reportCount > 0 ? "bg-[#FF9933]/10 border border-[#FF9933]/20" : "bg-white/5"}`}>
            <div>
              <p className="text-white/50 text-[10px] uppercase tracking-wider">Civic Reports (last 30 days)</p>
              <p className={`text-2xl font-bold mt-0.5 ${reportCount > 0 ? "text-[#FF9933]" : "text-white/30"}`}>
                {reportCount}
              </p>
              <p className="text-white/30 text-[10px]">
                {reportCount === 0 ? "No reports yet — be the first" : reportCount === 1 ? "1 issue reported by residents" : `issues reported by residents`}
              </p>
            </div>
            <div className="text-2xl text-white/10">!</div>
          </div>

          {potholes && (
            <div className="rounded-xl bg-white/5 px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/50 text-[10px] uppercase tracking-wider">Pothole Complaints</p>
                  <p className="text-white/30 text-xs mt-0.5">Fix My Street 2022</p>
                </div>
                <p className="text-red-400 text-lg font-bold">{potholes.complaints.toLocaleString("en-IN")}</p>
              </div>
              {potholes.complaints > 0 && (
                <div className="mt-2 flex justify-end">
                  <button
                    onClick={() => setRtiRequest({ issue_type: "pothole_complaints", ward_no: wardNo, ward_name: wardName, assembly_constituency: assemblyConstituency, pothole_complaints: potholes.complaints })}
                    className="text-[10px] text-[#FF9933]/70 hover:text-[#FF9933] underline transition-colors"
                  >
                    File RTI
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Bus connectivity (BMTC 2026) */}
          {wardBusStats && wardBusStats.stop_count > 0 && (
            <div className="rounded-xl bg-white/5 px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/50 text-[10px] uppercase tracking-wider">Bus Connectivity</p>
                  <p className="text-white/30 text-xs mt-0.5">BMTC 2026</p>
                </div>
                <div className="text-right">
                  <p className="text-white text-lg font-bold">{wardBusStats.stop_count}</p>
                  <p className="text-white/30 text-[10px]">stops</p>
                </div>
              </div>
              {wardBusStats.total_trips > 0 && (
                <p className="text-white/20 text-[10px] mt-1">{wardBusStats.total_trips.toLocaleString("en-IN")} daily trips through this ward</p>
              )}
            </div>
          )}

          {/* Road safety (BTP 2024-25) */}
          {roadCrashes && (roadCrashes.crashes_2024 > 0 || roadCrashes.crashes_2025 > 0) && (
            <div className="rounded-xl bg-white/5 px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-white/50 text-[10px] uppercase tracking-wider">Road Safety</p>
                <FreshnessBadge label="BTP 2025" source="Bengaluru Traffic Police" />
              </div>
              <div className="grid grid-cols-2 gap-3 mt-2">
                {roadCrashes.crashes_2024 > 0 && (
                  <div>
                    <p className="text-red-400 text-lg font-bold">{roadCrashes.crashes_2024}</p>
                    <p className="text-white/30 text-[10px]">crashes in 2024</p>
                    {roadCrashes.fatal_2024 > 0 && <p className="text-white/20 text-[10px]">{roadCrashes.fatal_2024} fatal</p>}
                  </div>
                )}
                {roadCrashes.crashes_2025 > 0 && (
                  <div>
                    <p className="text-red-400 text-lg font-bold">{roadCrashes.crashes_2025}</p>
                    <p className="text-white/30 text-[10px]">crashes in 2025</p>
                    {roadCrashes.fatal_2025 > 0 && <p className="text-white/20 text-[10px]">{roadCrashes.fatal_2025} fatal</p>}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Air quality (KSPCB/CPCB 2024-25) */}
          {airQuality && (airQuality.avg_pm25 || airQuality.avg_pm10) && (
            <div className="rounded-xl bg-white/5 px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-white/50 text-[10px] uppercase tracking-wider">Air Quality</p>
                <FreshnessBadge label="2024-25" source="KSPCB / CPCB" />
              </div>
              <p className="text-white/30 text-[10px] mt-0.5">Nearest station: {airQuality.station_name}</p>
              <div className="grid grid-cols-2 gap-3 mt-2">
                {airQuality.avg_pm25 && (
                  <div>
                    <p className={`text-lg font-bold ${Number(airQuality.avg_pm25) > 60 ? "text-red-400" : Number(airQuality.avg_pm25) > 35 ? "text-yellow-400" : "text-green-400"}`}>
                      {airQuality.avg_pm25}
                    </p>
                    <p className="text-white/30 text-[10px]">PM2.5 avg (ug/m3)</p>
                  </div>
                )}
                {airQuality.avg_pm10 && (
                  <div>
                    <p className={`text-lg font-bold ${Number(airQuality.avg_pm10) > 100 ? "text-red-400" : Number(airQuality.avg_pm10) > 60 ? "text-yellow-400" : "text-green-400"}`}>
                      {airQuality.avg_pm10}
                    </p>
                    <p className="text-white/30 text-[10px]">PM10 avg (ug/m3)</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Neighbourhood Amenities (OSM) */}
          {amenities && (
            <div className="rounded-xl bg-white/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-white/50 text-[10px] uppercase tracking-wider">Neighbourhood Amenities</p>
                <FreshnessBadge label="2026" source="OpenStreetMap" />
              </div>

              {/* Healthcare */}
              {(amenities.hospitals > 0 || amenities.clinics > 0 || amenities.pharmacies > 0) && (
                <div>
                  <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1">Healthcare</p>
                  <div className="grid grid-cols-3 gap-2">
                    {amenities.hospitals > 0 && <div className="min-w-0"><p className="text-white text-sm font-semibold">{amenities.hospitals}</p><p className="text-white/30 text-[10px]">Hospitals</p></div>}
                    {amenities.clinics > 0 && <div className="min-w-0"><p className="text-white text-sm font-semibold">{amenities.clinics}</p><p className="text-white/30 text-[10px]">Clinics</p></div>}
                    {amenities.pharmacies > 0 && <div className="min-w-0"><p className="text-white text-sm font-semibold">{amenities.pharmacies}</p><p className="text-white/30 text-[10px]">Pharmacies</p></div>}
                  </div>
                </div>
              )}

              {/* Financial */}
              {(amenities.atms > 0 || amenities.banks > 0) && (
                <div>
                  <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1">Financial</p>
                  <div className="grid grid-cols-3 gap-2">
                    {amenities.atms > 0 && <div className="min-w-0"><p className="text-white text-sm font-semibold">{amenities.atms}</p><p className="text-white/30 text-[10px]">ATMs</p></div>}
                    {amenities.banks > 0 && <div className="min-w-0"><p className="text-white text-sm font-semibold">{amenities.banks}</p><p className="text-white/30 text-[10px]">Banks</p></div>}
                    {amenities.post_offices > 0 && <div className="min-w-0"><p className="text-white text-sm font-semibold">{amenities.post_offices}</p><p className="text-white/30 text-[10px]">Post Offices</p></div>}
                  </div>
                </div>
              )}

              {/* Mobility & Energy */}
              {(amenities.metro_stations > 0 || amenities.ev_charging > 0 || amenities.petrol_pumps > 0) && (
                <div>
                  <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1">Mobility</p>
                  <div className="grid grid-cols-3 gap-2">
                    {amenities.metro_stations > 0 && <div className="min-w-0"><p className="text-purple-400 text-sm font-semibold">{amenities.metro_stations}</p><p className="text-white/30 text-[10px]">Metro Stations</p></div>}
                    {amenities.ev_charging > 0 && <div className="min-w-0"><p className="text-green-400 text-sm font-semibold">{amenities.ev_charging}</p><p className="text-white/30 text-[10px]">EV Charging</p></div>}
                    {amenities.petrol_pumps > 0 && <div className="min-w-0"><p className="text-white text-sm font-semibold">{amenities.petrol_pumps}</p><p className="text-white/30 text-[10px]">Petrol Pumps</p></div>}
                  </div>
                </div>
              )}

              {/* Civic & Public */}
              {(amenities.public_toilets > 0 || amenities.libraries > 0 || amenities.community_halls > 0) && (
                <div>
                  <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1">Public Facilities</p>
                  <div className="grid grid-cols-3 gap-2">
                    {amenities.public_toilets > 0 && (
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold ${amenities.public_toilets === 0 ? "text-red-400" : "text-white"}`}>{amenities.public_toilets}</p>
                        <p className="text-white/30 text-[10px]">Public Toilets</p>
                      </div>
                    )}
                    {amenities.libraries > 0 && <div className="min-w-0"><p className="text-white text-sm font-semibold">{amenities.libraries}</p><p className="text-white/30 text-[10px]">Libraries</p></div>}
                    {amenities.community_halls > 0 && <div className="min-w-0"><p className="text-white text-sm font-semibold">{amenities.community_halls}</p><p className="text-white/30 text-[10px]">Community Halls</p></div>}
                  </div>
                </div>
              )}

              {/* Food & Commerce */}
              {(amenities.restaurants > 0 || amenities.cafes > 0) && (
                <div>
                  <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1">Food & Commerce</p>
                  <div className="grid grid-cols-3 gap-2">
                    {amenities.restaurants > 0 && <div className="min-w-0"><p className="text-white text-sm font-semibold">{amenities.restaurants}</p><p className="text-white/30 text-[10px]">Restaurants</p></div>}
                    {amenities.cafes > 0 && <div className="min-w-0"><p className="text-white text-sm font-semibold">{amenities.cafes}</p><p className="text-white/30 text-[10px]">Cafes</p></div>}
                    {amenities.places_of_worship > 0 && <div className="min-w-0"><p className="text-white text-sm font-semibold">{amenities.places_of_worship}</p><p className="text-white/30 text-[10px]">Places of Worship</p></div>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Water Body Quality */}
          {waterQuality.length > 0 && (
            <div className="rounded-xl bg-white/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-white/50 text-[10px] uppercase tracking-wider">Water Body Health</p>
                <FreshnessBadge label={waterQuality[0].data_year} source={waterQuality[0].data_source} />
              </div>
              {waterQuality.map((wq, i) => (
                <div key={i} className="rounded-lg bg-white/5 px-3 py-2">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-white text-xs font-medium">{wq.water_body_name}</p>
                    {wq.quality_class && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        wq.quality_class === "A" || wq.quality_class === "B" ? "bg-green-400/20 text-green-400" :
                        wq.quality_class === "C" ? "bg-yellow-400/20 text-yellow-400" :
                        "bg-red-400/20 text-red-400"
                      }`}>
                        Class {wq.quality_class}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {wq.ph != null && <div><p className="text-white/80 text-xs font-semibold">{wq.ph}</p><p className="text-white/30 text-[10px]">pH</p></div>}
                    {wq.do_level != null && (
                      <div>
                        <p className={`text-xs font-semibold ${wq.do_level < 4 ? "text-red-400" : wq.do_level < 6 ? "text-yellow-400" : "text-green-400"}`}>{wq.do_level}</p>
                        <p className="text-white/30 text-[10px]">DO mg/L</p>
                      </div>
                    )}
                    {wq.bod != null && (
                      <div>
                        <p className={`text-xs font-semibold ${wq.bod > 6 ? "text-red-400" : wq.bod > 3 ? "text-yellow-400" : "text-green-400"}`}>{wq.bod}</p>
                        <p className="text-white/30 text-[10px]">BOD mg/L</p>
                      </div>
                    )}
                    {wq.coliform != null && (
                      <div>
                        <p className={`text-xs font-semibold ${wq.coliform > 5000 ? "text-red-400" : wq.coliform > 500 ? "text-yellow-400" : "text-green-400"}`}>{wq.coliform.toLocaleString("en-IN")}</p>
                        <p className="text-white/30 text-[10px]">Coliform</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-white/15 text-[10px] text-center">{wardStats.source} · {wardStats.ward_count} wards aggregated</p>
        </>
      )}

      {/* Ward Pulse — geotagged civic signals from news + twitter RSS */}
      {signals.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-white/30 text-xs uppercase tracking-wider">Ward Pulse</p>
            <FreshnessBadge label="7d" source="news + X" />
          </div>
          {signals.map(s => (
            <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer" className="block group">
              <div className="py-2.5 px-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border-l-2 border-[#FF9933]/30">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#FF9933]/70">{s.issue_type}</span>
                  <span className="text-white/15 text-[10px]">·</span>
                  <span className="text-white/25 text-[10px]">{s.source}</span>
                </div>
                <p className="text-white/80 text-xs leading-snug group-hover:text-white transition-colors line-clamp-2">{s.title}</p>
                <p className="text-white/25 text-[10px] mt-1">+{s.upvotes} · {timeAgo(new Date(s.signal_at).getTime() / 1000)}</p>
              </div>
            </a>
          ))}
        </div>
      )}

      {/* Community Buzz — Reddit removed, civic signals now cover this via Ward Pulse above */}
    </div>
    </>
  )
}
