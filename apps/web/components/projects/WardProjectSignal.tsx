import Link from "next/link"
import type { PinResult } from "@/lib/types"
import { getCivicProjectsForPin } from "@/lib/civic-projects"

export function WardProjectSignal({ result }: { result: PinResult }) {
  const projects = getCivicProjectsForPin(result)
  if (projects.length === 0) return null

  return (
    <div className="shrink-0 border-b border-white/10 px-4 py-3">
      {projects.map(project => (
        <Link
          key={project.slug}
          href={`/bengaluru/projects/${project.slug}`}
          className="group block min-h-20 border-y border-[#16130e]/20 bg-[#efe9de] px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#c25400]"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#b42318]">Project record · {project.status}</p>
            <span className="text-sm font-semibold text-[#c25400] group-hover:translate-x-0.5 motion-safe:transition-transform" aria-hidden="true">→</span>
          </div>
          <p className="mt-1 text-sm font-bold leading-snug text-[#16130e]">{project.shortTitle}</p>
          <p className="mt-1 text-xs leading-relaxed text-[#16130e]/65">KRDCL · ₹482–488 Cr reported · 14 properties pending</p>
        </Link>
      ))}
    </div>
  )
}
