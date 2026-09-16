"use client"

import { useState, useEffect } from "react"
import type { RTIDraftRequest } from "@/app/api/rti-draft/route"

interface Props {
  request: RTIDraftRequest | null
  onClose: () => void
}

const ISSUE_LABELS: Record<string, string> = {
  lad_funds:           "LAD fund non-utilization",
  committee_meetings:  "Ward committee not meeting",
  pothole_complaints:  "Unresolved pothole complaints",
  ward_spend:          "Ward expenditure details",
  work_orders:         "Work order status",
}

export function RTIDraftSheet({ request, onClose }: Props) {
  const [draft, setDraft]       = useState<string | null>(null)
  const [authority, setAuthority] = useState("")
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(false)
  const [copied, setCopied]     = useState(false)
  const [name, setName]         = useState("")
  const [address, setAddress]   = useState("")
  const [phone, setPhone]       = useState("")

  useEffect(() => {
    if (!request) { setDraft(null); return }
    setLoading(true)
    setError(false)
    setDraft(null)
    fetch("/api/rti-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    })
      .then(r => r.json())
      .then(j => { setDraft(j.draft); setAuthority(j.authority) })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [request])

  useEffect(() => {
    if (!request) return
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose()
    document.addEventListener("keydown", closeOnEscape)
    return () => document.removeEventListener("keydown", closeOnEscape)
  }, [request, onClose])

  if (!request) return null

  const finalDraft = draft
    ?.replace(/\[APPLICANT NAME\]/g, name || "[Your Name]")
    .replace(/\[APPLICANT ADDRESS\]/g, address || "[Your Address]")
    .replace(/\[APPLICANT PHONE\]/g, phone || "[Your Phone]")

  async function handleCopy() {
    if (!finalDraft) return
    await navigator.clipboard.writeText(finalDraft)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-[1200] flex items-end lg:items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="rti-sheet-title">
      {/* Backdrop */}
      <div className="signal-backdrop absolute inset-0 bg-ink/45" onClick={onClose} />

      {/* Sheet */}
      <div className="signal-panel relative w-full max-w-lg bg-paper border-t-2 border-ink lg:border lg:border-ink/55 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-ink/15 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="inline-flex items-center border border-ink/20 px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-ink/70">RTI</span>
                <span id="rti-sheet-title" className="text-ink text-sm font-semibold">{ISSUE_LABELS[request.issue_type]}</span>
              </div>
              <p className="text-ink/60 text-xs">{request.ward_name} Ward</p>
            </div>
            <button onClick={onClose} aria-label="Close RTI draft" className="shrink-0 w-11 h-11 flex items-center justify-center border border-ink/20 text-ink/60 text-lg hover:bg-ink/5 hover:text-ink transition-colors">
              &times;
            </button>
          </div>
        </div>

        {/* Applicant fields */}
        <div className="px-5 py-3 border-b border-ink/10 shrink-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60 mb-2">Your details (fills the draft)</p>
          <div className="grid grid-cols-2 gap-2">
            <label htmlFor="rti-applicant-name" className="sr-only">Your full name</label>
            <input
              id="rti-applicant-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your full name"
              className="col-span-2 bg-paper-bright border border-ink/25 min-h-11 px-3 py-2 text-sm text-ink placeholder:text-ink/50 focus:outline-none focus:border-ink/60"
            />
            <label htmlFor="rti-applicant-address" className="sr-only">Your address</label>
            <input
              id="rti-applicant-address"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Your address"
              className="bg-paper-bright border border-ink/25 min-h-11 px-3 py-2 text-sm text-ink placeholder:text-ink/50 focus:outline-none focus:border-ink/60"
            />
            <label htmlFor="rti-applicant-phone" className="sr-only">Phone number, optional</label>
            <input
              id="rti-applicant-phone"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="Phone (optional)"
              className="bg-paper-bright border border-ink/25 min-h-11 px-3 py-2 text-sm text-ink placeholder:text-ink/50 focus:outline-none focus:border-ink/60"
            />
          </div>
        </div>

        {/* Draft area */}
        <div className="flex-1 overflow-y-auto px-5 py-3 min-h-0">
          {loading && (
            <div className="space-y-2 py-2">
              {[...Array(8)].map((_, i) => (
                <div key={i} className={`h-3 bg-ink/10 animate-pulse ${i % 3 === 2 ? "w-3/5" : "w-full"}`} />
              ))}
            </div>
          )}
          {error && (
            <p className="my-4 bg-danger/[0.07] border border-danger/35 px-4 py-3 text-danger text-sm text-center">Could not generate draft. Try again.</p>
          )}
          {finalDraft && (
            <>
              <p className="mb-2 text-[11px] text-ink/60">AI-generated. Verify important claims before acting.</p>
              <pre className="text-ink/85 text-xs leading-relaxed whitespace-pre-wrap font-mono">{finalDraft}</pre>
            </>
          )}
        </div>

        {/* Footer */}
        {finalDraft && (
          <div className="px-5 pb-5 pt-3 border-t border-ink/15 shrink-0 space-y-2">
            <p className="text-ink/60 text-xs">To: {authority}</p>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex-1 min-h-11 px-4 bg-ink text-paper font-mono text-[11px] font-semibold uppercase tracking-[0.08em] hover:bg-ink/85 transition-colors"
              >
                {copied ? "Copied" : "Copy RTI draft"}
              </button>
              <button
                onClick={onClose}
                className="min-h-11 px-4 bg-paper border border-ink/55 text-ink font-mono text-[11px] font-semibold uppercase tracking-[0.08em] hover:bg-paper-muted transition-colors"
              >
                Close
              </button>
            </div>
            <p className="text-ink/60 text-xs text-center">
              Review before sending. Enclose ₹10 fee (postal order / court fee stamp).
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
