"use client"

import { useEffect, useRef, useState } from "react"
import type { HistoricalWardRef } from "@/lib/gba-crosswalk"

const ISSUE_TYPES = [
  { value: "hoarding",      label: "Illegal banner / hoarding",    icon: "!" },
  { value: "pothole",       label: "Pothole / broken road",        icon: "~" },
  { value: "flooding",      label: "Waterlogging / flooding",      icon: "W" },
  { value: "construction",  label: "Unauthorized construction",    icon: "C" },
  { value: "encroachment",  label: "Encroachment / no parking",    icon: "E" },
  { value: "garbage",       label: "Garbage dump / open waste",    icon: "G" },
  { value: "signal",        label: "Broken traffic signal",        icon: "S" },
  { value: "other",         label: "Other civic issue",            icon: "?" },
] as const

const COMPLAINT_AUTHORITY: Record<string, { name: string; number: string; url?: string }> = {
  hoarding:      { name: "BBMP",  number: "1533", url: "https://bbmpcitizen.com/" },
  pothole:       { name: "BBMP",  number: "1533", url: "https://bbmpcitizen.com/" },
  flooding:      { name: "BBMP",  number: "1533", url: "https://bbmpcitizen.com/" },
  construction:  { name: "BBMP",  number: "1533", url: "https://bbmpcitizen.com/" },
  encroachment:  { name: "BBMP",  number: "1533", url: "https://bbmpcitizen.com/" },
  garbage:       { name: "BBMP",  number: "1533", url: "https://bbmpcitizen.com/" },
  signal:        { name: "BTP",   number: "103",  url: "https://bangaloretrafficpolice.gov.in/" },
  other:         { name: "BBMP",  number: "1533", url: "https://bbmpcitizen.com/" },
}

type IssueValue = typeof ISSUE_TYPES[number]["value"]

export interface SubmittedReport {
  id: number
  lat: number
  lng: number
  issueType: IssueValue
  wardName?: string
}

interface ReportSheetProps {
  lat: number
  lng: number
  wardNo?: number
  wardName?: string
  boundarySystem?: string
  corporationId?: number
  gbaWardNo?: number
  historicalWards?: HistoricalWardRef[]
  onClose: () => void
  onSubmitted?: (report: SubmittedReport) => void
}

type Stage = "form" | "uploading" | "saving" | "success" | "error"

