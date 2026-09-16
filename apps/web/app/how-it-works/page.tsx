import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "How Kaun works | kaun.city",
  description: "How kaun.city sources, verifies, and presents civic data about Bengaluru's wards, elected representatives, and public spending.",
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-10">
    <h2 className="mb-3 border-b border-ink/15 pb-2 text-sm font-bold uppercase tracking-[0.12em] text-ink">{title}</h2>
    <div className="space-y-3 text-sm leading-relaxed text-ink/75">{children}</div>
  </section>
)

export default function HowItWorksPage() {
  return (
    <div className="signal-page fixed inset-0 overflow-y-auto bg-paper-canvas text-ink" style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
      <div className="max-w-2xl mx-auto px-5 py-12">

        {/* Header */}
        <div className="signal-page-header mb-10 border-b-2 border-ink pb-4">
          <Link href="/" className="mb-4 inline-flex min-h-11 items-center font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-ink/60 transition-colors hover:text-ink">&larr; Back</Link>
          <h1 className="mb-2 text-2xl font-bold text-ink">How Kaun works</h1>
          <p className="text-sm text-ink/70">How we source data, what we show, and what we don&apos;t.</p>
        </div>

        <Section title="What Kaun is">
          <p>
            Kaun is a civic transparency tool for Bengaluru. Drop a pin anywhere in the city and see
            publicly available information about your ward &mdash; your elected MLA and MP, tenders
            awarded in your area, government spending, infrastructure, and active civic issues.
          </p>
          <p>
            We are not a service portal. We don&apos;t file complaints or connect you to officials.
            We surface information that already exists in public records, aggregated in one place.
          </p>
        </Section>

        <Section title="Where the data comes from">
          <div className="divide-y divide-ink/10 border-y border-ink/15">
            <div className="py-4">
              <p className="mb-1 font-semibold text-ink">Elected representatives</p>
              <p>MLA and MP details, assembly attendance, LAD fund utilisation, and declared criminal
              cases are sourced from <a href="https://myneta.info" target="_blank" rel="noopener noreferrer" className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">Myneta.info</a> and
              Karnataka legislative assembly records. Data is updated when new election affidavits or
              assembly records become available.</p>
            </div>
            <div className="py-4">
              <p className="mb-1 font-semibold text-ink">Tenders and contractors</p>
              <p>Public works tenders are sourced from the{" "}
              <a href="https://kppp.karnataka.gov.in" target="_blank" rel="noopener noreferrer" className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">Karnataka Public Procurement Portal (KPPP)</a>.
              Contractor records (total contracts, wards covered, payment deductions) are derived from BBMP work order data via{" "}
              <a href="https://opencity.in" target="_blank" rel="noopener noreferrer" className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">OpenCity.in</a>.
              Where shown, official blacklisting information is sourced from KPPP and BBMP published records.
              Payment deduction percentages reflect BBMP work order data — high deductions may indicate quality disputes, delays, or scope changes. Tenders refresh weekly.</p>
            </div>
            <div className="py-4">
              <p className="mb-1 font-semibold text-ink">Budget and ward spending</p>
              <p>BBMP budget data and ward-level spending figures come from{" "}
              <a href="https://opencity.in" target="_blank" rel="noopener noreferrer" className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">OpenCity.in</a> (CKAN open data portal)
              and BBMP&apos;s published budget documents. Years covered: 2018&ndash;23.</p>
            </div>
            <div className="py-4">
              <p className="mb-1 font-semibold text-ink">Grievances and Sakala</p>
              <p>Ward grievance counts are sourced from BBMP&apos;s grievance portal via{" "}
              <a href="https://opencity.in" target="_blank" rel="noopener noreferrer" className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">OpenCity.in</a>, refreshed monthly.
              Sakala performance rankings (government service delivery timelines) come from
              the Karnataka Sakala portal, updated manually each month (the site blocks automated access).</p>
            </div>
            <div className="py-4">
              <p className="mb-1 font-semibold text-ink">Infrastructure & amenities</p>
              <p>Ward-level counts for hospitals, pharmacies, ATMs, metro stations, public toilets, and EV charging points
              are sourced from{" "}
              <a href="https://www.openstreetmap.org" target="_blank" rel="noopener noreferrer" className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">OpenStreetMap</a> (OSM),
              cross-referenced with BBMP ward boundaries. Data reflects OSM contributor coverage and may be incomplete in some areas.</p>
            </div>
            <div className="py-4">
              <p className="mb-1 font-semibold text-ink">Road crashes</p>
              <p>Road accident data is sourced from NCRB (National Crime Records Bureau) and Karnataka state transport department records,
              aggregated to ward level. Data reflects reported accidents only.</p>
            </div>
            <div className="py-4">
              <p className="mb-1 font-semibold text-ink">Water quality</p>
              <p>Lake water quality data (good / moderate / poor) is sourced from Karnataka State Pollution Control Board (KSPCB)
              monitoring reports, mapped to the nearest ward.</p>
            </div>
            <div className="py-4">
              <p className="mb-1 font-semibold text-ink">Trade licences</p>
              <p>Ward-level trade licence counts are sourced from BBMP trade licence records via{" "}
              <a href="https://opencity.in" target="_blank" rel="noopener noreferrer" className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">OpenCity.in</a>, refreshed monthly.</p>
            </div>
            <div className="py-4">
              <p className="mb-1 font-semibold text-ink">News and civic signals</p>
              <p>The CityPulse ticker shows recent news about BBMP, BWSSB, and Bengaluru civic issues
              from public RSS feeds: Citizen Matters, The News Minute, and Google News searches for BBMP, BDA,
              BWSSB, BESCOM and potholes, which also surface public posts on X. Each item is credited to its
              original publisher, marked &ldquo;via Google News&rdquo; when that is where the link goes.
              Articles are filtered for civic relevance &mdash; public money, contractors, budgets, elected
              representatives, road safety, flooding, water, waste, power and the environment.</p>
            </div>
          </div>
        </Section>

        <Section title="Ward delimitations & the Kaun crosswalk">
          <p>
            Bengaluru has been redrawn repeatedly: the 2015 <strong>198</strong>-ward map,
            BBMP&apos;s 2023 <strong>225</strong>-ward delimitation, the KGIS/DataMeet <strong>243</strong>-ward
            set used by many historical datasets, and the final Greater Bengaluru Authority
            <strong> 369</strong>-ward delimitation across five city corporations. Kaun renders the final
            December 2025 GBA boundary and ward-name update.
          </p>
          <p>
            This matters because BBMP and IFMS tag every work order, payment and tender with the
            <strong> 225</strong>-ward or <strong>243</strong>-ward systems, while current GBA ward numbers restart
            inside each corporation. Kaun resolves a selected place spatially and keeps the source ward key
            with each historical fact; it does not join old and new records just because their numbers match.
          </p>
          <div className="border border-ink/15 bg-paper p-4">
            <p className="mb-1 font-semibold text-ink">The Kaun Ward Crosswalk</p>
            <p>
              No government or civic source publishes a mapping between the historical 225 and 243 schemes. So we built one —
              deterministically, by <strong>spatial polygon overlap</strong> of BBMP&apos;s official 225-ward
              boundaries against the 243-ward boundaries (no name guessing). It is versioned, every row cites
              its source, and it is open to public correction. Of 225 wards: 123 map cleanly 1:1, 83 have a
              clear primary 243 ward, and 19 genuinely straddle multiple 243 wards (we assign by largest
              overlap and record the full split).
            </p>
            <p className="mt-2">
              Full methodology, the dataset (CSV/JSON), and how to report an error:{" "}
              <a href="https://data.kaun.city/bengaluru/ward-crosswalk/" target="_blank" rel="noopener noreferrer" className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">data.kaun.city/bengaluru/ward-crosswalk</a>.
            </p>
          </div>
        </Section>

        <Section title="Evidence, not a score">
          <p>
            Kaun shows the underlying public measures directly: attendance, fund use, declared cases,
            ward meetings, infrastructure, complaints and contractor flags. It does not collapse unlike
            facts into one apparently precise ranking.
          </p>
          <div className="space-y-2 border border-ink/15 bg-paper p-4">
            <p className="font-semibold text-ink">Why the change matters</p>
            <ul className="divide-y divide-ink/10 border-t border-ink/10 text-sm text-ink/75">
              <li className="py-2">Every displayed measure can be traced to its source and period</li>
              <li className="py-2">Missing data remains visibly missing instead of silently changing a score</li>
              <li className="py-2">People can disagree with an interpretation without losing the underlying fact</li>
              <li className="py-2">Complaint volume is not treated as proof that one ward is governed better or worse</li>
            </ul>
          </div>
        </Section>

        <Section title="AI and project research">
          <p>
            Kaun&apos;s data records are not generated or gap-filled by AI.
          </p>
          <p>
            The project research desk runs an AI web search when you ask it a question. Its answers are
            labelled AI-generated and are not reviewed. They may be cached for up to seven days and shown to
            other visitors who ask the same question. Only findings a reviewer approves join the project record.
          </p>
        </Section>

        <Section title="What we don't do">
          <ul className="divide-y divide-ink/10 border-y border-ink/15">
            <li className="py-2">We do not use AI to generate or fill gaps in Kaun&apos;s data records</li>
            <li className="py-2">We do not rank wards using a composite score</li>
            <li className="py-2">We do not make editorial judgments about individuals or parties</li>
            <li className="py-2">We do not accept payments from government bodies, contractors, or political parties</li>
            <li className="py-2">We do not sell user data. Pin drops are anonymised.</li>
          </ul>
        </Section>

        <Section title="Data freshness">
          <p>Different datasets update at different intervals:</p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-ink/20">
                  <th className="py-2 pr-4 text-left text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60">Dataset</th>
                  <th className="py-2 text-left text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60">Refresh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {[
                  ["KPPP tenders", "Weekly (Sundays)"],
                  ["Trade licences", "Monthly (3rd)"],
                  ["BBMP grievances", "Monthly (2nd)"],
                  ["Sakala rankings", "Monthly (1st) — manually, site blocks automated access"],
                  ["CityPulse news", "Daily (6am UTC)"],
                  ["Civic signals", "Daily (2am UTC)"],
                  ["Elected rep data", "On election cycle / when new records published"],
                  ["Budget data", "Annually"],
                ].map(([ds, freq]) => (
                  <tr key={ds}>
                    <td className="py-2 pr-4 text-ink">{ds}</td>
                    <td className="py-2 text-ink/70">{freq}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Found an error?">
          <p>
            Data accuracy is our top priority. If you find something wrong &mdash; a wrong MLA name,
            an outdated tender, a broken boundary &mdash; please report it. We treat data corrections
            as the highest priority fix.
          </p>
          <p>
            <a href="mailto:hello@kaun.city" className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">hello@kaun.city</a>
            {" "}or file an issue on{" "}
            <a href="https://github.com/kaun-city/kaun" target="_blank" rel="noopener noreferrer" className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">GitHub</a>.
          </p>
        </Section>

        <Section title="Legal & disclaimer">
          <p>
            kaun.city presents data sourced entirely from public government records, official portals, and open civic datasets.
            We do not create, modify, or editorially characterise government data beyond what is stated in the source records.
          </p>
          <p>
            Data accuracy depends on the source agencies. kaun.city is not responsible for errors, omissions, or outdated
            information in source data. If you find an error, please report it to{" "}
            <a href="mailto:hello@kaun.city" className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">hello@kaun.city</a> and we will prioritise correcting it.
          </p>
          <p>
            Contractor records shown on kaun.city are derived from BBMP work order data and the Karnataka Public Procurement Portal (KPPP).
            Blacklist information, where shown, refers to official government blacklisting records as per KPPP / BBMP published records.
            Payment deduction percentages reflect data in BBMP work orders and may reflect legitimate scope changes, quality disputes, or administrative adjustments.
          </p>
          <p>
            Criminal cases shown for elected representatives refer to cases self-declared by the candidate in their Election Commission
            of India nomination affidavit. These are not convictions. kaun.city makes no editorial judgment about individuals.
          </p>
          <p>
            Net worth figures are self-declared in Election Commission nomination affidavits and are presented as-is.
            Percentage changes between election cycles are calculated by kaun.city from successive affidavit data.
          </p>
        </Section>

        <div className="border-t border-ink/15 pt-6 text-xs text-ink/60">
          <p>Kaun is open source (MIT licence). Data sources are public government records and open civic datasets.</p>
          <p className="mt-1">
            <Link href="/" className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">kaun.city</Link>
            {" "}&middot;{" "}
            <a href="https://github.com/kaun-city/kaun" target="_blank" rel="noopener noreferrer" className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">GitHub</a>
          </p>
        </div>

      </div>
    </div>
  )
}
