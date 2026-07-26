import type { Metadata } from "next"
import { Suspense } from "react"
import { headers } from "next/headers"
import { IndiaHeader } from "@/components/india/IndiaHeader"
import { Section } from "@/components/india/ObjectHeader"
import { ProjectRow } from "@/components/india/ProjectRow"
import { TrackerControls } from "@/components/india/TrackerControls"
import { SourcesFooter } from "@/components/india/SourcesFooter"
import { fetchProjectStates, fetchTrackedProjects, type TrackerSort } from "@/lib/india/api"
import { formatCrore, formatMonth } from "@/lib/india/format"
import { SOURCE_MOSPI } from "@/lib/india/constants"

/**
 * The central project overrun tracker.
 *
 * TIME IS THE PRODUCT HERE, not a column. A table of current cost and current
 * completion date is a status report and MoSPI already publishes one. What
 * MoSPI does not publish is the diff: which projects moved this month, how
 * many times a project has been revised, and how long a stalled one has been
 * sitting still. That is what in_central_project_snapshots and
 * v_in_central_project_changes exist to compute, and it is what leads this page
 * — "what changed" comes before the ranking.
 */
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Central project overruns | KAUN?",
  description:
    "Every central project MoSPI tracks, by how far over budget and how far behind schedule it is — and what changed in the latest monthly report.",
}

const SORTS = new Set<TrackerSort>(["cost_overrun", "schedule_slip", "stale", "cost"])

type Props = { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }

export default async function ProjectsPage({ searchParams }: Props) {
  const sp = await searchParams
  const host = (await headers()).get("host") ?? ""
  const sortParam = typeof sp.sort === "string" && SORTS.has(sp.sort as TrackerSort)
    ? (sp.sort as TrackerSort) : "cost_overrun"
  const stateParam = typeof sp.state === "string" && /^\d+$/.test(sp.state) ? Number(sp.state) : null

  const [{ rows, reportMonth, total }, states] = await Promise.all([
    fetchTrackedProjects({ stCode: stateParam, sort: sortParam }),
    fetchProjectStates(),
  ])

  const changed = rows.filter(r => r.cost_revised || r.schedule_changed)
  const stateName = stateParam ? states.find(s => s.st_code === stateParam)?.name : null
  const totalOverrun = rows.reduce((sum, r) => sum + (r.cost_overrun_cr ?? 0), 0)

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-5 py-6">
        <IndiaHeader host={host} />

        <div className="mt-6">
          <p className="text-white/30 text-[10px] uppercase tracking-widest">
            MoSPI Flash Report · Table 6{reportMonth ? ` · ${formatMonth(reportMonth)}` : ""}
          </p>
          <h1 className="text-white font-bold text-2xl tracking-tight mt-1">
            Central projects{stateName ? ` in ${stateName}` : ""}
          </h1>
          <p className="text-white/50 text-sm mt-2 max-w-2xl leading-relaxed">
            Every centrally-monitored project of ₹150 crore or more, with what it was sanctioned at, what
            it now costs, and how far its completion date has moved. Kaun keeps each monthly report, so
            these are changes over time rather than a snapshot.
          </p>
          <p className="text-white/30 text-xs mt-2">
            {total.toLocaleString("en-IN")} ongoing project{total === 1 ? "" : "s"}
            {rows.length < total ? ` · showing the top ${rows.length}` : ""}
            {totalOverrun > 0 ? ` · ${formatCrore(totalOverrun)} above sanctioned cost across the rows shown` : ""}
          </p>
        </div>

        <div className="mt-5">
          <Suspense fallback={null}>
            <TrackerControls states={states} activeSort={sortParam} activeState={stateParam} />
          </Suspense>
        </div>

        {/* What moved in the latest report — the diff, before the ranking. */}
        <Section
          title={reportMonth ? `Changed in the ${formatMonth(reportMonth)} report` : "Changed in the latest report"}
          note={`${changed.length} of ${rows.length} shown`}
        >
          {changed.length === 0 ? (
            <div className="rounded-xl bg-white/5 p-4">
              <p className="text-white/50 text-sm">
                No cost or completion date moved in this report, for the projects shown.
              </p>
              <p className="text-white/25 text-xs mt-1 leading-snug">
                Comparison is against the previous monthly report. A project&apos;s first month in the
                record has nothing to compare against and never counts as a change.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {changed.map(p => <ProjectRow key={p.project_code} p={p} />)}
            </div>
          )}
        </Section>

        <Section title="All projects" note="ordered by the control above">
          {rows.length === 0 ? (
            <div className="rounded-xl bg-white/5 p-4">
              <p className="text-white/50 text-sm">No projects loaded yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rows.map(p => <ProjectRow key={p.project_code} p={p} />)}
            </div>
          )}
        </Section>

        <SourcesFooter
          sources={[SOURCE_MOSPI]}
          crosswalkNote={
            "Cost overrun is revised cost minus originally sanctioned cost, as printed by MoSPI. Schedule slip is the gap between the original commissioning month and the current revised one — negative where a project is now expected earlier than first planned, which does happen and is shown as such."
          }
        />
      </div>
    </div>
  )
}
