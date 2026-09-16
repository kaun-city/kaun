"use client"

import { useCallback, useEffect, useState } from "react"

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

interface ResearchSubmission {
  id: number
  project_slug: string
  question: string
  answer: string
  sources: Array<{ title: string; url: string }>
  searched_at: string
  submitted_at: string
  status: string
  review_note: string | null
}

type Queue = "reports" | "research"
type Filter = "pending" | "approved" | "published" | "rejected" | "all"

const ADMIN_PASSWORD_KEY = "kaun_admin_pw"

export default function AdminPage() {
  const [authed, setAuthed] = useState(false)
  const [pw, setPw] = useState("")
  const [pwError, setPwError] = useState(false)
  const [queue, setQueue] = useState<Queue>("reports")
  const [filter, setFilter] = useState<Filter>("pending")
  const [reports, setReports] = useState<Report[]>([])
  const [research, setResearch] = useState<ResearchSubmission[]>([])
  const [loading, setLoading] = useState(false)
  const [actingId, setActingId] = useState<number | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  useEffect(() => {
    if (sessionStorage.getItem(ADMIN_PASSWORD_KEY)) setAuthed(true)
  }, [])

  const getStoredPw = () => sessionStorage.getItem(ADMIN_PASSWORD_KEY) ?? ""

  const signOut = useCallback((wrongPassword = false) => {
    sessionStorage.removeItem(ADMIN_PASSWORD_KEY)
    setAuthed(false)
    setPwError(wrongPassword)
  }, [])

  const fetchQueue = useCallback(async () => {
    setLoading(true)
    try {
      const activeFilter = filter === "all" ? "" : `?status=${filter}`
      const endpoint = queue === "reports" ? "/api/admin/reports" : "/api/admin/project-research"
      const response = await fetch(`${endpoint}${activeFilter}`, {
        headers: { authorization: `Bearer ${getStoredPw()}` },
      })
      if (response.status === 401) return signOut(true)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not load moderation queue.")
      if (queue === "reports") setReports(data.reports ?? [])
      else setResearch(data.research ?? [])
    } catch (error: unknown) {
      setActionMsg(error instanceof Error ? error.message : "Could not load moderation queue.")
    } finally {
      setLoading(false)
    }
  }, [filter, queue, signOut])

  useEffect(() => {
    if (authed) void fetchQueue()
  }, [authed, fetchQueue])

  function login() {
    if (!pw.trim()) return
    sessionStorage.setItem(ADMIN_PASSWORD_KEY, pw)
    setPwError(false)
    setAuthed(true)
  }

  function changeQueue(next: Queue) {
    setQueue(next)
    setFilter("pending")
    setActionMsg(null)
  }

  async function moderateReport(id: number, action: "delete" | "reject" | "approve") {
    if (action === "delete" && !window.confirm(`Permanently delete report #${id}?`)) return
    setActingId(id)
    const endpoint = action === "approve" ? "/api/admin/reports" : "/api/moderate-report"
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${getStoredPw()}`, "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      })
      if (response.status === 401) return signOut(true)
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error || "Moderation failed.")
      setReports(items => items.filter(item => item.id !== id))
      setActionMsg(`${action}d report #${id}`)
    } catch (error: unknown) {
      setActionMsg(error instanceof Error ? error.message : "Moderation failed.")
    } finally {
      setActingId(null)
    }
  }

  async function moderateResearch(id: number, action: "publish" | "reject") {
    setActingId(id)
    try {
      const response = await fetch("/api/admin/project-research", {
        method: "POST",
        headers: { authorization: `Bearer ${getStoredPw()}`, "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      })
      if (response.status === 401) return signOut(true)
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error || "Moderation failed.")
      setResearch(items => items.filter(item => item.id !== id))
      setActionMsg(`${action === "publish" ? "Published" : "Rejected"} research #${id}`)
    } catch (error: unknown) {
      setActionMsg(error instanceof Error ? error.message : "Moderation failed.")
    } finally {
      setActingId(null)
    }
  }

  if (!authed) {
    return (
      <div className="signal-page fixed inset-0 flex items-center justify-center overflow-y-auto p-4">
        <div className="w-80 border-2 border-[var(--signal-ink)] bg-[var(--signal-paper)] p-6 shadow-[6px_6px_0_rgba(22,19,14,0.18)]">
          <p className="font-mono text-xs font-bold uppercase tracking-[0.1em] text-[#c25400]">Private desk</p>
          <h1 className="mt-1 text-xl font-bold text-white">KAUN? Review</h1>
          <p className="mb-4 mt-1 text-sm text-white/40">Enter the moderation password.</p>
          <label htmlFor="admin-password" className="sr-only">Admin password</label>
          <input
            id="admin-password"
            type="password"
            className={`mb-3 w-full border px-3 py-3 text-sm outline-none ${pwError ? "border-red-500" : "border-white/10"}`}
            placeholder="Password"
            value={pw}
            onChange={event => setPw(event.target.value)}
            onKeyDown={event => event.key === "Enter" && login()}
            autoFocus
          />
          {pwError && <p role="alert" className="mb-2 text-xs text-red-400">Wrong password</p>}
          <button onClick={login} className="min-h-12 w-full bg-[#FF9933] px-4 py-3 text-sm font-bold uppercase tracking-[0.08em] text-black">
            Sign in
          </button>
        </div>
      </div>
    )
  }

  const filters: Filter[] = queue === "reports"
    ? ["pending", "approved", "rejected", "all"]
    : ["pending", "published", "rejected", "all"]
  const empty = queue === "reports" ? reports.length === 0 : research.length === 0

  return (
    <div className="signal-page fixed inset-0 overflow-y-auto text-white">
      <div className="mx-auto max-w-4xl px-4 py-8 pb-24">
        <header className="signal-page-header mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-[0.1em] text-[#c25400]">Evidence review</p>
            <h1 className="mt-1 text-2xl font-bold">KAUN? Admin</h1>
            <p className="mt-1 text-sm text-white/40">Publish only what can be checked.</p>
          </div>
          <button onClick={() => signOut()} className="min-h-11 border border-white/20 px-3 text-sm text-white/40">Sign out</button>
        </header>

        <nav aria-label="Moderation queues" className="mb-5 grid grid-cols-2 border-2 border-[#16130e]">
          {(["reports", "research"] as const).map(item => (
            <button
              key={item}
              onClick={() => changeQueue(item)}
              aria-current={queue === item ? "page" : undefined}
              className={`min-h-12 px-4 text-sm font-bold uppercase tracking-[0.08em] ${queue === item ? "bg-[#16130e] text-[#f8f5ef]" : "bg-[#f8f5ef] text-[#16130e]/65"}`}
            >
              {item === "reports" ? "Issue reports" : "Project research"}
            </button>
          ))}
        </nav>

        <div className="mb-4 flex flex-wrap gap-2 border-b border-white/15 pb-3">
          {filters.map(item => (
            <button
              key={item}
              onClick={() => setFilter(item)}
              className={`min-h-11 border px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] ${filter === item ? "border-[#c25400] text-[#c25400]" : "border-white/20 text-white/40"}`}
            >
              {item}
            </button>
          ))}
          <button onClick={() => void fetchQueue()} className="ml-auto min-h-11 px-3 text-xs font-bold uppercase tracking-[0.08em] text-white/40">Refresh</button>
        </div>

        {actionMsg && <p role="status" className="mb-4 border border-green-500/25 bg-green-500/10 px-3 py-3 text-sm text-green-400">{actionMsg}</p>}
        {loading && <p role="status" className="text-sm text-white/40">Loading review queue…</p>}
        {!loading && empty && <p className="border border-white/20 bg-white/5 p-5 text-sm text-white/40">No {filter} {queue}.</p>}

        {!loading && queue === "reports" && reports.length > 0 && (
          <div className="space-y-3">
            {reports.map(report => (
              <article key={report.id} className="border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/30">
                      #{report.id} · {report.status} · {report.issue_type}{report.ward_name ? ` · ${report.ward_name}` : ""}
                    </p>
                    {report.description && <p className="mt-2 break-words text-base leading-relaxed text-white/70">{report.description}</p>}
                    {report.ai_label && report.ai_label !== report.description && <p className="mt-1 text-sm italic text-white/40">AI label: {report.ai_label}</p>}
                    <p className="mt-2 text-xs text-white/25">{new Date(report.reported_at).toLocaleString("en-IN")} · {report.upvotes} upvotes</p>
                  </div>
                  {report.photo_url && <a href={report.photo_url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={report.photo_url} alt="Submitted civic issue" className="h-20 w-20 border border-white/10 object-cover" />
                  </a>}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {report.status !== "approved" && <button disabled={actingId === report.id} onClick={() => void moderateReport(report.id, "approve")} className="min-h-11 border border-green-500/30 bg-green-500/10 px-3 text-xs font-bold uppercase text-green-400 disabled:opacity-40">Approve</button>}
                  {report.status !== "rejected" && <button disabled={actingId === report.id} onClick={() => void moderateReport(report.id, "reject")} className="min-h-11 border border-yellow-500/30 bg-yellow-500/10 px-3 text-xs font-bold uppercase text-yellow-400 disabled:opacity-40">Reject</button>}
                  <button disabled={actingId === report.id} onClick={() => void moderateReport(report.id, "delete")} className="min-h-11 border border-red-500/30 bg-red-500/10 px-3 text-xs font-bold uppercase text-red-400 disabled:opacity-40">Delete</button>
                </div>
              </article>
            ))}
          </div>
        )}

        {!loading && queue === "research" && research.length > 0 && (
          <div className="space-y-4">
            {research.map(item => (
              <article key={item.id} className="border-2 border-[#16130e] bg-[#fffdf8] p-4 shadow-[5px_5px_0_rgba(22,19,14,0.12)]">
                <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/30">#{item.id} · {item.project_slug} · {item.status}</p>
                <h2 className="mt-2 text-base font-bold leading-snug">{item.question}</h2>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-white/70">{item.answer}</p>
                <div className="mt-4 border-t border-white/15 pt-3">
                  <p className="text-xs font-bold uppercase tracking-[0.08em] text-white/30">Sources</p>
                  <ol className="mt-2 space-y-1">
                    {item.sources.map((source, index) => (
                      <li key={source.url} className="text-sm"><span className="mr-2 font-mono text-[#c25400]">{index + 1}</span><a href={source.url} target="_blank" rel="noopener noreferrer" className="underline decoration-[#c25400]/50 underline-offset-2">{source.title}</a></li>
                    ))}
                  </ol>
                </div>
                <p className="mt-3 text-xs text-white/25">Searched {new Date(item.searched_at).toLocaleString("en-IN")} · submitted {new Date(item.submitted_at).toLocaleString("en-IN")}</p>
                {item.status === "pending" && (
                  <div className="mt-4 flex gap-2">
                    <button disabled={actingId === item.id} onClick={() => void moderateResearch(item.id, "publish")} className="min-h-11 border border-green-500/30 bg-green-500/10 px-3 text-xs font-bold uppercase text-green-400 disabled:opacity-40">Publish</button>
                    <button disabled={actingId === item.id} onClick={() => void moderateResearch(item.id, "reject")} className="min-h-11 border border-red-500/30 bg-red-500/10 px-3 text-xs font-bold uppercase text-red-400 disabled:opacity-40">Reject</button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
