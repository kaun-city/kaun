"use client"

import { useRef, useState } from "react"
import type { CommunityFact } from "@/lib/types"
import { submitFact } from "@/lib/api"
import { OFFICER_SUBJECTS } from "@/lib/constants"
import { getVoterToken } from "@/lib/ward-utils"

interface Props {
  wardNo: number
  cityId: string
  onSubmitted: (fact: CommunityFact) => void
}

export function AddFactForm({ wardNo, cityId, onSubmitted }: Props) {
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState("gba_ward_officer")
  const [field, setField] = useState("name")
  const [value, setValue] = useState("")
  const [sourceNote, setSourceNote] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const allFields = ["name", "phone", "email", "note"]

  function handleInputFocus(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    // On iOS Safari: scroll the focused input into view after keyboard opens
    setTimeout(() => e.target.scrollIntoView({ behavior: "smooth", block: "center" }), 350)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!value.trim()) return
    setSubmitting(true)
    const res = await submitFact({
      city_id: cityId,
      ward_no: wardNo,
      category: "officer",
      subject,
      field,
      value: value.trim(),
      source_note: sourceNote.trim() || undefined,
      contributor_token: getVoterToken(),
    })
    setSubmitting(false)
    if (res?.ok) {
      onSubmitted(res.fact)
      setDone(true)
      setValue("")
      setSourceNote("")
      setTimeout(() => { setDone(false); setOpen(false) }, 2000)
    }
  }

  if (done) {
    return (
      <div className="mt-3 p-3 bg-success/[0.07] border border-success/35 text-success text-xs text-center font-medium">
        Added. Others can now corroborate this.
      </div>
    )
  }

  const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
  const fieldLabel = "text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60 block mb-1"
  const control = "w-full min-h-11 bg-paper-bright border border-ink/25 text-ink placeholder:text-ink/50 focus:outline-none focus:border-ink/60"

  return (
    <div className="mt-3">
      {!open ? (
        <button
          onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 100) }}
          className={`w-full min-h-11 px-4 py-2.5 border border-dashed border-ink/35 text-ink/70 text-xs hover:border-ink/60 hover:text-ink hover:bg-ink/5 transition-colors ${focusRing}`}
        >
          + Know something? Add it for your community
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-2.5 p-3 bg-paper-muted border border-ink/15">
          <p className="text-ink text-sm font-semibold">Add what you know</p>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={fieldLabel}>Officer type</label>
              <select
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className={`${control} px-2 py-1.5 text-xs`}
              >
                {Object.entries(OFFICER_SUBJECTS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={fieldLabel}>Field</label>
              <select
                value={field}
                onChange={e => setField(e.target.value)}
                className={`${control} px-2 py-1.5 text-xs`}
              >
                {allFields.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
          </div>

          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            onFocus={handleInputFocus}
            placeholder={field === "phone" ? "98XXXXXXXX" : field === "email" ? "officer@gba.gov.in" : "Enter value"}
            className={`${control} px-3 py-2 text-sm`}
            required
          />

          <input
            type="text"
            value={sourceNote}
            onChange={e => setSourceNote(e.target.value)}
            placeholder="Source (optional): GBA notice board, RTI reply, etc."
            className={`${control} px-3 py-2 text-xs`}
          />

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting || !value.trim()}
              className={`flex-1 min-h-11 px-4 bg-ink text-paper font-mono text-[11px] font-semibold uppercase tracking-[0.08em] hover:bg-ink/85 disabled:bg-ink/15 disabled:text-ink/50 transition-colors ${focusRing}`}
            >
              {submitting ? "Submitting..." : "Submit"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={`min-h-11 px-4 bg-paper border border-ink/55 text-ink font-mono text-[11px] font-semibold uppercase tracking-[0.08em] hover:bg-paper-muted transition-colors ${focusRing}`}
            >
              Cancel
            </button>
          </div>

          <p className="text-ink/60 text-xs text-center leading-relaxed">
            No login required. Your submission is anonymous.<br />
            Others can +1 it to verify.
          </p>
        </form>
      )}
    </div>
  )
}
