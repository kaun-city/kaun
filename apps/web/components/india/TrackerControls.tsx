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
            className={`min-h-11 px-3 border font-mono text-[11px] uppercase tracking-[0.06em] transition-colors
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
              activeSort === s.id
                ? "border-ink bg-ink text-paper"
                : "border-ink/20 text-ink/60 hover:text-ink hover:bg-ink/5"}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* State names only, no per-state count. fetchProjectStates() reads
          one unpaginated PostgREST page, which the server caps at 1,000 rows
          of the ~2,000 ongoing projects, so every count it produces is an
          undercount (it printed "Telangana · 10" for a state with 72). The
          page header states the real count once a state is chosen. */}
      <select
        value={activeState ?? ""}
        onChange={e => go({ state: e.target.value === "" ? null : e.target.value })}
        aria-label="Filter projects by state"
        className="min-h-11 bg-paper-bright border border-ink/25 px-2.5
          text-xs text-ink focus:outline-none focus:border-ink/60
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent max-w-[14rem]"
      >
        <option value="">All states</option>
        {states.map(s => (
          <option key={s.st_code} value={s.st_code}>{s.name}</option>
        ))}
      </select>
    </div>
  )
}
