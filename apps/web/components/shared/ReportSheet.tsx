"use client"

import { useRef, useState, useEffect } from "react"

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

interface ReportSheetProps {
  lat: number
  lng: number
  wardNo?: number
  wardName?: string
  onClose: () => void
  onSubmitted?: (id: number) => void
}

type Stage = "form" | "submitting" | "success" | "error"

export default function ReportSheet({ lat, lng, wardNo, wardName, onClose, onSubmitted }: ReportSheetProps) {
  const [issueType, setIssueType]       = useState<IssueValue | null>(null)
  const [description, setDescription]   = useState("")
  const [locationText, setLocationText] = useState("")
  const [photoFile, setPhotoFile]       = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [stage, setStage]               = useState<Stage>("form")
  const [errorMsg, setErrorMsg]         = useState("")
  const [reportId, setReportId]         = useState<number | null>(null)
  const [autoClose, setAutoClose]       = useState(5)
  const fileRef = useRef<HTMLInputElement>(null)

  // Auto-close countdown on success
  useEffect(() => {
    if (stage !== "success") return
    if (autoClose <= 0) { onClose(); return }
    const t = setTimeout(() => setAutoClose(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [stage, autoClose, onClose])

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
    setStage("submitting")

    let photo_base64: string | undefined
    let photo_mime: string | undefined

    if (photoFile) {
      photo_base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(photoFile)
      })
      photo_mime = photoFile.type
    }

    try {
      const res = await fetch("/api/submit-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat, lng,
          ward_no:       wardNo,
          ward_name:     wardName,
          issue_type:    issueType,
          description:   description.trim() || undefined,
          location_text: locationText.trim() || undefined,
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
      if (data.id) onSubmitted?.(data.id)

    } catch {
      setStage("error")
      setErrorMsg("Network error. Please try again.")
    }
  }

  const authority = issueType ? COMPLAINT_AUTHORITY[issueType] : null

  return (
    <div className="fixed inset-0 z-[1100] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full md:w-[480px] bg-[#111] border border-white/10 rounded-t-2xl md:rounded-2xl p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white font-semibold text-base">Report a civic issue</p>
            {wardName && <p className="text-white/40 text-sm mt-0.5">{wardName} ward</p>}
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-white/40 hover:text-white/80 text-lg">x</button>
        </div>

        {stage === "form" && (
          <>
            {/* Issue type grid */}
            <div>
              <p className="text-white/50 text-xs uppercase tracking-wider mb-3">What are you reporting?</p>
              <div className="grid grid-cols-2 gap-2">
                {ISSUE_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setIssueType(t.value)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                      issueType === t.value
                        ? "bg-[#FF9933]/15 border-[#FF9933]/60 text-[#FF9933]"
                        : "bg-white/5 border-white/10 text-white/60 hover:border-white/20"
                    }`}
                  >
                    <span className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${
                      issueType === t.value ? "bg-[#FF9933]/20 text-[#FF9933]" : "bg-white/10 text-white/50"
                    }`}>
                      {t.icon}
                    </span>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Location */}
            <div>
              <p className="text-white/50 text-xs uppercase tracking-wider mb-3">Where exactly?</p>
              <input
                type="text"
                value={locationText}
                onChange={(e) => setLocationText(e.target.value)}
                placeholder="e.g. near Dominos on 80ft road, Indiranagar"
                maxLength={150}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white/80 text-sm placeholder:text-white/20 focus:outline-none focus:border-white/20"
              />
            </div>

            {/* Photo upload */}
            <div>
              <p className="text-white/50 text-xs uppercase tracking-wider mb-3">Add a photo (recommended)</p>
              {photoPreview ? (
                <div className="relative rounded-xl overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoPreview} alt="Preview" className="w-full h-48 object-cover" />
                  <button
                    onClick={() => { setPhotoFile(null); setPhotoPreview(null) }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 text-white/80 text-sm flex items-center justify-center"
                  >x</button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full h-28 rounded-xl border-2 border-dashed border-white/15 flex flex-col items-center justify-center gap-2 text-white/30 hover:border-white/25 hover:text-white/50 transition-all"
                >
                  <span className="text-2xl">+</span>
                  <span className="text-sm">Camera or gallery</span>
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            </div>

            {/* Description */}
            <div>
              <p className="text-white/50 text-xs uppercase tracking-wider mb-3">Description (optional)</p>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of the issue..."
                maxLength={300}
                rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white/80 text-sm placeholder:text-white/20 resize-none focus:outline-none focus:border-white/20"
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={!issueType}
              className="w-full py-3.5 rounded-xl bg-[#FF9933] hover:bg-[#FF9933]/90 disabled:opacity-40 text-black font-semibold text-sm transition-all"
            >
              Submit report
            </button>

            <p className="text-white/25 text-xs text-center">
              Reports are reviewed before appearing on the map. No login required.
            </p>
          </>
        )}

        {stage === "submitting" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-8 h-8 border-2 border-[#FF9933]/30 border-t-[#FF9933] rounded-full animate-spin" />
            <p className="text-white/60 text-sm">Uploading...</p>
          </div>
        )}

        {stage === "success" && (
          <div className="flex flex-col gap-4 py-2">
            {/* Confirmation */}
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 shrink-0 mt-0.5">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <p className="text-white font-semibold">Report queued for review</p>
                <p className="text-white/40 text-sm mt-0.5">We will review it and post it on the map. Closes in {autoClose}s.</p>
              </div>
            </div>

            <div className="h-px bg-white/5" />

            {/* Complaint nudge */}
            {authority && (
              <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-2">
                <p className="text-white/60 text-xs uppercase tracking-wider">Also file a formal complaint</p>
                <p className="text-white/80 text-sm">
                  Call <span className="text-[#FF9933] font-semibold">{authority.name} {authority.number}</span> — it creates a ticket and triggers a response deadline under the Sakala Act.
                </p>
                {authority.url && (
                  <a
                    href={authority.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[#FF9933] text-xs font-medium hover:underline mt-1"
                  >
                    File online at {authority.name}
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
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
                    alert("Link copied!")
                  }
                }}
                className="w-full py-3 rounded-xl bg-white/10 text-white/70 text-sm font-medium hover:bg-white/15 transition-all"
              >
                Share this report
              </button>
            )}
          </div>
        )}

        {stage === "error" && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center text-red-400 text-xl">!</div>
            <div>
              <p className="text-white font-semibold">Could not submit</p>
              <p className="text-white/50 text-sm mt-1">{errorMsg}</p>
            </div>
            <button onClick={() => setStage("form")} className="mt-2 px-6 py-2.5 rounded-xl bg-white/10 text-white/70 text-sm hover:bg-white/15 transition-all">
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
