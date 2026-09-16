/**
 * The identity header every India object page opens with — a constituency, a
 * central project, and whatever object type comes next.
 *
 * Object pages are the core primitive of this surface: each one has a stable
 * URL that a future product layer can attach to. Their headers therefore share
 * one component rather than each page inventing its own, so a seat page and a
 * project page are recognisably the same kind of thing.
 *
 * Layout: eyebrow / title / subtitle on the left, chips and the presence slot
 * on the right.
 */
import type { ReactNode } from "react"

/**
 * Reserved space in the header's top-right.
 *
 * Empty in v1 and renders nothing at all. It exists because the alternative —
 * a header laid out with no room on the right — is the version that has to be
 * rebuilt the moment this object grows a watch count, a follower count or a
 * "N people are tracking this" affordance. Reserving the slot now costs one
 * empty div; retrofitting it costs a redesign of both object pages.
 */
export function PresenceSlot({ children }: { children?: ReactNode }) {
  if (!children) return null
  return <div className="flex items-center gap-2 shrink-0">{children}</div>
}

export interface Chip {
  label: string
  /** Optional value rendered brighter than the label. */
  value?: string
  title?: string
}

export function ObjectHeader({
  eyebrow, title, subtitle, chips = [], presence,
}: {
  eyebrow: string
  title: string
  subtitle?: ReactNode
  chips?: Chip[]
  presence?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap bg-paper border border-ink/55 border-t-2 border-t-ink p-4">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60">{eyebrow}</p>
        <h1 className="text-ink font-bold text-2xl tracking-tight mt-1 leading-tight">{title}</h1>
        {subtitle && <div className="text-ink/75 text-sm mt-1.5">{subtitle}</div>}
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {chips.map(c => (
              <span
                key={c.label + (c.value ?? "")}
                title={c.title}
                className="inline-flex items-center gap-1.5 border border-ink/20 px-1.5 py-1
                  font-mono text-[11px] text-ink/70"
              >
                <span className="uppercase tracking-[0.06em]">{c.label}</span>
                {c.value && <span className="text-ink font-semibold normal-case">{c.value}</span>}
              </span>
            ))}
          </div>
        )}
      </div>
      <PresenceSlot>{presence}</PresenceSlot>
    </div>
  )
}

/** Section heading used down the length of every object page. */
export function Section({
  title, note, children,
}: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3 border-b border-ink/20 pb-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/75">{title}</h2>
        {note && <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink/60">{note}</p>}
      </div>
      {children}
    </section>
  )
}

/** A single labelled number. No grading, no colour-by-goodness — see below. */
export function Stat({
  label, value, muted = false, note,
}: { label: string; value: ReactNode; muted?: boolean; note?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60">{label}</p>
      <p className={muted ? "text-ink/60 text-xs italic" : "text-ink text-lg font-semibold font-mono tabular-nums"}>{value}</p>
      {note && <p className="text-ink/60 text-xs leading-snug">{note}</p>}
    </div>
  )
}
