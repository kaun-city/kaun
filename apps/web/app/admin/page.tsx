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

const EYEBROW = "text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60"
const CONTROL_LABEL = "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors disabled:cursor-not-allowed"
const PRIMARY = `min-h-11 px-4 bg-ink text-paper hover:bg-ink/85 disabled:bg-ink/15 disabled:text-ink/50 ${CONTROL_LABEL}`
const SECONDARY = `min-h-11 px-4 border border-ink/55 bg-paper text-ink hover:bg-paper-muted disabled:border-ink/20 disabled:text-ink/50 disabled:hover:bg-paper ${CONTROL_LABEL}`
const DESTRUCTIVE = `min-h-11 px-4 border border-danger/55 text-danger hover:bg-danger/[0.07] disabled:border-ink/20 disabled:text-ink/50 disabled:hover:bg-transparent ${CONTROL_LABEL}`

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
      <div className="signal-page fixed inset-0 flex items-center justify-center overflow-y-auto bg-paper-canvas p-4 text-ink">
        <div className="w-80 border border-ink/55 bg-paper p-6">
          <p className={EYEBROW}>Private desk</p>
          <h1 className="mt-1 text-xl font-bold text-ink">KAUN<span className="text-accent">?</span> Review</h1>
          <p className="mb-4 mt-1 text-sm text-ink/70">Enter the moderation password.</p>
          <label htmlFor="admin-password" className="sr-only">Admin password</label>
          <input
            id="admin-password"
            type="password"
            className={`mb-3 min-h-11 w-full border bg-paper-bright px-3 py-3 text-sm text-ink placeholder:text-ink/50 outline-none focus:border-ink/60 ${pwError ? "border-danger" : "border-ink/25"}`}
            placeholder="Password"
            value={pw}
            onChange={event => setPw(event.target.value)}
            onKeyDown={event => event.key === "Enter" && login()}
            autoFocus
          />
          {pwError && <p role="alert" className="mb-2 text-xs text-danger">Wrong password</p>}
          <button onClick={login} className={`w-full ${PRIMARY}`}>
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
    <div className="signal-page fixed inset-0 overflow-y-auto bg-paper-canvas text-ink">
      <div className="mx-auto max-w-4xl px-4 py-8 pb-24">
        <header className="signal-page-header mb-6 flex items-end justify-between gap-4 border-b-2 border-ink pb-4">
          <div>
            <p className={EYEBROW}>Evidence review</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">KAUN<span className="text-accent">?</span> Admin</h1>
            <p className="mt-1 text-sm text-ink/70">Publish only what can be checked.</p>
          </div>
          <button onClick={() => signOut()} className={SECONDARY}>Sign out</button>
        </header>

        <nav aria-label="Moderation queues" className="mb-5 grid grid-cols-2 border border-ink/55 bg-paper">
          {(["reports", "research"] as const).map(item => (
            <button
              key={item}
              onClick={() => changeQueue(item)}
              aria-current={queue === item ? "page" : undefined}
              className={`min-h-12 px-4 font-mono text-xs font-semibold uppercase tracking-[0.08em] transition-colors first:border-r first:border-ink/20 ${queue === item ? "bg-ink text-paper" : "text-ink/60 hover:bg-ink/5 hover:text-ink"}`}
            >
              {item === "reports" ? "Issue reports" : "Project research"}
            </button>
          ))}
        </nav>

        <div className="mb-4 flex flex-wrap gap-2 border-b border-ink/15 pb-3">
          {filters.map(item => (
            <button
              key={item}
              onClick={() => setFilter(item)}
              aria-pressed={filter === item}
              className={`min-h-11 border px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors ${filter === item ? "border-ink bg-ink text-paper" : "border-ink/20 bg-paper text-ink/60 hover:bg-paper-muted hover:text-ink"}`}
            >
              {item}
            </button>
          ))}
          <button onClick={() => void fetchQueue()} className={`ml-auto ${SECONDARY}`}>Refresh</button>
        </div>

        {actionMsg && <p role="status" className="mb-4 border border-info/35 bg-info/[0.07] px-3 py-3 text-sm text-info">{actionMsg}</p>}
        {loading && <p role="status" className="text-sm text-ink/60">Loading review queue…</p>}
        {!loading && empty && <p className="border border-ink/15 bg-paper p-5 text-sm text-ink/60">No {filter} {queue}.</p>}

        {!loading && queue === "reports" && reports.length > 0 && (
          <div className="space-y-3">
            {reports.map(report => (
              <article key={report.id} className="border border-ink/15 bg-paper p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink/60">
                      #{report.id} · {report.status} · {report.issue_type}{report.ward_name ? ` · ${report.ward_name}` : ""}
                    </p>
                    {report.description && <p className="mt-2 break-words text-base leading-relaxed text-ink/85">{report.description}</p>}
                    {report.ai_label && report.ai_label !== report.description && <p className="mt-1 text-sm italic text-ink/60">AI label: {report.ai_label}</p>}
                    <p className="mt-2 text-xs text-ink/60">{new Date(report.reported_at).toLocaleString("en-IN")} · {report.upvotes} upvotes</p>
                  </div>
                  {report.photo_url && <a href={report.photo_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={report.photo_url} alt="Submitted civic issue" className="h-20 w-20 border border-ink/15 object-cover" />
                  </a>}
                </div>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-ink/10 pt-3">
                  {report.status !== "approved" && <button disabled={actingId === report.id} onClick={() => void moderateReport(report.id, "approve")} className={PRIMARY}>Approve</button>}
                  {report.status !== "rejected" && <button disabled={actingId === report.id} onClick={() => void moderateReport(report.id, "reject")} className={SECONDARY}>Reject</button>}
                  <button disabled={actingId === report.id} onClick={() => void moderateReport(report.id, "delete")} className={`sm:ml-auto ${DESTRUCTIVE}`}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        )}

        {!loading && queue === "research" && research.length > 0 && (
          <div className="space-y-4">
            {research.map(item => (
              <article key={item.id} className="border border-ink/15 bg-paper p-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink/60">#{item.id} · {item.project_slug} · {item.status}</p>
                <h2 className="mt-2 text-base font-bold leading-snug text-ink">{item.question}</h2>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink/85">{item.answer}</p>
                <div className="mt-4 border-t border-ink/15 pt-3">
                  <p className={EYEBROW}>Sources</p>
                  <ol className="mt-2 divide-y divide-ink/10">
                    {item.sources.map((source, index) => (
                      <li key={source.url} className="flex gap-2 py-1.5 text-sm"><span className="w-5 shrink-0 font-mono tabular-nums text-ink/60">{index + 1}</span><a href={source.url} target="_blank" rel="noopener noreferrer" className="min-w-0 break-words text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">{source.title}</a></li>
                    ))}
                  </ol>
                </div>
                <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.06em] text-ink/60">Searched {new Date(item.searched_at).toLocaleString("en-IN")} · submitted {new Date(item.submitted_at).toLocaleString("en-IN")}</p>
                {item.status === "pending" && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-ink/10 pt-3">
                    <button disabled={actingId === item.id} onClick={() => void moderateResearch(item.id, "publish")} className={PRIMARY}>Publish</button>
                    <button disabled={actingId === item.id} onClick={() => void moderateResearch(item.id, "reject")} className={SECONDARY}>Reject</button>
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
