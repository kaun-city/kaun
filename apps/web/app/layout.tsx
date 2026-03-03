import type { Metadata } from "next"
import { Inter } from "next/font/google"
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
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
