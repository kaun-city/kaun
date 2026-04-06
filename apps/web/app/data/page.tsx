"use client"

import { useState, useEffect, useCallback, useMemo } from "react"

interface WardRow {
  ward_no: number
  ward_name: string
  assembly_constituency: string
  zone: string | null
  spend_grand_total: number | null
  spend_roads_and_infrastructure: number | null
  spend_water_and_sanitation: number | null
  spend_period: string | null
  pothole_complaints: number | null
  total_work_orders: number
}

type SortKey = keyof WardRow
type SortDir = "asc" | "desc"

function crores(val: number | null): string {
  if (val === null || val === 0) return "--"
  return `Rs ${(val / 10000000).toFixed(1)} Cr`
}

function num(val: number | null): string {
  if (val === null) return "--"
  return val.toLocaleString("en-IN")
}

export default function DataPage() {
  const [rows, setRows] = useState<WardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("ward_no")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const SUPA_URL = "https://xgygxfyfsvccqqmtboeu.supabase.co"
      const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhneWd4Znlmc3ZjY3FxbXRib2V1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NDg1NzIsImV4cCI6MjA4ODEyNDU3Mn0.5dzsC5-Ex-Umk-9DTM5xNsQB-t0my-MtWq9WUPhidD4"
      const headers = { "apikey": SUPA_KEY, "Authorization": `Bearer ${SUPA_KEY}` }

      const [wardsRes, spendRes, potholesRes, woRes] = await Promise.all([
        fetch(`${SUPA_URL}/rest/v1/wards?city_id=eq.bengaluru&select=ward_no,ward_name,assembly_constituency,zone&order=ward_no`, { headers }),
        fetch(`${SUPA_URL}/rest/v1/ward_spend_category?select=ward_no,grand_total,roads_and_infrastructure,water_and_sanitation,period&order=ward_no`, { headers }),
        fetch(`${SUPA_URL}/rest/v1/ward_potholes?select=ward_no,complaints&order=ward_no`, { headers }),
        fetch(`${SUPA_URL}/rest/v1/bbmp_work_orders?select=ward_no&order=ward_no`, { headers }),
      ])

      const [wards, spend, potholes, wos] = await Promise.all([
        wardsRes.json(), spendRes.json(), potholesRes.json(), woRes.json(),
      ])

      const spendMap = new Map(spend.map((s: { ward_no: number; grand_total: number; roads_and_infrastructure: number; water_and_sanitation: number; period: string }) =>
        [s.ward_no, s]
      ))
      const potholesMap = new Map(potholes.map((p: { ward_no: number; complaints: number }) =>
        [p.ward_no, p.complaints]
      ))
      const woCount = new Map<number, number>()
      for (const wo of wos) {
        woCount.set(wo.ward_no, (woCount.get(wo.ward_no) ?? 0) + 1)
      }

      const combined: WardRow[] = wards.map((w: { ward_no: number; ward_name: string; assembly_constituency: string; zone: string | null }) => {
        const s = spendMap.get(w.ward_no) as { grand_total: number; roads_and_infrastructure: number; water_and_sanitation: number; period: string } | undefined
        return {
          ward_no: w.ward_no,
          ward_name: w.ward_name,
          assembly_constituency: w.assembly_constituency,
          zone: w.zone,
          spend_grand_total: s?.grand_total ?? null,
          spend_roads_and_infrastructure: s?.roads_and_infrastructure ?? null,
          spend_water_and_sanitation: s?.water_and_sanitation ?? null,
          spend_period: s?.period ?? null,
          pothole_complaints: potholesMap.get(w.ward_no) ?? null,
          total_work_orders: woCount.get(w.ward_no) ?? 0,
        }
      })

      setRows(combined)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc")
    } else {
      setSortKey(key)
      setSortDir(key === "ward_no" ? "asc" : "desc")
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return rows
    return rows.filter(r =>
      r.ward_name.toLowerCase().includes(q) ||
      r.assembly_constituency?.toLowerCase().includes(q) ||
      String(r.ward_no).includes(q)
    )
  }, [rows, search])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (av === null || av === undefined) return 1
      if (bv === null || bv === undefined) return -1
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av))
    })
  }, [filtered, sortKey, sortDir])

  const columns: { key: SortKey; label: string; format: (r: WardRow) => string; align?: "right" }[] = [
    { key: "ward_no", label: "#", format: r => String(r.ward_no) },
    { key: "ward_name", label: "Ward", format: r => r.ward_name },
    { key: "assembly_constituency", label: "AC", format: r => r.assembly_constituency ?? "--" },
    { key: "spend_grand_total", label: "Total Spend (2018-23)", format: r => crores(r.spend_grand_total), align: "right" },
    { key: "spend_roads_and_infrastructure", label: "Roads & Infra (2018-23)", format: r => crores(r.spend_roads_and_infrastructure), align: "right" },
    { key: "spend_water_and_sanitation", label: "Water & Sanitation (2018-23)", format: r => crores(r.spend_water_and_sanitation), align: "right" },
    { key: "pothole_complaints", label: "Potholes (2022)", format: r => num(r.pothole_complaints), align: "right" },
    { key: "total_work_orders", label: "Work Orders", format: r => num(r.total_work_orders), align: "right" },
  ]

  const sortArrow = (key: SortKey) => {
    if (sortKey !== key) return ""
    return sortDir === "asc" ? " ^" : " v"
  }

  return (
    <div className="fixed inset-0 overflow-y-auto bg-[#0A0A0A] text-white" style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              <a href="/" className="hover:text-[#FF9933] transition-colors">KAUN<span className="text-[#FF9933]">?</span></a>
              <span className="text-white/30 font-normal ml-3 text-lg">Open Data</span>
            </h1>
            <p className="text-white/30 text-sm mt-1">Ward-level civic data for Bengaluru -- free for journalism, research, and civic use</p>
          </div>
          <a
            href="/api/export?type=all"
            className="hidden md:flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-[#FF9933]/10 text-[#FF9933] border border-[#FF9933]/20 hover:bg-[#FF9933]/20 transition-colors shrink-0"
          >
            Download CSV
          </a>
        </div>

        {/* Data Context */}
        <div className="rounded-xl bg-white/5 border border-white/10 p-5 mb-6 space-y-3">
          <p className="text-white/50 text-xs uppercase tracking-wider font-semibold">About this data</p>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <div>
                <p className="text-white/70">Ward Expenditure</p>
                <p className="text-white/30 text-xs">BBMP ward-level spending, 2018-2023 (5 fiscal years, cumulative). Source: <a href="https://data.opencity.in/dataset/bbmp-work-orders-categorised-2018-2023" target="_blank" rel="noopener noreferrer" className="text-[#FF9933]/60 hover:text-[#FF9933]">opencity.in</a></p>
              </div>
              <div>
                <p className="text-white/70">Pothole Complaints</p>
                <p className="text-white/30 text-xs">BBMP citizen complaint data, 2022. Source: <a href="https://data.opencity.in" target="_blank" rel="noopener noreferrer" className="text-[#FF9933]/60 hover:text-[#FF9933]">opencity.in</a></p>
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-white/70">Work Orders</p>
                <p className="text-white/30 text-xs">KPPP (Karnataka Public Procurement Platform) tender data, updated weekly. Source: <a href="https://eproc.karnataka.gov.in" target="_blank" rel="noopener noreferrer" className="text-[#FF9933]/60 hover:text-[#FF9933]">eproc.karnataka.gov.in</a></p>
              </div>
              <div>
                <p className="text-white/70">Why do some wards spend more?</p>
                <p className="text-white/30 text-xs">Spending varies by ward size, urbanization rate, and infrastructure needs. Outer wards (Horamavu, Atturu) have higher totals due to new roads, drainage, and water connections. This is cumulative across 7 categories over 5 years.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Search + mobile download */}
        <div className="flex items-center gap-3 mb-4">
          <input
            type="text"
            placeholder="Search ward, AC, or ward number..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#FF9933]/30"
          />
          <a
            href="/api/export?type=all"
            className="md:hidden flex items-center gap-2 text-xs px-3 py-2.5 rounded-lg bg-[#FF9933]/10 text-[#FF9933] border border-[#FF9933]/20 shrink-0"
          >
            CSV
          </a>
        </div>

        {/* Count */}
        <p className="text-white/20 text-xs mb-2">{filtered.length} ward{filtered.length !== 1 ? "s" : ""} {search && `matching "${search}"`}</p>

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 mb-6">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-20">
            <div className="w-6 h-6 border-2 border-white/20 border-t-[#FF9933] rounded-full animate-spin mx-auto" />
            <p className="text-white/30 text-sm mt-4">Loading ward data...</p>
          </div>
        )}

        {/* Table */}
        {!loading && sorted.length > 0 && (
          <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-white/10">
                    {columns.map(col => (
                      <th
                        key={col.key}
                        onClick={() => handleSort(col.key)}
                        className={`py-3 px-3 font-medium cursor-pointer hover:text-white/60 transition-colors select-none whitespace-nowrap ${
                          col.align === "right" ? "text-right" : "text-left"
                        } ${sortKey === col.key ? "text-[#FF9933]/70" : "text-white/40"}`}
                      >
                        {col.label}{sortArrow(col.key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {sorted.map(row => (
                    <tr key={row.ward_no} className="hover:bg-white/5 transition-colors">
                      {columns.map(col => (
                        <td
                          key={col.key}
                          className={`py-2.5 px-3 whitespace-nowrap ${
                            col.align === "right" ? "text-right font-mono" : ""
                          } ${col.key === "ward_name" ? "text-white/80 font-medium" : "text-white/50"}`}
                        >
                          {col.key === "ward_name" ? (
                            <a href={`/?ward=${row.ward_no}`} className="hover:text-[#FF9933] transition-colors">
                              {col.format(row)}
                            </a>
                          ) : (
                            col.format(row)
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 space-y-3 text-center">
          <p className="text-white/20 text-xs">
            All data is from public records and open datasets. kaun.city aggregates and maps it.
          </p>
          <p className="text-white/15 text-xs">
            Sources: BBMP via <a href="https://data.opencity.in" className="text-[#FF9933]/40 hover:text-[#FF9933]/60">opencity.in</a> | <a href="https://eproc.karnataka.gov.in" className="text-[#FF9933]/40 hover:text-[#FF9933]/60">KPPP</a> | <a href="https://myneta.info" className="text-[#FF9933]/40 hover:text-[#FF9933]/60">MyNeta/ADR</a> | Census 2011
          </p>
          <p className="text-white/10 text-xs">
            <a href="/" className="hover:text-white/30">kaun.city</a> -- open source civic accountability
          </p>
        </div>

      </div>
    </div>
  )
}
