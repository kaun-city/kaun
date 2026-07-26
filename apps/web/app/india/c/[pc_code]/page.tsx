import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { IndiaHeader } from "@/components/india/IndiaHeader"
import { ObjectHeader, Section } from "@/components/india/ObjectHeader"
import { MpCard } from "@/components/india/MpCard"
import { ActivityCard } from "@/components/india/ActivityCard"
import { MpladsCard } from "@/components/india/MpladsCard"
import { AffidavitTimeline } from "@/components/india/AffidavitTimeline"
import { ProjectRow } from "@/components/india/ProjectRow"
import { SourcesFooter } from "@/components/india/SourcesFooter"
import { fetchConstituencyProfile } from "@/lib/india/api"
import { isPcCode } from "@/lib/india/pc-code"
import { indiaHref } from "@/lib/host-routing"
import { FIXTURE_ACTIVITY_BENCHMARKS, isFixtureMode } from "@/lib/india/fixtures"
import { formatMonth } from "@/lib/india/format"
import {
  MOSPI_STATE_LEVEL_NOTE, SOURCE_ACTIVITY, SOURCE_AFFIDAVITS, SOURCE_MOSPI,
  SOURCE_MPLADS, SOURCE_PC_BOUNDARIES, SOURCE_ROSTER,
} from "@/lib/india/constants"

/**
 * The constituency page — the canonical object for one of the 543 seats.
 *
 * Structure, shared with the project page: identity header → key facts →
 * money → time → sources. It is a server component so the seat has a real,
 * crawlable URL with real content in the HTML; the read path is the same
 * lib/india/api.ts the client components use, so there is one way to read
 * these tables and only one.
 */
export const dynamic = "force-dynamic"

type Props = { params: Promise<{ pc_code: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { pc_code } = await params
  if (!isPcCode(pc_code)) return {}
  const profile = await fetchConstituencyProfile(pc_code)
  if (!profile) return {}
  const { constituency: c, mp } = profile
  const title = `${c.pc_name}, ${c.state_name} | KAUN?`
  const description = mp
    ? `${mp.name}${mp.party_abbr ? ` (${mp.party_abbr})` : ""} holds ${c.pc_name}. Declared record, parliamentary activity, MPLADS spend and central projects — from public sources.`
    : `${c.pc_name} in ${c.state_name}: declared record, parliamentary activity and central projects, from public sources.`
  return {
    title,
    description,
    openGraph: { title, description, type: "profile" },
  }
}

export default async function ConstituencyPage({ params }: Props) {
  const { pc_code } = await params
  if (!isPcCode(pc_code)) notFound()

  const profile = await fetchConstituencyProfile(pc_code)
  if (!profile) notFound()

  const { constituency: c, mp, affidavit, activity, mplads, projects, projectsTotal } = profile
  const reportMonth = projects[0]?.report_month ?? null

  const sources = [
    SOURCE_PC_BOUNDARIES,
    SOURCE_ROSTER,
    ...(affidavit ? [SOURCE_AFFIDAVITS] : []),
    ...(activity.length ? [SOURCE_ACTIVITY] : []),
    ...(mplads.length ? [{ ...SOURCE_MPLADS, caveat: mplads[0].data_source.startsWith("FIXTURE") ? mplads[0].data_source : undefined }] : []),
    ...(projects.length ? [SOURCE_MOSPI] : []),
  ]

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-5 py-6">
        <IndiaHeader />

        <div className="mt-6">
          <ObjectHeader
            eyebrow={`${c.state_name} · Lok Sabha seat ${c.pc_no}`}
            title={c.pc_name}
            subtitle={
              <>
                {c.pc_name_hi && <span className="text-white/40">{c.pc_name_hi} · </span>}
                <a href={indiaHref("/")} className="text-[#FF9933]/60 hover:text-[#FF9933]">see on the map</a>
              </>
            }
            chips={[
              { label: "seat", value: c.pc_code, title: "Kaun's constituency key: <state code>-<seat number>" },
              ...(c.reserved_for
                ? [{ label: "reserved", value: c.reserved_for, title: `Source: ${c.reserved_source}` }]
                : []),
              ...(mp ? [{ label: "term", value: mp.term_label }] : []),
              ...(c.geom_source ? [{ label: "boundary", value: c.geom_source }] : []),
            ]}
            /* presence slot intentionally empty in v1 — see ObjectHeader */
          />
        </div>

        {!c.reserved_for && (
          <p className="text-white/20 text-[11px] mt-3 leading-snug">
            Reservation status (SC/ST) is shown only when it comes from the Delimitation Order. Every
            boundary and roster file checked under-reports it, so Kaun leaves it blank rather than
            repeating a figure it knows to be wrong.
          </p>
        )}

        <Section title="Who holds this seat">
          <MpCard mp={mp} affidavit={affidavit} />
        </Section>

        <Section title="In Parliament" note="components, not a score">
          <ActivityCard
            activity={activity}
            benchmarks={isFixtureMode() ? FIXTURE_ACTIVITY_BENCHMARKS : null}
          />
        </Section>

        <Section title="Local area development funds">
          <MpladsCard rows={mplads} />
        </Section>

        {affidavit && (
          <Section title="Over time">
            <AffidavitTimeline affidavit={affidavit} />
          </Section>
        )}

        <Section
          title={`Central projects in ${c.state_name}`}
          note={reportMonth ? `MoSPI report, ${formatMonth(reportMonth)}` : undefined}
        >
          <p className="text-white/30 text-[11px] leading-snug mb-2.5">{MOSPI_STATE_LEVEL_NOTE}</p>
          {projects.length === 0 ? (
            <div className="rounded-xl bg-white/5 p-4">
              <p className="text-white/50 text-sm">No central projects loaded for this state yet.</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {projects.map(p => <ProjectRow key={p.project_code} p={p} />)}
              </div>
              <a
                href={indiaHref(`/projects?state=${c.st_code}`)}
                className="inline-block mt-3 text-[#FF9933]/70 hover:text-[#FF9933] text-xs"
              >
                All {projectsTotal.toLocaleString("en-IN")} central projects in {c.state_name} &rarr;
              </a>
            </>
          )}
        </Section>

        <SourcesFooter
          sources={sources}
          crosswalkNote={
            "Constituency-to-district mapping: not applied on this page. MoSPI's own data stops at the state, so nothing below state level is claimed here."
          }
        />
      </div>
    </div>
  )
}
