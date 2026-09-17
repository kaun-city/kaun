import type { Metadata } from "next"
import Link from "next/link"
import { BackLink, PageHeader } from "@/components/shared/PageHeader"
import { CIVIC_PROJECTS, isBehindSchedule, projectWardLabels, type CivicProject } from "@/lib/civic-projects"

export const metadata: Metadata = {
  title: "Project records — Bengaluru | KAUN?",
  description: "Public records of multi-ward civic projects in Bengaluru: status, deadline and cost history, and open accountability gaps, each with its sources.",
}

function wardSummary(project: CivicProject): string {
  if (project.affectedWards.length === 0) return "Not attached to wards"
  if (project.affectedWards.length <= 3) return projectWardLabels(project).join(" · ")
  const corporations = [...new Set(project.affectedWards.map(ward => ward.corporation))].sort().join(", ")
  return `${project.affectedWards.length} wards · ${corporations}`
}

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"

/**
 * The index of civic project records. A project spans several wards, so it
 * needs a home of its own rather than only a card inside one ward's sheet.
 */
export default function CivicProjectsIndexPage() {
  const projects = CIVIC_PROJECTS.filter(project => project.cityId === "bengaluru")

  return (
    <div className="signal-record fixed inset-0 overflow-y-auto bg-paper-canvas text-ink">
      <PageHeader surface="city" back={<BackLink href="/" label="Map" ariaLabel="Back to the map" />} width="4xl" />

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
        <h1 className="text-3xl font-bold tracking-[-0.03em] sm:text-4xl">Project records</h1>
        <p className="mt-2 max-w-2xl text-base leading-7 text-ink/75">
          Civic projects that span several wards, followed over time. Each record separates official documents,
          attributed reporting, conflicting figures and what could not be found.
        </p>

        <ul className="mt-8 border-t-2 border-ink">
          {projects.map(project => (
            <li key={project.slug} className="border-b border-ink/20">
              <Link href={`/bengaluru/projects/${project.slug}`} className={`group block py-5 hover:bg-ink/[0.03] ${FOCUS}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60">
                    {project.projectType} · {project.road}
                  </p>
                  <p className={`font-mono text-[11px] uppercase tracking-[0.08em] ${isBehindSchedule(project.status) ? "text-danger" : "text-ink/70"}`}>{project.status}</p>
                </div>
                <h2 className="mt-1 text-xl font-bold leading-snug text-ink group-hover:underline decoration-accent/40 underline-offset-4">
                  {project.title}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-ink/75">{project.statusNote}</p>
                <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60">Agency</dt>
                    <dd className="font-semibold text-ink">{project.ownerAgencyShort}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60">Next public target</dt>
                    <dd className="font-mono font-semibold uppercase text-ink">{project.nextTarget}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60">Affected wards</dt>
                    <dd className="text-ink">{wardSummary(project)}</dd>
                  </div>
                </dl>
                <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.08em] text-accent">
                  Open the record <span aria-hidden="true">&rarr;</span>
                </p>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-xs leading-relaxed text-ink/60">
          Records also appear on the ward sheet of every affected ward, and in map search.
        </p>
      </main>
    </div>
  )
}
