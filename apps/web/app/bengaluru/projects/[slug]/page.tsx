import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { BackLink, PageHeader } from "@/components/shared/PageHeader"
import { ProjectResearchWorkbench } from "@/components/projects/ProjectResearchWorkbench"
import { CIVIC_PROJECTS, getCivicProject, isBehindSchedule, sourceMap, wardLabel, type AffectedWard, type EvidenceState } from "@/lib/civic-projects"
import { fetchPublishedProjectResearch } from "@/lib/civic-projects-server"

export const revalidate = 300

type Props = { params: Promise<{ slug: string }> }

const EVIDENCE_LABEL: Record<EvidenceState, string> = {
  verified: "Verified record",
  reported: "Attributed report",
  conflicting: "Conflicting figures",
  unknown: "Not found publicly",
}

const EVIDENCE_STYLE: Record<EvidenceState, string> = {
  verified: "border-success/35 bg-success/[0.07] text-success",
  reported: "border-info/35 bg-info/[0.07] text-info",
  conflicting: "border-warning/35 bg-warning/[0.07] text-warning",
  unknown: "border-danger/35 bg-danger/[0.07] text-danger",
}

const EVIDENCE_DOT: Record<EvidenceState, string> = {
  verified: "bg-success",
  reported: "bg-info",
  conflicting: "bg-warning",
  unknown: "bg-danger",
}

const FOCUS = "focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"

function corporationsOf(wards: AffectedWard[]): string {
  return [...new Set(wards.map(ward => ward.corporation))].sort().join(", ")
}

