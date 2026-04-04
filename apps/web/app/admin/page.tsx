"use client"

import { useState, useEffect, useCallback } from "react"

interface Report {
  id: number
  ward_name: string | null
  issue_type: string
  description: string | null
  ai_label: string | null
  status: string
  photo_url: string | null
  upvotes: number
  reported_at: string
}

const ADMIN_PASSWORD_KEY = "kaun_admin_pw"

export default function AdminPage() {
  const [authed, setAuthed]       = useState(false)
  const [pw, setPw]               = useState("")
  const [pwError, setPwError]     = useState(false)
  const [reports, setReports]     = useState<Report[]>([])
  const [loading, setLoading]     = useState(false)
  const [filter, setFilter]       = useState<"pending" | "approved" | "rejected" | "all">("pending")
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  // Check session password (stored in sessionStorage — gone on tab close)
  useEffect(() => {
    const stored = sessionStorage.getItem(ADMIN_PASSWORD_KEY)
    if (stored) setAuthed(true)
  }, [])

  const login = () => {
    // Password is validated server-side via CRON_SECRET — we just use it as the Bearer token
    sessionStorage.setItem(ADMIN_PASSWORD_KEY, pw)
    setAuthed(true)
    setPwError(false)
  }

  const getStoredPw = () => sessionStorage.getItem(ADMIN_PASSWORD_KEY) ?? ""

  const fetchReports = useCallback(async () => {
    setLoading(true)
    try {
      const params = filter === "all" ? "" : `?status=${filter}`
      const res = await fetch(`/api/admin/reports${params}`, {
        headers: { authorization: `Bearer ${getStoredPw()}` },
      })
      if (res.status === 401) {
        sessionStorage.removeItem(ADMIN_PASSWORD_KEY)
        setAuthed(false)
        setPwError(true)
        return
      }
      const data = await res.json()
      setReports(data.reports ?? [])
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    if (authed) fetchReports()
  }, [authed, fetchReports])

  const moderate = async (id: number, action: "delete" | "reject" | "approve") => {
    const endpoint = action === "approve" ? "/api/admin/reports" : "/api/moderate-report"
    const body = action === "approve"
      ? JSON.stringify({ id, action: "approve" })
      : JSON.stringify({ id, action })

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${getStoredPw()}`, "content-type": "application/json" },
      body,
    })
    const data = await res.json()
    if (data.ok) {
      setActionMsg(`${action}d #${id}`)
      setReports(r => r.filter(x => x.id !== id))
      setTimeout(() => setActionMsg(null), 3000)
    } else {
      setActionMsg(`Error: ${data.error}`)
    }
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center overflow-y-auto p-4">
        <div className="w-80 bg-zinc-900 border border-white/10 rounded-2xl p-6">
          <p className="text-white font-semibold mb-1">KAUN? Admin</p>
          <p className="text-white/40 text-sm mb-4">Enter your admin password</p>
          <input
            type="password"
            className={`w-full bg-white/5 border ${pwError ? "border-red-500" : "border-white/10"} rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-white/30 mb-3`}
            placeholder="Password"
            value={pw}
            onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key === "Enter" && login()}
            autoFocus
          />
          {pwError && <p className="text-red-400 text-xs mb-2">Wrong password</p>}
          <button
            onClick={login}
            className="w-full bg-[#FF9933] text-black font-semibold rounded-lg py-2 text-sm hover:bg-[#FF9933]/80 transition-colors"
          >
            Sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-8 pb-24">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold">KAUN? Admin</h1>
            <p className="text-white/30 text-xs mt-0.5">Report moderation</p>
          </div>
          <button
            onClick={() => { sessionStorage.removeItem(ADMIN_PASSWORD_KEY); setAuthed(false) }}
            className="text-white/30 text-sm hover:text-white/60"
          >
            Sign out
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-4">
          {(["pending", "approved", "rejected", "all"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f
                  ? "bg-white/15 text-white"
                  : "text-white/30 hover:text-white/60"
              }`}
            >
              {f}
            </button>
          ))}
          <button onClick={fetchReports} className="ml-auto text-white/30 text-xs hover:text-white/60">↻ refresh</button>
        </div>

        {actionMsg && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
            {actionMsg}
          </div>
        )}

        {loading ? (
          <p className="text-white/30 text-sm">Loading...</p>
        ) : reports.length === 0 ? (
          <p className="text-white/30 text-sm">No {filter} reports.</p>
        ) : (
          <div className="space-y-3">
            {reports.map(r => (
              <div key={r.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-[10px] font-mono text-white/30">#{r.id}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        r.status === "pending" ? "bg-yellow-500/20 text-yellow-400"
                        : r.status === "approved" ? "bg-green-500/20 text-green-400"
                        : "bg-red-500/20 text-red-400"
                      }`}>{r.status}</span>
                      <span className="text-[10px] bg-white/10 text-white/50 px-1.5 py-0.5 rounded">{r.issue_type}</span>
                      {r.ward_name && <span className="text-[10px] text-white/40">{r.ward_name}</span>}
                      <span className="text-[10px] text-white/20">{new Date(r.reported_at).toLocaleString("en-IN")}</span>
                    </div>
                    {r.description && (
                      <p className="text-sm text-white/70 mb-1 break-words">{r.description}</p>
                    )}
                    {r.ai_label && r.ai_label !== r.description && (
                      <p className="text-xs text-white/40 italic">AI: {r.ai_label}</p>
                    )}
                    {r.upvotes > 0 && <p className="text-[10px] text-white/30 mt-1">{r.upvotes} upvote{r.upvotes > 1 ? "s" : ""}</p>}
                  </div>
                  {r.photo_url && (
                    <a href={r.photo_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.photo_url} alt="report" className="w-16 h-16 rounded-lg object-cover border border-white/10" />
                    </a>
                  )}
                </div>
                <div className="flex gap-2 mt-3">
                  {r.status !== "approved" && (
                    <button
                      onClick={() => moderate(r.id, "approve")}
                      className="px-3 py-1 rounded-lg bg-green-500/15 text-green-400 text-xs font-medium hover:bg-green-500/25 transition-colors"
                    >
                      Approve
                    </button>
                  )}
                  {r.status !== "rejected" && (
                    <button
                      onClick={() => moderate(r.id, "reject")}
                      className="px-3 py-1 rounded-lg bg-yellow-500/15 text-yellow-400 text-xs font-medium hover:bg-yellow-500/25 transition-colors"
                    >
                      Reject
                    </button>
                  )}
                  <button
                    onClick={() => moderate(r.id, "delete")}
                    className="px-3 py-1 rounded-lg bg-red-500/15 text-red-400 text-xs font-medium hover:bg-red-500/25 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
