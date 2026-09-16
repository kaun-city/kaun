import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ProjectResearchWorkbench } from "@/components/projects/ProjectResearchWorkbench"
import { getCivicProject, sourceMap, type EvidenceState } from "@/lib/civic-projects"
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
  verified: "border-[#24643c]/40 bg-[#24643c]/8 text-[#205533]",
  reported: "border-[#255c86]/35 bg-[#255c86]/7 text-[#214f73]",
  conflicting: "border-[#a05d00]/40 bg-[#a05d00]/7 text-[#8a5000]",
  unknown: "border-[#b42318]/35 bg-[#b42318]/7 text-[#941f16]",
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
  const publishedResearch = await fetchPublishedProjectResearch(project.slug)

  return (
    <div className="signal-record fixed inset-0 overflow-y-auto bg-[#e5dfd3] text-[#16130e]">
      <header className="sticky top-0 z-20 border-b-2 border-[#16130e] bg-[#f8f5ef]/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex min-h-11 items-center border-b-2 border-[#16130e] px-2 text-xl font-bold tracking-tight focus:outline-none focus:ring-2 focus:ring-[#c25400]">
            KAUN<span className="text-[#c25400]">?</span>
          </Link>
          <nav aria-label="Kaun surfaces" className="flex items-center border border-[#16130e]/55">
            <Link href="/india" className="flex min-h-11 items-center px-3 font-mono text-xs font-semibold tracking-[0.08em] text-[#16130e]/65 hover:bg-[#16130e]/5">IN</Link>
            <Link href="/" aria-current="page" className="flex min-h-11 items-center bg-[#16130e] px-3 font-mono text-xs font-semibold tracking-[0.08em] text-[#f8f5ef]">BLR</Link>
            <a href="https://data.kaun.city" className="flex min-h-11 items-center px-3 font-mono text-xs font-semibold tracking-[0.08em] text-[#16130e]/65 hover:bg-[#16130e]/5">DATA</a>
          </nav>
          <span className="ml-auto hidden font-mono text-xs tracking-[0.08em] text-[#16130e]/55 sm:block">PUBLIC RECORD · 01</span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-8">
        <article className="border-2 border-[#16130e] bg-[#f8f5ef] shadow-[8px_8px_0_rgba(22,19,14,0.18)]">
          <div className="border-b border-[#16130e]/25 px-4 py-3 sm:px-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold uppercase tracking-[0.13em] text-[#16130e]/70">{project.projectType}</p>
              <time dateTime={project.latestAsOf} className="font-mono text-xs font-medium text-[#16130e]/65">
                REVIEWED {new Date(`${project.latestAsOf}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}
              </time>
            </div>
          </div>

          <div className="grid lg:grid-cols-[minmax(0,1.45fr)_minmax(19rem,.55fr)]">
            <div className="px-4 py-6 sm:px-7 sm:py-8 lg:border-r lg:border-[#16130e]/25">
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#16130e]/70">
                <span>{project.road}</span>
                <span aria-hidden="true">·</span>
                <span>{project.routeName}</span>
              </div>
              <h1 className="mt-2 max-w-3xl text-3xl font-bold leading-[1.05] tracking-[-0.035em] sm:text-5xl">
                {project.title}
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-7 text-[#16130e]/78 sm:text-lg sm:leading-8">
                {project.summary}
              </p>

              <div className="mt-6 grid gap-px border border-[#16130e]/25 bg-[#16130e]/25 sm:grid-cols-2">
                <div className="bg-[#f8f5ef] p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#16130e]/60">Responsible agency</p>
                  <p className="mt-2 text-base font-semibold leading-snug">KRDCL</p>
                  <p className="mt-1 text-sm leading-relaxed text-[#16130e]/65">{project.ownerAgency}</p>
                </div>
                <div className="bg-[#f8f5ef] p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#16130e]/60">Affected current wards</p>
                  <div className="mt-2 space-y-1 text-sm font-semibold">
                    {project.affectedWardLabels.map(label => <p key={label}>{label}</p>)}
                  </div>
                </div>
              </div>
            </div>

            <aside className="bg-[#efe9de] px-4 py-6 sm:px-7 sm:py-8">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#16130e]/60">Current status</p>
              <p className="mt-2 font-mono text-4xl font-semibold tracking-tight text-[#b42318]">{project.status.toUpperCase()}</p>
              <p className="mt-3 text-base leading-7 text-[#16130e]/75">{project.statusNote}</p>
              <div className="mt-6 border-t border-[#16130e]/25 pt-4">
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#16130e]/60">Next public target</p>
                <p className="mt-1 font-mono text-2xl font-semibold">DEC 2026</p>
              </div>
            </aside>
          </div>

          <div className="bg-[#b42318] px-4 py-4 text-[#fffaf1] sm:px-7">
            <div className="flex gap-3">
              <span aria-hidden="true" className="mt-2 h-2.5 w-2.5 shrink-0 bg-[#fffaf1]" />
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#fffaf1]/80">Open accountability gap</p>
                <p className="mt-1 text-base font-bold leading-6 sm:text-lg">{project.alert}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-px border-b border-[#16130e]/25 bg-[#16130e]/25 sm:grid-cols-2 lg:grid-cols-4">
            {project.metrics.map(metric => (
              <div key={metric.label} className="bg-[#f8f5ef] p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-[0.09em] text-[#16130e]/65">{metric.label}</p>
                  <span className={`h-2.5 w-2.5 ${metric.evidence === "verified" ? "bg-[#24643c]" : metric.evidence === "reported" ? "bg-[#255c86]" : metric.evidence === "conflicting" ? "bg-[#a05d00]" : "bg-[#b42318]"}`} aria-hidden="true" />
                </div>
                <p className="mt-3 font-mono text-2xl font-semibold tracking-tight">{metric.value}</p>
                <p className="mt-2 text-sm leading-relaxed text-[#16130e]/68">{metric.note}</p>
              </div>
            ))}
          </div>
        </article>

        <div className="mt-6">
          <ProjectResearchWorkbench projectSlug={project.slug} suggestedQuestions={project.suggestedQuestions} />
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,.85fr)]">
          <section aria-labelledby="timeline-heading">
            <div className="flex items-baseline justify-between border-b-2 border-[#16130e] pb-2">
              <h2 id="timeline-heading" className="text-base font-bold uppercase tracking-[0.12em]">Deadline and scope trail</h2>
              <span className="font-mono text-xs text-[#16130e]/60">NEWEST FIRST</span>
            </div>
            <ol className="border-x border-b border-[#16130e]/25 bg-[#f8f5ef]">
              {[...project.records].reverse().map((record, index) => (
                <li key={record.id} className={`p-4 sm:p-5 ${index > 0 ? "border-t border-[#16130e]/20" : ""}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <time dateTime={record.date} className="font-mono text-xs font-semibold text-[#c25400]">{record.dateLabel.toUpperCase()}</time>
                      <h3 className="mt-1 text-lg font-bold leading-snug">{record.title}</h3>
                      <p className="mt-2 text-base leading-7 text-[#16130e]/72">{record.body}</p>
                    </div>
                    <EvidenceBadge state={record.evidence} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                    {record.sourceIds.map(sourceId => {
                      const source = sources.get(sourceId)
                      return source ? (
                        <a key={sourceId} href={source.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-[#16130e]/68 underline decoration-[#c25400]/55 underline-offset-2 hover:text-[#16130e]">
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
            <div className="border-b-2 border-[#16130e] pb-2">
              <h2 id="known-heading" className="text-base font-bold uppercase tracking-[0.12em]">Known, contested, missing</h2>
            </div>
            <div className="border-x border-b border-[#16130e]/25 bg-[#f8f5ef]">
              {project.signals.map((signal, index) => (
                <div key={signal.id} className={`p-4 sm:p-5 ${index > 0 ? "border-t border-[#16130e]/20" : ""}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-[0.09em] text-[#16130e]/60">{signal.label}</p>
                    <EvidenceBadge state={signal.evidence} />
                  </div>
                  <p className="mt-3 text-lg font-bold leading-snug">{signal.value}</p>
                  <p className="mt-2 text-sm leading-6 text-[#16130e]/70">{signal.explanation}</p>
                  {signal.asOf && <p className="mt-3 font-mono text-xs text-[#16130e]/58">AS OF {signal.asOf}</p>}
                </div>
              ))}
            </div>
          </section>
        </div>

        {publishedResearch.length > 0 && (
          <section aria-labelledby="community-record-heading" className="mt-8">
            <div className="border-b-2 border-[#16130e] pb-2">
              <h2 id="community-record-heading" className="text-base font-bold uppercase tracking-[0.12em]">Published community research</h2>
            </div>
            <div className="border-x border-b border-[#16130e]/25 bg-[#f8f5ef]">
              {publishedResearch.map((entry, index) => (
                <article key={entry.id} className={`p-4 sm:p-5 ${index > 0 ? "border-t border-[#16130e]/20" : ""}`}>
                  <p className="font-mono text-xs font-semibold text-[#24643c]">REVIEWED CONTRIBUTION</p>
                  <h3 className="mt-2 text-lg font-bold">{entry.question}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-base leading-7 text-[#16130e]/75">{entry.answer}</p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {entry.sources.map(source => (
                      <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold underline decoration-[#c25400]/55 underline-offset-2">{source.title} ↗</a>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <section aria-labelledby="sources-heading" className="mt-8 border-2 border-[#16130e] bg-[#f8f5ef]">
          <div className="border-b border-[#16130e]/25 px-4 py-3 sm:px-5">
            <h2 id="sources-heading" className="text-base font-bold uppercase tracking-[0.12em]">Source ledger</h2>
          </div>
          <ol className="grid gap-px bg-[#16130e]/20 sm:grid-cols-2">
            {project.sources.map((source, index) => (
              <li key={source.id} className="flex gap-3 bg-[#f8f5ef] p-4">
                <span className="font-mono text-sm font-semibold text-[#c25400]">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-sm font-bold leading-snug underline decoration-[#c25400]/45 underline-offset-2 hover:decoration-[#c25400]">
                    {source.title}
                  </a>
                  <p className="mt-1 text-xs font-medium uppercase tracking-[0.06em] text-[#16130e]/60">
                    {source.publisher}{source.publishedOn ? ` · ${source.publishedOn}` : ""} · {source.kind}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <footer className="py-8 text-sm leading-relaxed text-[#16130e]/65">
          <p>
            Kaun separates official records, attributed reporting, conflicts and unknowns. Absence from this record means “not found in the sources reviewed,” not proof that a document does not exist.
          </p>
        </footer>
      </main>
    </div>
  )
}
