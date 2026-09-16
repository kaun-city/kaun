import Link from "next/link"
import type { PinResult } from "@/lib/types"
import { getCivicProjectsForPin } from "@/lib/civic-projects"

export function WardProjectSignal({ result }: { result: PinResult }) {
  const projects = getCivicProjectsForPin(result)
  if (projects.length === 0) return null

  return (
    <div className="mx-5 mb-3">
      {projects.map(project => (
        <Link
          key={project.slug}
          href={`/bengaluru/projects/${project.slug}`}
          className="group block min-h-20 border border-ink/25 bg-paper-muted px-3.5 py-3 hover:border-ink/55 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-danger">Project record · {project.status}</p>
            <span className="text-sm font-semibold text-accent group-hover:translate-x-0.5 motion-safe:transition-transform" aria-hidden="true">→</span>
          </div>
          <p className="mt-1 text-sm font-bold leading-snug text-ink">{project.shortTitle}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink/70">{project.wardSignalNote}</p>
        </Link>
      ))}
    </div>
  )
}
