"use client"

import { timeAgo } from "@/lib/ward-utils"
import type { CityConfig } from "@/lib/cities"
import { useState } from "react"
import type { RedditPost, WardInfraStats, WardPotholes, WardStats } from "@/lib/types"
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
  buzz: RedditPost[] | null
  buzzLoading: boolean
  wardNo: number
  wardName: string
  assemblyConstituency: string
  reportCount?: number
  signals?: CivicSignal[]
}

export function CitizenTab({ city, wardStats, potholes, infraStats, buzz, buzzLoading, wardNo, wardName, assemblyConstituency, reportCount = 0, signals = [] }: Props) {
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
                <p className="text-lg font-bold text-[#2dd4bf] truncate">{wardStats.avg_population_density?.toLocaleString("en-IN") ?? "--"}</p>
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
          <div className={`rounded-xl px-4 py-3 flex items-center justify-between ${reportCount > 0 ? "bg-[#2dd4bf]/10 border border-[#2dd4bf]/20" : "bg-white/5"}`}>
            <div>
              <p className="text-white/50 text-[10px] uppercase tracking-wider">Civic Reports (last 30 days)</p>
              <p className={`text-2xl font-bold mt-0.5 ${reportCount > 0 ? "text-[#2dd4bf]" : "text-white/30"}`}>
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
                    className="text-[10px] text-[#2dd4bf]/70 hover:text-[#2dd4bf] underline transition-colors"
                  >
                    File RTI
                  </button>
                </div>
              )}
            </div>
          )}

          <p className="text-white/15 text-[10px] text-center">{wardStats.source} · {wardStats.ward_count} wards aggregated</p>
        </>
      )}

      {/* Ward Pulse — geotagged signals from reddit ingestion agent */}
      {signals.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-white/30 text-xs uppercase tracking-wider">Ward Pulse</p>
            <FreshnessBadge label="7d" source="reddit / kaun" />
          </div>
          {signals.map(s => (
            <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer" className="block group">
              <div className="py-2.5 px-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border-l-2 border-[#2dd4bf]/30">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#2dd4bf]/70">{s.issue_type}</span>
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

      {/* Community Buzz */}
      {buzzLoading ? (
        <div className="space-y-2">
          <div className="h-3 w-32 bg-white/10 rounded animate-pulse" />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </div>
      ) : buzz && buzz.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-white/30 text-xs uppercase tracking-wider">r/{city.subreddit} chatter</p>
            <FreshnessBadge label="Live" source={`reddit.com/r/${city.subreddit}`} />
          </div>
          {buzz.map((post, i) => (
            <a key={i} href={post.url} target="_blank" rel="noopener noreferrer" className="block group">
              <div className="py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                <p className="text-white text-xs leading-snug group-hover:text-[#2dd4bf] transition-colors line-clamp-2">{post.title}</p>
                <p className="text-white/25 text-xs mt-1">+{post.score} · {post.num_comments} comments · {timeAgo(post.created_utc)}</p>
              </div>
            </a>
          ))}
        </div>
      ) : buzz !== null && buzz.length === 0 ? (
        <div className="p-4 rounded-xl bg-white/5 text-center space-y-1">
          <p className="text-white/25 text-sm">No recent community posts</p>
          <p className="text-white/15 text-xs">r/{city.subreddit}</p>
        </div>
      ) : null}
    </div>
    </>
  )
}
