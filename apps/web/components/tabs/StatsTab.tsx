"use client"

import type { CityConfig } from "@/lib/cities"
import type {
  PropertyTaxData, SakalaPerformance, WardGrievances,
  WardPotholes, WardSpendCategory, WardStats,
} from "@/lib/types"

interface Props {
  city: CityConfig
  wardStats: WardStats | null
  grievances: WardGrievances[]
  potholes: WardPotholes | null
  wardSpend: WardSpendCategory | null
  propertyTax: PropertyTaxData | null
  sakala: SakalaPerformance | null
}

export function StatsTab({ city, wardStats, grievances, potholes, wardSpend, propertyTax, sakala }: Props) {
  return (
    <div className="px-5 py-4 max-h-[28rem] overflow-y-auto space-y-3">
      {!wardStats ? (
        <p className="text-white/30 text-sm animate-pulse">Loading area data...</p>
      ) : wardStats.ward_count === 0 ? (
        <p className="text-white/30 text-sm">No data available for this constituency</p>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-white/50 text-xs uppercase tracking-wider truncate">{wardStats.assembly_constituency}</p>
            <span className="text-white/20 text-[10px] shrink-0 ml-2">Census {wardStats.data_year}</span>
          </div>

          {/* Population */}
          <div className="rounded-xl bg-white/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-white/50 text-[10px] uppercase tracking-wider">Population</p>
              <p className="text-white/15 text-[10px]">Census 2011 via opencity.in</p>
            </div>
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
              <p className="text-white/15 text-[10px]">BBMP via opencity.in</p>
            </div>
            <div className="grid grid-cols-2 gap-y-2 gap-x-3">
              {[
                { icon: "", label: "Roads", value: wardStats.total_road_length_km ? `${wardStats.total_road_length_km} km` : null },
                { icon: "", label: "Streetlights", value: (wardStats.streetlights ?? wardStats.total_streetlights)?.toLocaleString("en-IN") },
                { icon: "", label: "Bus stops", value: wardStats.total_bus_stops?.toLocaleString("en-IN") },
                { icon: "", label: "Bus routes", value: wardStats.total_bus_routes?.toLocaleString("en-IN") },
                { icon: "", label: "Govt schools", value: wardStats.total_govt_schools?.toLocaleString("en-IN") },
                { icon: "", label: "Police stations", value: wardStats.total_police_stations?.toLocaleString("en-IN") },
                { icon: "", label: "Fire stations", value: wardStats.total_fire_stations?.toLocaleString("en-IN") },
                { icon: "", label: "Namma Clinics", value: wardStats.namma_clinics?.toLocaleString("en-IN") },
                { icon: "", label: "Waste centers", value: wardStats.dwcc_count?.toLocaleString("en-IN") },
              ].filter(s => s.value).map(s => (
                <div key={s.label} className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm shrink-0">{s.icon}</span>
                  <div className="min-w-0">
                    <p className="text-white text-sm font-semibold">{s.value}</p>
                    <p className="text-white/30 text-[10px]">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Green spaces */}
          {(wardStats.total_lakes || wardStats.total_parks || wardStats.total_playgrounds || wardStats.trees) && (
            <div className="rounded-xl bg-white/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-white/50 text-[10px] uppercase tracking-wider">Green Spaces</p>
                <p className="text-white/15 text-[10px]">BBMP / KGIS</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {wardStats.total_lakes ? <div className="text-center"><p className="text-lg font-bold text-blue-400">{wardStats.total_lakes}</p><p className="text-white/30 text-[10px]">Lakes</p></div> : null}
                {wardStats.total_parks ? <div className="text-center"><p className="text-lg font-bold text-green-400">{wardStats.total_parks}</p><p className="text-white/30 text-[10px]">Parks</p></div> : null}
                {wardStats.total_playgrounds ? <div className="text-center"><p className="text-lg font-bold text-yellow-400">{wardStats.total_playgrounds}</p><p className="text-white/30 text-[10px]">Playgrounds</p></div> : null}
                {wardStats.trees ? <div className="text-center"><p className="text-lg font-bold text-green-300">{wardStats.trees.toLocaleString("en-IN")}</p><p className="text-white/30 text-[10px]">Trees</p></div> : null}
              </div>
            </div>
          )}

          {/* BBMP Spending 2018-23 */}
          {wardSpend && wardSpend.grand_total > 0 && (
            <div className="rounded-xl bg-white/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-white/50 text-[10px] uppercase tracking-wider">BBMP Spending 2018-23</p>
                <p className="text-white/30 text-[10px]">Rs.{(wardSpend.grand_total / 10000000).toFixed(1)} Cr total</p>
              </div>
              {[
                { label: "Roads & Infrastructure", val: wardSpend.roads_and_infrastructure },
                { label: "Roads & Drains",         val: wardSpend.roads_and_drains },
                { label: "Drainage",               val: wardSpend.drainage },
                { label: "Streetlighting",         val: wardSpend.streetlighting },
                { label: "Waste Management",       val: wardSpend.waste_management },
                { label: "Water & Sanitation",     val: wardSpend.water_and_sanitation },
                { label: "Buildings & Facilities", val: wardSpend.buildings_facilities },
              ].filter(x => x.val > 0).map(({ label, val }) => {
                const pct = wardSpend.grand_total > 0 ? Math.round((val / wardSpend.grand_total) * 100) : 0
                return (
                  <div key={label}>
                    <div className="flex justify-between text-[10px] mb-0.5">
                      <span className="text-white/40">{label}</span>
                      <span className="text-white/60 font-mono">Rs.{(val / 10000000).toFixed(1)} Cr ({pct}%)</span>
                    </div>
                    <div className="h-1 rounded-full bg-white/10">
                      <div className="h-1 rounded-full bg-[#FF9933]/60" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
              {potholes && (
                <p className="text-white/25 text-[10px] pt-1 border-t border-white/10">
                  Pothole complaints (Fix My Street 2022): <span className="text-red-400 font-semibold">{potholes.complaints.toLocaleString("en-IN")}</span>
                </p>
              )}
              <p className="text-white/15 text-[10px] pt-1">Source: BBMP work orders via opencity.in · Fix My Street via opencity.in</p>
            </div>
          )}

          {/* Property Tax */}
          {propertyTax?.years && propertyTax.years.length > 0 && (
            <div className="rounded-xl bg-white/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-white/50 text-[10px] uppercase tracking-wider">Property Tax Collected</p>
                <p className="text-white/15 text-[10px]">BBMP via opencity.in</p>
              </div>
              {propertyTax.years.map(yr => (
                <div key={yr.financial_year} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-white text-xs font-mono">{yr.financial_year}</p>
                    <p className="text-white/30 text-[10px]">{yr.total_applications?.toLocaleString("en-IN")} properties</p>
                  </div>
                  <p className="text-[#FF9933] text-sm font-bold shrink-0">Rs.{(yr.total_collection_lakh / 100).toFixed(0)} Cr</p>
                </div>
              ))}
            </div>
          )}

          <p className="text-white/15 text-[10px] text-center">{wardStats.source} · {wardStats.ward_count} wards aggregated</p>
        </>
      )}

      {/* Grievances */}
      {grievances.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-white/30 text-[10px] uppercase tracking-wider">Citizen Complaints (BBMP)</p>
            <p className="text-white/15 text-[10px]">opencity.in</p>
          </div>
          <div className="space-y-2">
            {grievances.map(g => {
              const closeRate = g.total_complaints > 0 ? Math.round((g.closed / g.total_complaints) * 100) : 0
              return (
                <div key={g.year} className="rounded-xl bg-white/5 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-white text-sm font-semibold">{g.year}</p>
                    <p className="text-white/30 text-xs">{g.total_complaints.toLocaleString("en-IN")} complaints</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${closeRate >= 90 ? "text-green-400" : closeRate >= 70 ? "text-yellow-400" : "text-red-400"}`}>
                      {closeRate}% closed
                    </p>
                    {g.registered > 0 && <p className="text-white/30 text-xs">{g.registered.toLocaleString("en-IN")} pending</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Sakala */}
      {sakala && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-white/30 text-[10px] uppercase tracking-wider">Sakala Service Delivery ({sakala.year})</p>
            <p className="text-white/15 text-[10px]">sakala.kar.nic.in</p>
          </div>
          <div className="rounded-xl bg-white/5 px-4 py-3 space-y-2">
            <div className="flex justify-between">
              <span className="text-white/40 text-xs">BBMP rank ({sakala.assembly_name})</span>
              <span className="text-white text-xs font-semibold">{sakala.rank_overall != null ? `#${sakala.rank_overall} of 28` : "--"}</span>
            </div>
            {sakala.intime_pct != null && (
              <div className="flex justify-between">
                <span className="text-white/40 text-xs">In-time delivery</span>
                <span className={`text-xs font-semibold ${sakala.intime_pct >= 90 ? "text-green-400" : sakala.intime_pct >= 75 ? "text-yellow-400" : "text-red-400"}`}>
                  {sakala.intime_pct.toFixed(1)}%
                </span>
              </div>
            )}
            {sakala.pending != null && (
              <div className="flex justify-between">
                <span className="text-white/40 text-xs">Pending applications</span>
                <span className="text-white text-xs font-semibold">{sakala.pending.toLocaleString("en-IN")}</span>
              </div>
            )}
          </div>
          {city.sakalaNote && <p className="text-white/15 text-[10px] mt-1 px-1">{city.sakalaNote}</p>}
        </div>
      )}
    </div>
  )
}