function AffectedWards({ wards, basis }: { wards: AffectedWard[]; basis: string }) {
  const list = (
    <ul className="mt-2 space-y-1 text-sm font-semibold">
      {wards.map(ward => <li key={`${ward.corporationId}-${ward.wardNo}`}>{wardLabel(ward)}</li>)}
    </ul>
  )
  return (
    <>
      {wards.length > 0 && wards.length <= 4 && list}
      {wards.length > 4 && (
        <details className="group mt-2">
          <summary className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 border border-ink/25 px-3 py-2 text-sm font-semibold hover:border-ink/55 ${FOCUS}`}>
            <span>{wards.length} wards · {corporationsOf(wards)}</span>
            <span className="font-mono text-xs uppercase tracking-[0.08em] text-accent">
              <span className="group-open:hidden">Show</span>
              <span className="hidden group-open:inline">Hide</span>
            </span>
          </summary>
          {list}
        </details>
      )}
      <p className="mt-2 text-xs leading-relaxed text-ink/65">{basis}</p>
    </>
  )
}

function EvidenceBadge({ state }: { state: EvidenceState }) {
  return (
    <span className={`inline-flex min-h-7 items-center border px-2 py-1 text-xs font-semibold ${EVIDENCE_STYLE[state]}`}>
      {EVIDENCE_LABEL[state]}
    </span>
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const project = getCivicProject(slug)
  if (!project) return {}
  return {
    title: `${project.shortTitle} — public record | KAUN?`,
    description: `${project.statusNote} Follow the evidence, deadline history and open accountability questions.`,
  }
}

export default async function CivicProjectPage({ params }: Props) {
  const { slug } = await params
  const project = getCivicProject(slug)
  if (!project) notFound()

  const sources = sourceMap(project)
  const recordNumber = String(CIVIC_PROJECTS.indexOf(project) + 1).padStart(2, "0")
  const publishedResearch = await fetchPublishedProjectResearch(project.slug)

  return (
    <div className="signal-record fixed inset-0 overflow-y-auto bg-paper-stage text-ink">
      <PageHeader
        surface="city"
        back={<BackLink href={`/${project.cityId}/projects`} label="Projects" ariaLabel="Back to project records" />}
        actions={<span className="hidden font-mono text-xs tracking-[0.08em] text-ink/60 sm:block">PUBLIC RECORD · {recordNumber}</span>}
        width="6xl"
      />

      <main className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-8">
        <article className="border-2 border-ink bg-paper shadow-[8px_8px_0_rgba(22,19,14,0.18)]">
          <div className="border-b border-ink/25 px-4 py-3 sm:px-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold uppercase tracking-[0.13em] text-ink/70">{project.projectType}</p>
              <time dateTime={project.latestAsOf} className="font-mono text-xs font-medium text-ink/65">
                REVIEWED {new Date(`${project.latestAsOf}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).toUpperCase()}
              </time>
            </div>
          </div>

          <div className="grid lg:grid-cols-[minmax(0,1.45fr)_minmax(19rem,.55fr)]">
            <div className="px-4 py-6 sm:px-7 sm:py-8 lg:border-r lg:border-ink/25">
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink/70">
                <span>{project.road}</span>
                <span aria-hidden="true">·</span>
                <span>{project.routeName}</span>
              </div>
              <h1 className="mt-2 max-w-3xl text-3xl font-bold leading-[1.05] tracking-[-0.035em] sm:text-5xl">
                {project.title}
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-7 text-ink/80 sm:text-lg sm:leading-8">
                {project.summary}
              </p>

              <div className="mt-6 grid gap-px border border-ink/25 bg-ink/25 sm:grid-cols-2">
                <div className="bg-paper p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-ink/60">Responsible agency</p>
                  <p className="mt-2 text-base font-semibold leading-snug">{project.ownerAgencyShort}</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink/65">{project.ownerAgency}</p>
                </div>
                <div className="bg-paper p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-ink/60">Affected current wards</p>
                  <AffectedWards wards={project.affectedWards} basis={project.wardBasis} />
                </div>
              </div>
            </div>

            <aside className="bg-paper-muted px-4 py-6 sm:px-7 sm:py-8">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink/60">Current status</p>
              <p className={`mt-2 font-mono text-4xl font-semibold tracking-tight ${isBehindSchedule(project.status) ? "text-danger" : "text-ink"}`}>{project.status.toUpperCase()}</p>
              <p className="mt-3 text-base leading-7 text-ink/75">{project.statusNote}</p>
              <div className="mt-6 border-t border-ink/25 pt-4">
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-ink/60">Next public target</p>
                <p className="mt-1 font-mono text-2xl font-semibold uppercase">{project.nextTarget}</p>
              </div>
            </aside>
          </div>

          <div className="bg-danger px-4 py-4 text-paper sm:px-7">
            <div className="flex gap-3">
              <span aria-hidden="true" className="mt-2 h-2.5 w-2.5 shrink-0 bg-paper" />
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-paper/80">Open accountability gap</p>
                <p className="mt-1 text-base font-bold leading-6 sm:text-lg">{project.alert}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-px border-b border-ink/25 bg-ink/25 sm:grid-cols-2 lg:grid-cols-4">
            {project.metrics.map(metric => (
              <div key={metric.label} className="bg-paper p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-[0.09em] text-ink/65">{metric.label}</p>
                  <span className={`h-2.5 w-2.5 ${EVIDENCE_DOT[metric.evidence]}`} aria-hidden="true" />
                </div>
                <p className="mt-3 font-mono text-2xl font-semibold tracking-tight tabular-nums">{metric.value}</p>
                <p className="mt-2 text-sm leading-relaxed text-ink/70">{metric.note}</p>
              </div>
            ))}
          </div>
        </article>

        <div className="mt-6">
          <ProjectResearchWorkbench projectSlug={project.slug} agencyShort={project.ownerAgencyShort} suggestedQuestions={project.suggestedQuestions} />
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,.85fr)]">
          <section aria-labelledby="timeline-heading">
            <div className="flex items-baseline justify-between border-b-2 border-ink pb-2">
              <h2 id="timeline-heading" className="text-base font-bold uppercase tracking-[0.12em]">Deadline and scope trail</h2>
              <span className="font-mono text-xs text-ink/60">NEWEST FIRST</span>
            </div>
            <ol className="border-x border-b border-ink/25 bg-paper">
              {[...project.records].reverse().map((record, index) => (
                <li key={record.id} className={`p-4 sm:p-5 ${index > 0 ? "border-t border-ink/20" : ""}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <time dateTime={record.date} className="font-mono text-xs font-semibold text-ink/70">{record.dateLabel.toUpperCase()}</time>
                      <h3 className="mt-1 text-lg font-bold leading-snug">{record.title}</h3>
                      <p className="mt-2 text-base leading-7 text-ink/70">{record.body}</p>
                    </div>
                    <EvidenceBadge state={record.evidence} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                    {record.sourceIds.map(sourceId => {
                      const source = sources.get(sourceId)
                      return source ? (
                        <a key={sourceId} href={source.url} target="_blank" rel="noopener noreferrer" className={`text-sm font-semibold text-ink/70 underline decoration-accent/55 underline-offset-2 hover:text-ink hover:decoration-accent ${FOCUS}`}>
                          {source.publisher} ↗
                        </a>
                      ) : null
                    })}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="known-heading">
            <div className="border-b-2 border-ink pb-2">
              <h2 id="known-heading" className="text-base font-bold uppercase tracking-[0.12em]">Known, contested, missing</h2>
            </div>
            <div className="border-x border-b border-ink/25 bg-paper">
              {project.signals.map((signal, index) => (
                <div key={signal.id} className={`p-4 sm:p-5 ${index > 0 ? "border-t border-ink/20" : ""}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-[0.09em] text-ink/60">{signal.label}</p>
                    <EvidenceBadge state={signal.evidence} />
                  </div>
                  <p className="mt-3 text-lg font-bold leading-snug">{signal.value}</p>
                  <p className="mt-2 text-sm leading-6 text-ink/70">{signal.explanation}</p>
                  {signal.asOf && <p className="mt-3 font-mono text-xs text-ink/60">AS OF {signal.asOf}</p>}
                </div>
              ))}
            </div>
          </section>
        </div>

        {publishedResearch.length > 0 && (
          <section aria-labelledby="community-record-heading" className="mt-8">
            <div className="border-b-2 border-ink pb-2">
              <h2 id="community-record-heading" className="text-base font-bold uppercase tracking-[0.12em]">Published community research</h2>
            </div>
            <div className="border-x border-b border-ink/25 bg-paper">
              {publishedResearch.map((entry, index) => (
                <article key={entry.id} className={`p-4 sm:p-5 ${index > 0 ? "border-t border-ink/20" : ""}`}>
                  <p className="font-mono text-xs font-semibold text-success">REVIEWED CONTRIBUTION</p>
                  <h3 className="mt-2 text-lg font-bold">{entry.question}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-base leading-7 text-ink/75">{entry.answer}</p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {entry.sources.map(source => (
                      <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" className={`text-sm font-semibold underline decoration-accent/55 underline-offset-2 hover:decoration-accent ${FOCUS}`}>{source.title} ↗</a>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <section aria-labelledby="sources-heading" className="mt-8 border-2 border-ink bg-paper">
          <div className="border-b border-ink/25 px-4 py-3 sm:px-5">
            <h2 id="sources-heading" className="text-base font-bold uppercase tracking-[0.12em]">Source ledger</h2>
          </div>
          <ol className="grid gap-px bg-ink/20 sm:grid-cols-2">
            {project.sources.map((source, index) => (
              <li key={source.id} className="flex gap-3 bg-paper p-4">
                <span className="font-mono text-sm font-semibold tabular-nums text-ink/60">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <a href={source.url} target="_blank" rel="noopener noreferrer" className={`text-sm font-bold leading-snug underline decoration-accent/45 underline-offset-2 hover:decoration-accent ${FOCUS}`}>
                    {source.title}
                  </a>
                  <p className="mt-1 text-xs font-medium uppercase tracking-[0.06em] text-ink/60">
                    {source.publisher}{source.publishedOn ? ` · ${source.publishedOn}` : ""} · {source.kind}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <footer className="py-8 text-sm leading-relaxed text-ink/65">
          <p>
            Kaun separates official records, attributed reporting, conflicts and unknowns. Absence from this record means “not found in the sources reviewed,” not proof that a document does not exist.
          </p>
        </footer>
      </main>
    </div>
  )
}
