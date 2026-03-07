import type { Metadata } from "next"
import { Suspense } from "react"
import HomePage from "@/components/HomePage"

type Props = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams
  const wardNo   = typeof params.ward === "string" ? params.ward : undefined
  const reportId = typeof params.report === "string" ? params.report : undefined

  if (reportId) {
    // Dynamic OG for shared reports
    const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/ward_reports?id=eq.${reportId}&status=eq.approved&select=issue_type,ward_name,ai_label,ai_person,ai_party,description&limit=1`,
        { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` }, next: { revalidate: 60 } }
      )
      const rows = await res.json()
      const report = Array.isArray(rows) ? rows[0] : null
      if (report) {
        const desc = report.ai_label ?? report.description ?? report.issue_type
        const title = report.ai_person
          ? `${report.ai_person} (${report.ai_party ?? ""}) - ${desc}`
          : `${desc} in ${report.ward_name ?? "Bengaluru"}`
        return {
          title: `${title} | KAUN?`,
          description: desc,
          openGraph: {
            title,
            description: report.ai_label ?? `Civic issue reported via kaun.city`,
            images: [{ url: `https://kaun.city/api/report-og?id=${reportId}`, width: 1200, height: 630 }],
            type: "article",
          },
          twitter: {
            card: "summary_large_image",
            title,
            images: [`https://kaun.city/api/report-og?id=${reportId}`],
          },
        }
      }
    } catch { /* fall through to default */ }
  }

  if (wardNo) {
    // Dynamic OG for ward shares
    return {
      title: `Ward ${wardNo} | KAUN?`,
      openGraph: {
        title: `Ward ${wardNo} — Who is accountable?`,
        description: "Find your elected rep, ward spending, and what you can do about it.",
        images: [{ url: `https://kaun.city/api/og?ward_no=${wardNo}`, width: 1200, height: 630 }],
        type: "website",
      },
      twitter: {
        card: "summary_large_image",
        title: `Ward ${wardNo} — Who is accountable?`,
        images: [`https://kaun.city/api/og?ward_no=${wardNo}`],
      },
    }
  }

  // Default — no query params
  return {}
}

export default function Page() {
  return (
    <Suspense>
      <HomePage />
    </Suspense>
  )
}
