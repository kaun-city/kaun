import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "How Kaun Works | kaun.city",
  description: "How kaun.city sources, verifies, and presents civic data about Bengaluru's wards, elected representatives, and public spending.",
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-10">
    <h2 className="text-white/80 text-lg font-semibold mb-3">{title}</h2>
    <div className="text-white/50 text-sm leading-relaxed space-y-3">{children}</div>
  </section>
)

export default function HowItWorksPage() {
  return (
    <div className="bg-zinc-950 text-white fixed inset-0 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
      <div className="max-w-2xl mx-auto px-5 py-12">

        {/* Header */}
        <div className="mb-10">
          <Link href="/" className="text-white/30 text-sm hover:text-white/60 transition-colors mb-6 inline-block">&larr; Back</Link>
          <h1 className="text-2xl font-bold text-white mb-2">How Kaun Works</h1>
          <p className="text-white/40 text-sm">How we source data, what we show, and what we don&apos;t.</p>
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
          <div className="space-y-4">
            <div className="rounded-lg bg-white/5 border border-white/10 p-4">
              <p className="text-white/70 font-medium mb-1">Elected representatives</p>
              <p>MLA and MP details, assembly attendance, LAD fund utilisation, and declared criminal
              cases are sourced from <a href="https://myneta.info" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Myneta.info</a> and
              Karnataka legislative assembly records. Data is updated when new election affidavits or
              assembly records become available.</p>
            </div>
            <div className="rounded-lg bg-white/5 border border-white/10 p-4">
              <p className="text-white/70 font-medium mb-1">Tenders and contractors</p>
              <p>Public works tenders are sourced from the{" "}
              <a href="https://kppp.karnataka.gov.in" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Karnataka Public Procurement Portal (KPPP)</a>.
              Contractor records (total contracts, wards covered, payment deductions) are derived from BBMP work order data via{" "}
              <a href="https://opencity.in" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">OpenCity.in</a>.
              Where shown, official blacklisting information is sourced from KPPP and BBMP published records.
              Payment deduction percentages reflect BBMP work order data — high deductions may indicate quality disputes, delays, or scope changes. Tenders refresh weekly.</p>
            </div>
            <div className="rounded-lg bg-white/5 border border-white/10 p-4">
              <p className="text-white/70 font-medium mb-1">Budget and ward spending</p>
              <p>BBMP budget data and ward-level spending figures come from{" "}
              <a href="https://opencity.in" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">OpenCity.in</a> (CKAN open data portal)
              and BBMP&apos;s published budget documents. Years covered: 2018&ndash;23.</p>
            </div>
            <div className="rounded-lg bg-white/5 border border-white/10 p-4">
              <p className="text-white/70 font-medium mb-1">Grievances and Sakala</p>
              <p>Ward grievance counts are sourced from BBMP&apos;s grievance portal via{" "}
              <a href="https://opencity.in" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">OpenCity.in</a>, refreshed monthly.
              Sakala performance rankings (government service delivery timelines) come from
              the Karnataka Sakala portal, updated manually each month (the site blocks automated access).</p>
            </div>
            <div className="rounded-lg bg-white/5 border border-white/10 p-4">
              <p className="text-white/70 font-medium mb-1">Infrastructure & amenities</p>
              <p>Ward-level counts for hospitals, pharmacies, ATMs, metro stations, public toilets, and EV charging points
              are sourced from{" "}
              <a href="https://www.openstreetmap.org" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">OpenStreetMap</a> (OSM),
              cross-referenced with BBMP ward boundaries. Data reflects OSM contributor coverage and may be incomplete in some areas.</p>
            </div>
            <div className="rounded-lg bg-white/5 border border-white/10 p-4">
              <p className="text-white/70 font-medium mb-1">Road crashes</p>
              <p>Road accident data is sourced from NCRB (National Crime Records Bureau) and Karnataka state transport department records,
              aggregated to ward level. Data reflects reported accidents only.</p>
            </div>
            <div className="rounded-lg bg-white/5 border border-white/10 p-4">
              <p className="text-white/70 font-medium mb-1">Water quality</p>
              <p>Lake water quality data (good / moderate / poor) is sourced from Karnataka State Pollution Control Board (KSPCB)
              monitoring reports, mapped to the nearest ward.</p>
            </div>
            <div className="rounded-lg bg-white/5 border border-white/10 p-4">
              <p className="text-white/70 font-medium mb-1">Trade licences</p>
              <p>Ward-level trade licence counts are sourced from BBMP trade licence records via{" "}
              <a href="https://opencity.in" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">OpenCity.in</a>, refreshed monthly.</p>
            </div>
            <div className="rounded-lg bg-white/5 border border-white/10 p-4">
              <p className="text-white/70 font-medium mb-1">News and civic signals</p>
              <p>The CityPulse ticker shows recent news about BBMP, BWSSB, and Bengaluru civic issues
              from public RSS feeds (Citizen Matters, The News Minute, Deccan Herald).
              Articles are filtered for civic relevance &mdash; public money, road safety, environment,
              water, and elected representatives.</p>
            </div>
          </div>
        </Section>

        <Section title="The accountability score">
          <p>
            Each ward shows an accountability score from 0 to 100. This is a number, not a grade.
            It is based on a weighted average of available data points about the ward&apos;s MLA
            and BBMP contractors.
          </p>
          <div className="rounded-lg bg-white/5 border border-white/10 p-4 space-y-2">
            <p className="text-white/70 font-medium">What&apos;s included in the score</p>
            <ul className="list-disc list-inside space-y-1">
              <li><span className="text-white/70">MLA assembly attendance</span> &mdash; percentage of sessions attended (weight: high)</li>
              <li><span className="text-white/70">LAD fund utilisation</span> &mdash; % of constituency development funds spent (weight: high)</li>
              <li><span className="text-white/70">Criminal cases</span> &mdash; declared cases from election affidavits, inverted (weight: medium)</li>
              <li><span className="text-white/70">Contractor records</span> &mdash; official blacklisting on ward work orders per KPPP/BBMP records (weight: medium)</li>
            </ul>
          </div>
          <div className="rounded-lg bg-white/5 border border-white/10 p-4 space-y-2">
            <p className="text-white/70 font-medium">What&apos;s not included &mdash; and why</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Road or drainage quality &mdash; reliable ward-level delivery data is not publicly available</li>
              <li>Corporator performance &mdash; not yet available for all 243 wards</li>
              <li>Pothole counts &mdash; complaint counts reflect reporting behaviour, not road condition</li>
              <li>Any AI-generated or inferred data &mdash; we do not use AI to fill in gaps</li>
            </ul>
          </div>
          <p className="text-white/40 text-xs">
            The score reflects the data we have. A ward with missing data will show no score rather
            than a misleading one. As more official data becomes available, the score will expand to
            include it.
          </p>
        </Section>

        <Section title="What we don't do">
          <ul className="list-disc list-inside space-y-2">
            <li>We do not generate or infer data using AI</li>
            <li>We do not rank wards against each other (scores are absolute, not relative)</li>
            <li>We do not make editorial judgments about individuals or parties</li>
            <li>We do not accept payments from government bodies, contractors, or political parties</li>
            <li>We do not sell user data. Pin drops are anonymised.</li>
          </ul>
        </Section>

        <Section title="Data freshness">
          <p>Different datasets update at different intervals:</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-2 pr-4 text-white/40 font-medium">Dataset</th>
                  <th className="text-left py-2 text-white/40 font-medium">Refresh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
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
                    <td className="py-2 pr-4 text-white/50">{ds}</td>
                    <td className="py-2 text-white/30">{freq}</td>
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
            <a href="mailto:hello@kaun.city" className="text-blue-400 hover:underline">hello@kaun.city</a>
            {" "}or file an issue on{" "}
            <a href="https://github.com/kaun-city/kaun" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">GitHub</a>.
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
            <a href="mailto:hello@kaun.city" className="text-blue-400 hover:underline">hello@kaun.city</a> and we will prioritise correcting it.
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

        <div className="pt-6 border-t border-white/10 text-white/20 text-xs">
          <p>Kaun is open source (MIT licence). Data sources are public government records and open civic datasets.</p>
          <p className="mt-1">
            <Link href="/" className="hover:text-white/40 transition-colors">kaun.city</Link>
            {" "}&middot;{" "}
            <a href="https://github.com/kaun-city/kaun" target="_blank" rel="noopener noreferrer" className="hover:text-white/40 transition-colors">GitHub</a>
          </p>
        </div>

      </div>
    </div>
  )
}