export default function ReportSheet({ lat, lng, wardNo, wardName, boundarySystem, corporationId, gbaWardNo, historicalWards = [], onClose, onSubmitted }: ReportSheetProps) {
  const [issueType, setIssueType]       = useState<IssueValue | null>(null)
  const [description, setDescription]   = useState("")

  const [photoFile, setPhotoFile]       = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [stage, setStage]               = useState<Stage>("form")
  const [errorMsg, setErrorMsg]         = useState("")
  const [reportId, setReportId]         = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose()
    document.addEventListener("keydown", closeOnEscape)
    return () => document.removeEventListener("keydown", closeOnEscape)
  }, [onClose])

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    const reader = new FileReader()
    reader.onload = () => setPhotoPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleSubmit = async () => {
    if (!issueType) return

    let photo_base64: string | undefined
    let photo_mime: string | undefined

    if (photoFile) {
      setStage("uploading")
      photo_base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(photoFile)
      })
      photo_mime = photoFile.type
    }

    setStage("saving")

    try {
      const res = await fetch("/api/submit-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat, lng,
          ward_no:     wardNo,
          ward_name:   wardName,
          boundary_system: boundarySystem,
          gba_corporation_id: corporationId,
          gba_ward_no: gbaWardNo,
          historical_wards: historicalWards,
          issue_type:  issueType,
          description: description.trim() || undefined,
          photo_base64,
          photo_mime,
        }),
      })

      const data = await res.json()

      if (!res.ok || data.error) {
        setStage("error")
        setErrorMsg(data.error ?? "Something went wrong. Please try again.")
        return
      }

      setReportId(data.id ?? null)
      setStage("success")
      if (data.id) onSubmitted?.({ id: data.id, lat, lng, issueType, wardName })

    } catch {
      setStage("error")
      setErrorMsg("Network error. Please try again.")
    }
  }

  const authority = issueType ? COMPLAINT_AUTHORITY[issueType] : null

  return (
    <div className="fixed inset-0 z-[1100] flex items-end md:items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="report-sheet-title">
      <div className="signal-backdrop absolute inset-0 bg-ink/45" onClick={onClose} />

      <div className="signal-panel relative w-full md:w-[480px] bg-paper border-t-2 border-ink md:border md:border-ink/55 p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p id="report-sheet-title" className="text-ink font-semibold text-base">Report a civic issue</p>
            {wardName && <p className="text-ink/60 text-sm mt-0.5">{wardName} ward</p>}
          </div>
          <button onClick={onClose} aria-label="Close report form" className="w-11 h-11 flex items-center justify-center border border-ink/20 text-ink/60 hover:bg-ink/5 hover:text-ink text-lg transition-colors">&times;</button>
        </div>

        {stage === "form" && (
          <>
            {/* Issue type grid */}
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60 mb-3">What are you reporting?</p>
              <div className="grid grid-cols-2 gap-2">
                {ISSUE_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setIssueType(t.value)}
                    className={`flex items-center gap-2 min-h-11 px-3 py-2.5 border text-left text-sm font-medium transition-colors ${
                      issueType === t.value
                        ? "bg-ink border-ink text-paper"
                        : "bg-paper border-ink/20 text-ink/75 hover:bg-ink/5 hover:border-ink/35 hover:text-ink"
                    }`}
                  >
                    <span aria-hidden="true" className={`w-6 h-6 shrink-0 flex items-center justify-center border font-mono text-xs font-bold ${
                      issueType === t.value ? "border-paper/40 text-paper" : "border-ink/20 text-ink/60"
                    }`}>
                      {t.icon}
                    </span>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Location pinned from map — show confirmation */}
            <div className="flex items-center gap-2 text-ink/60 text-xs">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0 text-accent">
                <circle cx="8" cy="8" r="3" fill="currentColor"/>
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
              <span className="font-mono tabular-nums">Location pinned at {lat.toFixed(4)}, {lng.toFixed(4)}</span>
            </div>

            {/* Photo upload */}
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60 mb-3">Add a photo (recommended)</p>
              {photoPreview ? (
                <div className="relative overflow-hidden border border-ink/15">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoPreview} alt="Preview" className="w-full h-48 object-cover" />
                  <button
                    onClick={() => { setPhotoFile(null); setPhotoPreview(null) }}
                    aria-label="Remove selected photo"
                    className="absolute top-2 right-2 w-11 h-11 bg-ink/85 text-paper text-lg flex items-center justify-center hover:bg-ink transition-colors"
                  >&times;</button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full h-28 border-2 border-dashed border-ink/25 bg-paper-bright flex flex-col items-center justify-center gap-2 text-ink/60 hover:border-ink/55 hover:text-ink transition-colors"
                >
                  <span className="text-2xl" aria-hidden="true">+</span>
                  <span className="text-sm">Camera or gallery</span>
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            </div>

            {/* Description */}
            <div>
              <label htmlFor="report-description" className="block text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60 mb-3">Description (optional)</label>
              <textarea
                id="report-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of the issue..."
                maxLength={300}
                rows={2}
                className="w-full bg-paper-bright border border-ink/25 px-4 py-3 text-ink text-sm placeholder:text-ink/50 resize-none focus:outline-none focus:border-ink/60"
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={!issueType}
              className="w-full min-h-11 px-4 py-3 bg-ink text-paper font-mono text-[11px] font-semibold uppercase tracking-[0.08em] hover:bg-ink/85 disabled:bg-ink/15 disabled:text-ink/50 transition-colors"
            >
              Submit report
            </button>

            <p className="text-ink/60 text-xs text-center">
              Reports are reviewed before appearing on the map. No login required.
            </p>
          </>
        )}

        {(stage === "uploading" || stage === "saving") && (
          <div className="flex flex-col items-center gap-5 py-10">
            <div className="relative w-10 h-10">
              <div className="absolute inset-0 rounded-full border-2 border-ink/15" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-ink animate-spin motion-reduce:animate-none" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-ink text-sm font-medium">
                {stage === "uploading" ? "Uploading photo..." : "Saving report..."}
              </p>
              <p className="text-ink/60 text-xs">
                {stage === "uploading" ? "Hang on, sending your photo" : "Almost done"}
              </p>
            </div>
            {/* Step dots */}
            <div className="flex items-center gap-2" aria-hidden="true">
              <div className="w-2 h-2 rounded-full bg-ink" />
              <div className={`w-2 h-2 rounded-full ${stage === "saving" ? "bg-ink" : "bg-ink/20"}`} />
              <div className="w-2 h-2 rounded-full bg-ink/20" />
            </div>
          </div>
        )}

        {stage === "success" && (
          <div className="flex flex-col gap-4 py-2">
            {/* Confirmation */}
            <div className="flex items-start gap-3 bg-success/[0.07] border border-success/35 p-4">
              <div className="w-9 h-9 border border-success/35 flex items-center justify-center text-success shrink-0" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <p className="text-success font-semibold">Report queued for review</p>
                <p className="text-ink/75 text-sm mt-0.5">We will review it before it becomes part of Kaun’s public record.</p>
              </div>
            </div>

            <div className="h-px bg-ink/10" />

            {/* Complaint nudge */}
            {authority && (
              <div className="bg-paper-muted border border-ink/15 p-4 space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60">Also file a formal complaint</p>
                <p className="text-ink/85 text-sm">
                  Call <span className="text-ink font-semibold font-mono tabular-nums">{authority.name} {authority.number}</span> — it creates a ticket and triggers a response deadline under the Sakala Act.
                </p>
                {authority.url && (
                  <a
                    href={authority.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 min-h-11 text-accent text-xs font-medium underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
                  >
                    File online at {authority.name}
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                      <path d="M2 8L8 2M8 2H4M8 2V6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </a>
                )}
              </div>
            )}

            {/* Share */}
            {reportId && (
              <button
                onClick={async () => {
                  const url = `https://kaun.city?report=${reportId}`
                  const text = `Civic issue reported in ${wardName ?? "Bengaluru"}. ${url}`
                  if (navigator.share) {
                    await navigator.share({ text, url }).catch(() => {})
                  } else {
                    await navigator.clipboard.writeText(text)
                    alert("Link copied.")
                  }
                }}
                className="w-full min-h-11 px-4 py-3 bg-paper border border-ink/55 text-ink font-mono text-[11px] font-semibold uppercase tracking-[0.08em] hover:bg-paper-muted transition-colors"
              >
                Share this report
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-full min-h-11 px-4 py-3 bg-ink text-paper font-mono text-[11px] font-semibold uppercase tracking-[0.08em] hover:bg-ink/85 transition-colors"
            >
              Close
            </button>
          </div>
        )}

        {stage === "error" && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="w-12 h-12 bg-danger/[0.07] border border-danger/35 flex items-center justify-center text-danger text-xl font-bold" aria-hidden="true">!</div>
            <div>
              <p className="text-danger font-semibold">Could not submit</p>
              <p className="text-ink/75 text-sm mt-1">{errorMsg}</p>
            </div>
            <button onClick={() => setStage("form")} className="mt-2 min-h-11 px-6 bg-paper border border-ink/55 text-ink font-mono text-[11px] font-semibold uppercase tracking-[0.08em] hover:bg-paper-muted transition-colors">
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
