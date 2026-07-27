import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { IndiaHeader } from "@/components/india/IndiaHeader"
import { BackToMap } from "@/components/india/BackToMap"
import { ObjectHeader, Section } from "@/components/india/ObjectHeader"
import { MpCard } from "@/components/india/MpCard"
import { ActivityCard } from "@/components/india/ActivityCard"
import { MpladsCard } from "@/components/india/MpladsCard"
import { AffidavitTimeline } from "@/components/india/AffidavitTimeline"
import { ProjectRow } from "@/components/india/ProjectRow"
import { SourcesFooter } from "@/components/india/SourcesFooter"
import { fetchConstituencyProfile } from "@/lib/india/api"
import { isPcCode } from "@/lib/india/pc-code"
import { mapHrefForSeat } from "@/lib/india/map-url-state"
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
 *
 * INCREMENTALLY REGENERATED, ON DEMAND. 543 seats, each a page whose content
 * changes when a weekly or monthly cron writes a row, and never otherwise. So
 * a seat is rendered the first time somebody asks for it and then reused for
 * an hour. There is deliberately no generateStaticParams: prerendering all 543
 * at build time would put 543 cold page renders in front of every deploy for
 * seats most of which nobody will open that hour, and ISR reaches the same
 * steady state without paying for it up front.
 *
 * Being prerenderable is also what makes the seat preview's "open constituency
 * page" button feel instant — a <Link> to a dynamic route can only prefetch the
 * loading skeleton, but a <Link> to this one prefetches the finished page.
 * That is why the page takes no headers(); see PRODUCTION_ROOT_DOMAIN in
 * lib/host-routing.ts.
 */
export const revalidate = 3600 // = INDIA_REVALIDATE_SECONDS; must be a literal (Next segment config)

/**
 * Empty on purpose, and required to be here.
 *
 * `revalidate` alone does not make a dynamic segment incrementally static —
 * Next only treats [pc_code] as cacheable when the route declares
 * generateStaticParams at all. Returning no params says "prerender none of
 * them at build time"; dynamicParams stays true, so the first request for a
 * seat renders it and every request for the next hour is served the result.
 *
 * Prerendering all 543 here is a one-line change if a cold first visit ever
 * proves to be the thing worth fixing. It is not today: it would add 543 page
 * renders to every deploy, for a hit rate concentrated in a few dozen seats.
 */
export function generateStaticParams() {
  return []
}

type Props = { params: Promise<{ pc_code: string }> }

/**
 * Metadata is the other half of the share card.
 *
 * The image (opengraph-image.tsx in this segment) is what a reader sees; these
 * strings are what they read under it, what a search result shows, and what a
 * screen reader announces. So the OG title names the three things that make a
 * link worth opening — the seat, the state, and the member who holds it —
 * rather than repeating the site name, which the siteName field already
 * carries. Next fills openGraph.images and twitter.images from the sibling
 * opengraph-image.tsx, resolved against the metadataBase set in the India
 * layout; nothing here needs to name an image URL.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { pc_code } = await params
  const fallback: Metadata = { title: "Lok Sabha constituency | KAUN?" }
  if (!isPcCode(pc_code)) return fallback
  const profile = await fetchConstituencyProfile(pc_code)
  if (!profile) return fallback

  const { constituency: c, mp } = profile
  const who = mp ? `${mp.name}${mp.party_abbr ? ` (${mp.party_abbr})` : ""}` : null
  const title = `${c.pc_name}, ${c.state_name} | KAUN?`
  const ogTitle = who
    ? `${c.pc_name}, ${c.state_name} — ${who}`
    : `${c.pc_name}, ${c.state_name}`
  const description = who
    ? `${who} holds ${c.pc_name}. Declared record, parliamentary activity, MPLADS spend and central projects — from public sources.`
    : `${c.pc_name} in ${c.state_name}: declared record, parliamentary activity and central projects, from public sources.`

  // Relative in both modes (/india/c/29-25 or /c/29-25) and absolute-ised
  // against metadataBase, so the canonical never names a city subdomain.
  const url = indiaHref(`/c/${pc_code}`)

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title: ogTitle, description, url, type: "profile", siteName: "Kaun", locale: "en_IN" },
    twitter: { card: "summary_large_image", title: ogTitle, description },
  }
}

export default async function ConstituencyPage({ params }: Props) {
  const { pc_code } = await params
  // layout.tsx has already rejected anything that is not one of the 543 real
  // seats, above the Suspense boundary this body sits inside — which is the
  // only place a notFound() can still set the status line. These two are the
  // backstop for the case it cannot see: a real seat with no row yet (fixture
  // mode, a half-run seeder). They stream, so they remain soft 404s.
  if (!isPcCode(pc_code)) notFound()

  const profile = await fetchConstituencyProfile(pc_code)
  if (!profile) notFound()

  const { constituency: c, mp, affidavit, activity, mplads, projects, projectsTotal } = profile
  const reportMonth = projects[0]?.report_month ?? null

  /**
   * The map, with this seat already selected. Used by both ways back — the
   * BackToMap control's no-history fallback and the "see on the map" link in
   * the subtitle — so neither of them ever drops a reader onto an unfocused
   * national map and makes them hunt for the seat they were just reading.
   */
  const mapHref = mapHrefForSeat(indiaHref("/"), c.pc_code)

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
      {/* pb-28 on phones clears the fixed back control; from md up it is an
          in-flow chip and the ordinary padding is enough again. */}
      <div className="max-w-3xl mx-auto px-5 py-6 pb-28 md:pb-6">
        <BackToMap href={mapHref} />

        {/* The entry animation lives on this wrapper and not on the container
            above, because a transform makes an element the containing block for
            every fixed descendant — animating the container would peel the back
            control off the viewport and slide it with the page. */}
        <div className="kaun-page-enter">
          <IndiaHeader />

          <div className="mt-6">
            <ObjectHeader
              eyebrow={`${c.state_name} · Lok Sabha seat ${c.pc_no}`}
              title={c.pc_name}
              subtitle={
                <>
                  {c.pc_name_hi && <span className="text-white/40">{c.pc_name_hi} · </span>}
                  <Link href={mapHref} className="text-[#FF9933]/60 hover:text-[#FF9933]">see on the map</Link>
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
                <Link
                  href={indiaHref(`/projects?state=${c.st_code}`)}
                  className="inline-block mt-3 text-[#FF9933]/70 hover:text-[#FF9933] text-xs"
                >
                  All {projectsTotal.toLocaleString("en-IN")} central projects in {c.state_name} &rarr;
                </Link>
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
    </div>
  )
}
