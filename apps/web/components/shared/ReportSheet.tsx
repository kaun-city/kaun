"use client"

import { useRef, useState } from "react"

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
  const [issueType, setIssueType] = useState<IssueValue | null>(null)
  const [description, setDescription]   = useState("")
  const [photoFile, setPhotoFile]        = useState<File | null>(null)
  const [photoPreview, setPhotoPreview]  = useState<string | null>(null)
  const [stage, setStage]                = useState<Stage>("form")
  const [resultMsg, setResultMsg]        = useState("")
  const [reportId, setReportId]          = useState<number | null>(null)
  const [aiContext, setAiContext]         = useState<{ person?: string; party?: string; label?: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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
      // Compress to max ~1MB before sending
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
          ward_no:    wardNo,
          ward_name:  wardName,
          issue_type: issueType,
          description: description.trim() || undefined,
          photo_base64,
          photo_mime,
        }),
      })

      const data = await res.json()

      if (!res.ok || data.error) {
        setStage("error")
        setResultMsg(data.error ?? "Something went wrong. Please try again.")
        return
      }

      setAiContext({ person: data.ai_person, party: data.ai_party, label: data.ai_label })
      setReportId(data.id ?? null)
      setStage("success")
      if (data.id) onSubmitted?.(data.id)

    } catch {
      setStage("error")
      setResultMsg("Network error. Please try again.")
    }
  }

  return (
    <div className="fixed inset-0 z-[1100] flex items-end md:items-center justify-center">
      {/* Backdrop */}
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
                  className="w-full h-32 rounded-xl border-2 border-dashed border-white/15 flex flex-col items-center justify-center gap-2 text-white/30 hover:border-white/25 hover:text-white/50 transition-all"
                >
                  <span className="text-2xl">+</span>
                  <span className="text-sm">Tap to add photo</span>
                  <span className="text-xs">Photo goes through AI moderation before publishing</span>
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoChange} />
            </div>

            {/* Description */}
            <div>
              <p className="text-white/50 text-xs uppercase tracking-wider mb-3">Description (optional)</p>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of the issue..."
                maxLength={300}
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white/80 text-sm placeholder:text-white/20 resize-none focus:outline-none focus:border-white/20"
              />
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!issueType}
              className="w-full py-3.5 rounded-xl bg-[#FF9933] hover:bg-[#FF9933]/90 disabled:opacity-40 text-black font-semibold text-sm transition-all"
            >
              Submit report
            </button>

            <p className="text-white/25 text-xs text-center">
              Reports are reviewed by AI before appearing on the map. No login required.
            </p>
          </>
        )}

        {stage === "submitting" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-8 h-8 border-2 border-[#FF9933]/30 border-t-[#FF9933] rounded-full animate-spin" />
            <p className="text-white/60 text-sm">Analyzing your report...</p>
          </div>
        )}

        {stage === "success" && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 text-xl">
              v
            </div>
            <div>
              <p className="text-white font-semibold">Report submitted</p>
              {aiContext?.label && (
                <p className="text-white/50 text-sm mt-1">{aiContext.label}</p>
              )}
              {aiContext?.person && (
                <p className="text-[#FF9933] text-sm mt-2 font-medium">
                  {aiContext.person}{aiContext.party ? ` · ${aiContext.party}` : ""} identified
                </p>
              )}
            </div>
            <div className="flex gap-3 mt-2">
              {reportId && (
                <button
                  onClick={async () => {
                    const shareUrl = `https://kaun.city?report=${reportId}`
                    const ogUrl    = `https://kaun.city/api/report-og?id=${reportId}`
                    const text     = aiContext?.person
                      ? `${aiContext.person}${aiContext.party ? " (" + aiContext.party + ")" : ""} spotted — ${aiContext.label ?? "civic issue reported"}. ${shareUrl}`
                      : `${aiContext?.label ?? "Civic issue reported"} in ${wardName ?? "Bengaluru"}. ${shareUrl}`
                    if (navigator.share) {
                      await navigator.share({ text, url: shareUrl }).catch(() => {})
                    } else {
                      await navigator.clipboard.writeText(text)
                      alert("Link copied!")
                    }
                    void ogUrl // used for OG image when link is shared
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-[#FF9933] text-black font-semibold text-sm"
                >
                  Share this report
                </button>
              )}
              <button onClick={onClose} className="px-6 py-2.5 rounded-xl bg-white/10 text-white/70 text-sm hover:bg-white/15 transition-all">
                Close
              </button>
            </div>
          </div>
        )}

        {stage === "error" && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center text-red-400 text-xl">!</div>
            <div>
              <p className="text-white font-semibold">Could not submit</p>
              <p className="text-white/50 text-sm mt-1">{resultMsg}</p>
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
