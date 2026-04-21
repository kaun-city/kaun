"use client"

const API_BASE = "https://kaun.city/api/data"

const ENDPOINTS = [
  {
    name: "Wards",
    path: "/api/data/wards",
    description: "All 243 Bengaluru wards with assembly constituency and zone mapping.",
    params: [
      { name: "ward", description: "Ward number for detailed data (infrastructure, spending, work orders, potholes, crashes, air quality)" },
    ],
    examples: [
      { label: "All wards", url: `${API_BASE}/wards` },
      { label: "Ward 42 detail", url: `${API_BASE}/wards?ward=42` },
    ],
  },
  {
    name: "Contractors",
    path: "/api/data/contractors",
    description: "1,300+ contractor profiles with entity resolution (phone-based alias grouping), total contract value, ward spread, deduction rates, and blacklist flags.",
    params: [
      { name: "ward", description: "Filter contractors active in a specific ward" },
      { name: "flagged", description: "Set to 'true' to get only blacklist-flagged contractors" },
      { name: "limit", description: "Max results (default 100, max 500)" },
    ],
    examples: [
      { label: "Top contractors by value", url: `${API_BASE}/contractors?limit=10` },
      { label: "Flagged contractors", url: `${API_BASE}/contractors?flagged=true` },
      { label: "Contractors in ward 42", url: `${API_BASE}/contractors?ward=42` },
    ],
  },
  {
    name: "Elected Representatives",
    path: "/api/data/reps",
    description: "MLA and corporator data with criminal cases, assets, attendance, LAD fund utilization, and report cards from EC affidavits.",
    params: [
      { name: "constituency", description: "Filter by assembly constituency name (partial match)" },
      { name: "role", description: "Filter by role: MLA, MP, CORPORATOR" },
    ],
    examples: [
      { label: "All MLAs", url: `${API_BASE}/reps?role=MLA` },
      { label: "Yelahanka constituency", url: `${API_BASE}/reps?constituency=Yelahanka` },
    ],
  },
  {
    name: "Spending",
    path: "/api/data/spending",
    description: "BBMP budget, work orders, ward-level spending by category, and property tax collections.",
    params: [
      { name: "ward", description: "Ward number for ward-specific data" },
      { name: "type", description: "budget, work-orders, ward-spending, property-tax, or all" },
    ],
    examples: [
      { label: "City budget", url: `${API_BASE}/spending?type=budget` },
      { label: "Work orders ward 42", url: `${API_BASE}/spending?ward=42&type=work-orders` },
    ],
  },
  {
    name: "CSV Export",
    path: "/api/export",
    description: "Full ward-level dataset as downloadable CSV. Demographics, infrastructure, spending by category, potholes, crashes, air quality, work order counts. Source attribution footer included.",
    params: [
      { name: "type", description: "all, ward-spending, or ward-demographics" },
    ],
    examples: [
      { label: "Full dataset (CSV)", url: "https://kaun.city/api/export?type=all" },
    ],
  },
]

const DATA_SOURCES = [
  { name: "BBMP Work Orders", records: "7,136", period: "2024-25", source: "opencity.in", url: "https://data.opencity.in" },
  { name: "Contractor Profiles", records: "1,305", period: "2024-25", source: "Entity-resolved from work orders", url: null },
  { name: "Elected Representatives", records: "28 ACs", period: "2023 election", source: "MyNeta / EC affidavits", url: "https://myneta.info" },
  { name: "Rep Report Cards", records: "28 MLAs", period: "2018-23 term", source: "CIVIC Bengaluru via opencity.in", url: "https://opencity.in" },
  { name: "Ward Boundaries", records: "243 wards", period: "2022 delimitation", source: "datameet", url: "https://github.com/datameet" },
  { name: "Traffic Signals", records: "Per ward", period: "2026", source: "OpenStreetMap Overpass API", url: "https://openstreetmap.org" },
  { name: "Bus Stops + Routes", records: "Per ward", period: "2026", source: "BMTC via opencity.in", url: "https://data.opencity.in" },
  { name: "Ward Spending", records: "198 wards", period: "2018-2023", source: "BBMP work orders categorised", url: "https://data.opencity.in/dataset/bbmp-work-orders-categorised-2018-2023" },
  { name: "Pothole Complaints", records: "Per ward", period: "2022", source: "Fix My Street via opencity.in", url: "https://opencity.in" },
  { name: "Road Crashes", records: "Per ward", period: "2024-25", source: "Bengaluru Traffic Police", url: null },
  { name: "Air Quality", records: "Per station", period: "2024-25", source: "KSPCB / CPCB", url: null },
  { name: "BBMP Budget", records: "City-wide", period: "2025-26", source: "BBMP via opencity.in", url: "https://opencity.in" },
  { name: "Blacklist Cross-Reference", records: "4 flagged", period: "Live", source: "GeM, World Bank, CPPP, KPCL, BNP/RTI", url: null },
]

