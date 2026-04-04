import type { Metadata } from "next"
import { Suspense } from "react"
import { notFound } from "next/navigation"
import HomePage from "@/components/HomePage"
import { getCity } from "@/lib/cities"

const SUPPORTED_CITIES = ["hyd"]

const CITY_SLUG_MAP: Record<string, string> = {
  hyd: "hyderabad",
}

type Props = {
  params: Promise<{ city: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city: slug } = await params
  const cityId = CITY_SLUG_MAP[slug]
  if (!cityId) return {}
  const city = getCity(cityId)
  return {
    title: `KAUN? - ${city.name} Civic Accountability`,
    description: `Pin a place in ${city.name}. Find your MLA, ward spending, and civic data.`,
  }
}

export function generateStaticParams() {
  return SUPPORTED_CITIES.map((city) => ({ city }))
}

export default async function CityPage({ params, searchParams }: Props) {
  const { city: slug } = await params
  const cityId = CITY_SLUG_MAP[slug]

  // Only serve supported city slugs
  if (!cityId) notFound()

  const sp = await searchParams
  const wardParam = typeof sp.ward === "string" ? sp.ward : undefined

  return (
    <Suspense>
      <HomePage cityId={cityId} initialWard={wardParam} />
    </Suspense>
  )
}
