import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "KAUN? — Know Who's Responsible",
  description: "Pin a place on the map. Find your elected rep, ward spending, RTI generator and more — civic accountability for India.",
  openGraph: {
    title: "KAUN? — Bengaluru Civic Accountability",
    description: "Pin a place on the map. Find out who your MLA is, how they voted, what was spent in your ward — and what you can do about it.",
    url: "https://kaun.city",
    siteName: "Kaun",
    images: [{ url: "https://kaun.city/opengraph-image", width: 1200, height: 630 }],
    type: "website",
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: "KAUN? — Know who is accountable for your ward",
    description: "Pin a place. Find your MLA, ward spending, RTI generator — civic accountability for Bengaluru.",
    images: ["https://kaun.city/opengraph-image"],
  },
  // PWA / home-screen
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Kaun?",
  },
}

/**
 * viewport-fit=cover is REQUIRED for env(safe-area-inset-*) to work on iPhone.
 * Without it, safe-area insets are always 0 and content hides behind the home bar.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Do NOT set maximumScale=1 — that breaks accessibility (pinch zoom)
  viewportFit: "cover",
  themeColor: "#0A0A0A",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
