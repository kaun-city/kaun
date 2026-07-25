import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { IndiaHeader } from "@/components/india/IndiaHeader"
import { ObjectHeader, Section, Stat } from "@/components/india/ObjectHeader"
import { ProjectTimeline } from "@/components/india/ProjectTimeline"
import { SourcesFooter } from "@/components/india/SourcesFooter"
import { fetchProjectDetail } from "@/lib/india/api"
import { indiaHref } from "@/lib/host-routing"
import { SOURCE_MOSPI } from "@/lib/india/constants"
import { formatCrore, formatCroreDelta, formatMonth, formatPct, formatSlip } from "@/lib/india/format"
import { divergingColor } from "@/lib/india/viz"
import { OVERRUN_SCALE_CR, SLIP_SCALE_MONTHS } from "@/components/india/ProjectRow"

/**
 * A central project's own page.
 *
 * Same object-page structure as a constituency: identity → key facts → money →
 * time → sources. A project is not a row inside a table; it is a thing with a
 * stable URL that can be linked, cited and — later — attached to.
 */
export const dynamic = "force-dynamic"

type Props = { params: Promise<{ project_code: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { project_code } = await params
  const detail = await fetchProjectDetail(project_code)
  if (!detail) return {}
  const { project, latest } = detail
  const over = latest?.cost_overrun_cr
  const title = `${project.project_name} | KAUN?`
  const description = over && over > 0
    ? `${formatCroreDelta(over)} above its sanctioned cost. Monthly cost and schedule history from MoSPI's flash reports.`
    : "Cost and schedule history from MoSPI's monthly flash reports."
  return { title, description, openGraph: { title, description, type: "article" } }
}

export default async function ProjectPage({ params }: Props) {
  const { project_code } = await params
  const detail = await fetchProjectDetail(project_code)
  if (!detail) notFound()

  const { project, history, latest, costRevisions, scheduleRevisions, monthsSinceLastChange } = detail
  const originalCost = latest && latest.revised_cost_cr !== null && latest.cost_overrun_cr !== null
    ? Number((latest.revised_cost_cr - latest.cost_overrun_cr).toFixed(2))
    : null

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-5 py-6">
        <IndiaHeader />

        <div className="mt-6">
          <ObjectHeader
            eyebrow={[project.ministry, project.sector].filter(Boolean).join(" · ") || "Central project"}
            title={project.project_name}
            subtitle={
              <>
                {project.agency ? `${project.agency} · ` : ""}
                {project.state_raw ?? "state not stated"}
                {project.st_code !== null && (
                  <> · <a href={indiaHref(`/projects?state=${project.st_code}`)}
                    className="text-[#FF9933]/60 hover:text-[#FF9933]">other projects in this state</a></>
                )}
              </>
            }
            chips={[
              { label: "code", value: project.project_code },
              ...(project.pmgid ? [{ label: "PMGID", value: project.pmgid }] : []),
              { label: "in record since", value: formatMonth(project.first_seen_month) },
              ...(project.is_multi_state ? [{ label: "multi-state", value: "yes" }] : []),
            ]}
            /* presence slot intentionally empty in v1 — see ObjectHeader */
          />
        </div>

        <Section title="Money">
          <div className="rounded-xl bg-white/5 p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Stat label="Sanctioned at" value={formatCrore(originalCost)} />
              <Stat label="Latest cost" value={formatCrore(latest?.revised_cost_cr ?? null)} />
              <Stat
                label="Difference"
                value={
                  <span style={{ color: divergingColor(latest?.cost_overrun_cr ?? null, OVERRUN_SCALE_CR) }}>
                    {formatCroreDelta(latest?.cost_overrun_cr ?? null)}
                  </span>
                }
              />
              <Stat label="Spent to date" value={formatCrore(latest?.cumulative_expenditure_cr ?? null)} />
            </div>
            <p className="text-white/20 text-[10px] mt-3">
              As printed in the {formatMonth(latest?.report_month)} flash report. Costs are MoSPI&apos;s own
              figures in crore.
            </p>
          </div>
        </Section>

        <Section title="Schedule">
          <div className="rounded-xl bg-white/5 p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Stat label="Now expected" value={formatMonth(latest?.revised_doc_month ?? null)} />
              <Stat
                label="Against original"
                value={
                  <span style={{ color: divergingColor(latest?.schedule_slip_months ?? null, SLIP_SCALE_MONTHS) }}>
                    {formatSlip(latest?.schedule_slip_months ?? null)}
                  </span>
                }
              />
              <Stat label="Physical progress" value={formatPct(latest?.physical_progress_pct ?? null)} />
              <Stat
                label="Last change"
                value={monthsSinceLastChange === null
                  ? "not in this window"
                  : monthsSinceLastChange === 0
                    ? "this month"
                    : `${monthsSinceLastChange} month${monthsSinceLastChange === 1 ? "" : "s"} ago`}
                muted={monthsSinceLastChange === null}
                note={monthsSinceLastChange === null
                  ? "No cost or schedule change in the months Kaun holds — not a claim that nothing has ever changed."
                  : undefined}
              />
            </div>
          </div>
        </Section>

        <Section
          title="Over time"
          note={`${history.length} monthly report${history.length === 1 ? "" : "s"} · ${costRevisions} cost revision${costRevisions === 1 ? "" : "s"}, ${scheduleRevisions} schedule change${scheduleRevisions === 1 ? "" : "s"}`}
        >
          <ProjectTimeline history={history} />
        </Section>

        <SourcesFooter
          sources={[SOURCE_MOSPI]}
          crosswalkNote={
            "Kaun stores one immutable row per project per monthly report and computes the month-over-month diff in the database, so a revision is attributable to the report that made it. Revision counts cover only the months listed above."
          }
        />
      </div>
    </div>
  )
}
