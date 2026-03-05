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
      <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs text-center font-medium">
        OK Added! Others can now corroborate this.
      </div>
    )
  }

  return (
    <div className="mt-3">
      {!open ? (
        <button
          onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 100) }}
          className="w-full py-2.5 rounded-xl border border-dashed border-white/20 text-white/30 text-xs hover:border-white/40 hover:text-white/50 transition-colors"
        >
          + Know something? Add it for your community
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-2.5 p-3 rounded-xl bg-white/5 border border-white/10">
          <p className="text-white/50 text-xs font-semibold">Add what you know</p>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-white/30 text-[10px] uppercase tracking-wider block mb-1">Officer type</label>
              <select
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white/70 text-xs focus:outline-none focus:border-white/30"
              >
                {Object.entries(OFFICER_SUBJECTS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-white/30 text-[10px] uppercase tracking-wider block mb-1">Field</label>
              <select
                value={field}
                onChange={e => setField(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white/70 text-xs focus:outline-none focus:border-white/30"
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
            placeholder={field === "phone" ? "98XXXXXXXX" : field === "email" ? "officer@gba.gov.in" : "Enter value"}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-white/30"
            required
          />

          <input
            type="text"
            value={sourceNote}
            onChange={e => setSourceNote(e.target.value)}
            placeholder="Source (optional): GBA notice board, RTI reply, etc."
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white/60 text-xs placeholder-white/20 focus:outline-none focus:border-white/30"
          />

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting || !value.trim()}
              className="flex-1 py-2 rounded-lg bg-[#FF9933]/20 border border-[#FF9933]/40 text-[#FF9933] text-xs font-semibold hover:bg-[#FF9933]/30 disabled:opacity-40 transition-colors"
            >
              {submitting ? "Submitting..." : "Submit"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-2 rounded-lg bg-white/5 text-white/30 text-xs hover:text-white/50 transition-colors"
            >
              Cancel
            </button>
          </div>

          <p className="text-white/20 text-[10px] text-center leading-relaxed">
            No login required. Your submission is anonymous.<br />
            Others can +1 it to verify.
          </p>
        </form>
      )}
    </div>
  )
}
