"use client"

import { useRouter, useSearchParams } from "next/navigation"
import type { TrackerSort } from "@/lib/india/api"

/**
 * Sort and state controls for the overrun tracker.
 *
 * Both write to the URL rather than to component state, so every view of this
 * table is a link someone can send: /india/projects?sort=schedule_slip&state=29
 * is a shareable claim, which is the whole point of a public tracker.
 */
const SORTS: Array<{ id: TrackerSort; label: string }> = [
  { id: "cost_overrun", label: "Cost overrun" },
  { id: "schedule_slip", label: "Schedule slip" },
  { id: "stale", label: "Longest unchanged" },
  { id: "cost", label: "Project size" },
]

export function TrackerControls({
  states, activeSort, activeState,
}: {
  states: Array<{ st_code: number; name: string; count: number }>
  activeSort: TrackerSort
  activeState: number | null
}) {
  const router = useRouter()
  const params = useSearchParams()

  function go(next: Record<string, string | null>) {
    const q = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(next)) {
      if (v === null) q.delete(k)
      else q.set(k, v)
    }
    const qs = q.toString()
    router.push(qs ? `?${qs}` : "?")
  }

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex flex-wrap gap-1.5">
        {SORTS.map(s => (
          <button
            key={s.id}
            onClick={() => go({ sort: s.id })}
            className={`text-[11px] px-2.5 py-1.5 rounded border transition-colors ${
              activeSort === s.id
                ? "border-[#FF9933]/50 text-[#FF9933] bg-[#FF9933]/10"
                : "border-white/10 text-white/40 hover:text-white/70"}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <select
        value={activeState ?? ""}
        onChange={e => go({ state: e.target.value === "" ? null : e.target.value })}
        className="bg-black/60 border border-white/15 rounded-lg px-2.5 py-1.5
          text-[11px] text-white/80 focus:outline-none focus:border-[#FF9933]/40 max-w-[14rem]"
      >
        <option value="">All states</option>
        {states.map(s => (
          <option key={s.st_code} value={s.st_code}>{s.name} · {s.count}</option>
        ))}
      </select>
    </div>
  )
}
