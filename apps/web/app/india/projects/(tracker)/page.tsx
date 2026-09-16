import type { Metadata } from "next"
import { Suspense } from "react"
import { headers } from "next/headers"
import { IndiaHeader } from "@/components/india/IndiaHeader"
import { Section } from "@/components/india/ObjectHeader"
import { ProjectRow } from "@/components/india/ProjectRow"
import { TrackerControls } from "@/components/india/TrackerControls"
import { SourcesFooter } from "@/components/india/SourcesFooter"
import { TRACKER_LIMIT, fetchProjectStates, fetchTrackedProjects, type TrackerSort } from "@/lib/india/api"
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
 *
 * THE ONE INDIA PAGE THAT STAYS PER-REQUEST. Its content is a function of
 * ?sort= and ?state=, so there is no single page to prerender. The reads
 * underneath it still go through lib/india/api.ts and are still cached, so a
 * repeat of any given sort/state combination costs no Supabase round trip;
 * only the render is per-request. Because it stays dynamic it keeps reading
 * headers(), which is also why its surface switcher stays host-exact in local
 * development while the prerendered pages' resolves for production.
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

  /**
   * Two different counts, each named for what it counts, because they differ
   * and a reader who meets both unexplained reasonably assumes one is wrong.
   *
   *   total        projects Kaun's record marks ongoing in this scope — the
   *                number the constituency page links through with.
   *   rows.length  those that appear in the latest monthly report, capped at
   *                TRACKER_LIMIT. A project can be marked ongoing yet be absent
   *                from the newest report (MoSPI drops and re-adds rows), and
   *                those have no current figures to list.
   */
  const month = reportMonth ? formatMonth(reportMonth) : null
  const capped = rows.length >= TRACKER_LIMIT
  const notInReport = total - rows.length
  const countLine = [
    `${total.toLocaleString("en-IN")} ongoing project${total === 1 ? "" : "s"} on record`,
    capped
      ? `the first ${rows.length.toLocaleString("en-IN")} listed, in the order set below`
      : notInReport > 0
        ? `${rows.length.toLocaleString("en-IN")} in the ${month ?? "latest"} report, all listed below; ${notInReport.toLocaleString("en-IN")} not in that report`
        : "all listed below",
    ...(totalOverrun > 0
      ? [`${formatCrore(totalOverrun)} above sanctioned cost across the ${rows.length.toLocaleString("en-IN")} listed`]
      : []),
  ].join(" · ")

  return (
    <div className="signal-page h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-5 py-6">
        <IndiaHeader host={host} current="projects" />

        <div className="mt-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60">
            MoSPI Flash Report · Table 6{reportMonth ? ` · ${formatMonth(reportMonth)}` : ""}
          </p>
          <h1 className="text-ink font-bold text-2xl tracking-tight mt-1">
            Central projects{stateName ? ` in ${stateName}` : ""}
          </h1>
          <p className="text-ink/75 text-sm mt-2 max-w-2xl leading-relaxed">
            Every centrally-monitored project of ₹150 crore or more, with what it was sanctioned at, what
            it now costs, and how far its completion date has moved. Kaun keeps each monthly report, so
            these are changes over time rather than a snapshot.
          </p>
          {total > 0 && <p className="text-ink/70 text-xs mt-2">{countLine}</p>}
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
            <div className="bg-paper border border-ink/15 p-4">
              <p className="text-ink/75 text-sm">
                No cost or completion date moved in this report, for the projects shown.
              </p>
              <p className="text-ink/60 text-xs mt-1 leading-snug">
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
            <div className="bg-paper border border-ink/15 p-4">
              <p className="text-ink/75 text-sm">No projects loaded yet.</p>
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
