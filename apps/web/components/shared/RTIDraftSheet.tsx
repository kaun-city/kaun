"use client"

import { useState, useEffect } from "react"
import type { RTIDraftRequest } from "@/app/api/rti-draft/route"

interface Props {
  request: RTIDraftRequest | null
  onClose: () => void
}

const ISSUE_LABELS: Record<string, string> = {
  lad_funds:           "LAD Fund Non-Utilization",
  committee_meetings:  "Ward Committee Not Meeting",
  pothole_complaints:  "Unresolved Pothole Complaints",
  ward_spend:          "Ward Expenditure Details",
  work_orders:         "Work Order Status",
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
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="relative w-full max-w-lg bg-[#1a1a2e] rounded-t-2xl lg:rounded-2xl border border-white/10 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#FF9933]/20 text-[#FF9933] uppercase tracking-wider">RTI</span>
                <span className="text-white/70 text-sm font-medium">{ISSUE_LABELS[request.issue_type]}</span>
              </div>
              <p className="text-white/30 text-xs">{request.ward_name} Ward</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-white/50 hover:text-white">
              x
            </button>
          </div>
        </div>

        {/* Applicant fields */}
        <div className="px-5 py-3 border-b border-white/5 shrink-0">
          <p className="text-white/30 text-[10px] uppercase tracking-wider mb-2">Your details (fills the draft)</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your full name"
              className="col-span-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30"
            />
            <input
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Your address"
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30"
            />
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="Phone (optional)"
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30"
            />
          </div>
        </div>

        {/* Draft area */}
        <div className="flex-1 overflow-y-auto px-5 py-3 min-h-0">
          {loading && (
            <div className="space-y-2 py-2">
              {[...Array(8)].map((_, i) => (
                <div key={i} className={`h-3 bg-white/10 rounded animate-pulse ${i % 3 === 2 ? "w-3/5" : "w-full"}`} />
              ))}
            </div>
          )}
          {error && (
            <p className="text-white/30 text-sm text-center py-8">Could not generate draft. Try again.</p>
          )}
          {finalDraft && (
            <pre className="text-white/70 text-xs leading-relaxed whitespace-pre-wrap font-mono">{finalDraft}</pre>
          )}
        </div>

        {/* Footer */}
        {finalDraft && (
          <div className="px-5 pb-5 pt-3 border-t border-white/10 shrink-0 space-y-2">
            <p className="text-white/20 text-[10px]">To: {authority}</p>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex-1 py-2.5 rounded-xl bg-[#FF9933] text-black font-semibold text-sm hover:bg-[#FF9933]/90 transition-colors"
              >
                {copied ? "Copied!" : "Copy RTI Draft"}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-white/10 text-white/60 text-sm hover:bg-white/15 transition-colors"
              >
                Close
              </button>
            </div>
            <p className="text-white/15 text-[10px] text-center">
              Review before sending. Enclose Rs 10 fee (postal order / court fee stamp).
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
