import type { Metadata } from "next"
import { FixtureBanner } from "@/components/india/FixtureBanner"

/**
 * Shell for the India layer. Sits inside the app's root layout, so fonts,
 * analytics and the dark base come from there unchanged — this only adds the
 * national-layer metadata and the preview-data banner that must appear on
 * every page of this surface.
 */
const OG_DESCRIPTION =
  "543 constituencies. Every MP's declared record and every delayed central project, from public sources."

export const metadata: Metadata = {
  /**
   * Canonical home of the national layer, in both modes.
   *
   * Pre-cutover the India pages live at kaun.city/india/*; post-cutover they
   * are kaun.city/* . Either way the host is kaun.city — never a city
   * subdomain, never a preview URL — so every relative OG image and canonical
   * this subtree emits resolves to the address a share is supposed to point
   * at. Without it Next emits relative image paths, which LinkedIn and
   * WhatsApp will not follow, and the unfurl silently loses its picture.
   */
  metadataBase: new URL("https://kaun.city"),
  title: "KAUN? — India",
  description:
    "All 543 Lok Sabha constituencies: who holds the seat, what they declared, what they have spent, and which central projects in their state are over budget or behind schedule.",
  openGraph: {
    title: "KAUN? — India",
    description: OG_DESCRIPTION,
    siteName: "Kaun",
    type: "website",
    locale: "en_IN",
  },
  /**
   * Twitter needs its own card type or the image renders as a thumbnail strip.
   * The images themselves come from the opengraph-image.tsx files in each
   * segment — Next fills both openGraph.images and twitter.images from those,
   * so they are deliberately not restated here.
   */
  twitter: {
    card: "summary_large_image",
    title: "KAUN? — India",
    description: OG_DESCRIPTION,
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
