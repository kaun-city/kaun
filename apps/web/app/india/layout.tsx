import type { Metadata } from "next"
import { FixtureBanner } from "@/components/india/FixtureBanner"

/**
 * Shell for the India layer. Sits inside the app's root layout, so fonts,
 * analytics and the dark base come from there unchanged — this only adds the
 * national-layer metadata and the preview-data banner that must appear on
 * every page of this surface.
 */
export const metadata: Metadata = {
  title: "KAUN? — India",
  description:
    "All 543 Lok Sabha constituencies: who holds the seat, what they declared, what they have spent, and which central projects in their state are over budget or behind schedule.",
  openGraph: {
    title: "KAUN? — India",
    description: "543 constituencies. Every MP's declared record and every delayed central project, from public sources.",
    siteName: "Kaun",
    type: "website",
    locale: "en_IN",
  },
}

export default function IndiaLayout({ children }: { children: React.ReactNode }) {
  /**
   * globals.css sets `overflow: hidden` on html/body, so every full-page route
   * in this app owns its own scroll container. The India layer does it once,
   * here: a fixed flex column with the banner pinned above a scrollable
   * region. Pages fill that region with `h-full` and choose whether they
   * scroll (object pages) or not (the map).
   */
  return (
    <div className="fixed inset-0 flex flex-col bg-[#0A0A0A] text-white">
      <FixtureBanner />
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  )
}
