import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Kaun?",
  description: "Pin a place. Know who's responsible. Civic accountability for Indian cities.",
  openGraph: {
    title: "Kaun?",
    description: "Pin a place. Know who's responsible.",
    url: "https://kaun.city",
    siteName: "Kaun",
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