export default function DataCatalog() {
  return (
    <div className="fixed inset-0 overflow-y-auto bg-[#0A0A0A] text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">

        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">
            <a href="/" className="hover:text-[#FF9933] transition-colors">KAUN<span className="text-[#FF9933]">?</span></a>
            <span className="text-white/30 font-normal ml-3 text-lg">Open Data</span>
          </h1>
          <p className="text-white/50 text-sm mt-2 max-w-2xl leading-relaxed">
            Public APIs for Bengaluru civic data. Free, open, CORS-enabled. Built for civic tools,
            journalism, research, and public interest. All data from public records.
          </p>
          <div className="flex gap-3 mt-3">
            <a href="https://github.com/kaun-city/kaun" target="_blank" rel="noopener noreferrer" className="text-[#FF9933] text-xs hover:underline">GitHub</a>
            <span className="text-white/15">·</span>
            <a href="/status" className="text-white/40 text-xs hover:text-white/60">System Status</a>
            <span className="text-white/15">·</span>
            <a href="/api/export?type=all" className="text-white/40 text-xs hover:text-white/60">Download CSV</a>
          </div>
        </div>

        {/* API Endpoints */}
        <div className="space-y-6 mb-12">
          <h2 className="text-white/40 text-xs uppercase tracking-wider">API Endpoints</h2>
          {ENDPOINTS.map(ep => (
            <div key={ep.path} className="rounded-xl bg-white/5 p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-green-400 text-xs font-mono font-bold">GET</span>
                <code className="text-white font-mono text-sm">{ep.path}</code>
              </div>
              <p className="text-white/50 text-sm leading-relaxed">{ep.description}</p>

              {ep.params.length > 0 && (
                <div className="mt-3">
                  <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1">Parameters</p>
                  <div className="space-y-1">
                    {ep.params.map(p => (
                      <div key={p.name} className="flex gap-2 text-xs">
                        <code className="text-[#FF9933]/70 font-mono shrink-0">{p.name}</code>
                        <span className="text-white/30">{p.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-3">
                <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1">Try it</p>
                <div className="flex flex-wrap gap-2">
                  {ep.examples.map(ex => (
                    <a
                      key={ex.url}
                      href={ex.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/80 font-mono transition-colors"
                    >
                      {ex.label}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Data Sources */}
        <div className="mb-8">
          <h2 className="text-white/40 text-xs uppercase tracking-wider mb-4">Data Sources</h2>
          <div className="rounded-xl bg-white/5 overflow-hidden">
            <div className="divide-y divide-white/5">
              {DATA_SOURCES.map(ds => (
                <div key={ds.name} className="px-4 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-white/80 text-sm">{ds.name}</p>
                    <p className="text-white/30 text-xs mt-0.5">
                      {ds.records} · {ds.period}
                      {ds.url && (
                        <> · <a href={ds.url} target="_blank" rel="noopener noreferrer" className="text-[#FF9933]/50 hover:text-[#FF9933]">{ds.source}</a></>
                      )}
                      {!ds.url && <> · {ds.source}</>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Usage */}
        <div className="rounded-xl bg-white/5 p-5 mb-8">
          <h2 className="text-white/40 text-xs uppercase tracking-wider mb-3">Usage</h2>
          <p className="text-white/50 text-sm leading-relaxed mb-3">
            All endpoints return JSON with CORS headers enabled. No API key required. Rate limited to 60 requests/minute per IP.
          </p>
          <pre className="text-xs font-mono text-white/60 bg-black/30 p-3 rounded-lg overflow-x-auto">
{`curl -s "https://kaun.city/api/data/contractors?flagged=true" | jq .

fetch("https://kaun.city/api/data/wards?ward=42")
  .then(r => r.json())
  .then(data => console.log(data))`}
          </pre>
        </div>

        <div className="text-center space-y-1">
          <p className="text-white/15 text-xs">
            All data is from public records. kaun.city aggregates and serves — we don&apos;t generate the underlying data.
          </p>
          <p className="text-white/10 text-xs">
            kaun.city · open source civic accountability · MIT license
          </p>
        </div>
      </div>
    </div>
  )
}
