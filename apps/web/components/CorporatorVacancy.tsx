"use client"

import { useState, useEffect } from "react"

const VACANCY_START = new Date("2020-09-10T00:00:00+05:30")

function daysSince(start: Date): number {
  return Math.floor((Date.now() - start.getTime()) / 86_400_000)
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-IN")
}

interface Props {
  cityId: string
}

/**
 * CorporatorVacancy — a full-width banner above the map (below CityPulse)
 * showing the number of days Bengaluru's wards have had no elected corporator.
 *
 * BBMP's last elected council dissolved on 10 September 2020. GBA elections
 * have been announced but not held. This is the single most important
 * accountability stat for the city and it ticks up every day.
 *
 * Only renders for Bengaluru; other cities return null.
 *
 * The width is explicit, not a max-width: this box is absolutely positioned at
 * left-1/2, so shrink-to-fit sizing offers it only the right half of the map —
 * about 187px on a 375px phone, which squeezed the sentence into a four-line
 * ribbon. An explicit width opts out of shrink-to-fit, and -translate-x-1/2
 * still centres it.
 *
 * At full width the card also reached under the "New ward?" pill, which is
 * 16px into its bottom edge on a phone, so below sm it sits a notch higher.
 */
export function CorporatorVacancy({ cityId }: Props) {
  const [days, setDays] = useState(() => daysSince(VACANCY_START))

  useEffect(() => {
    const t = setInterval(() => setDays(daysSince(VACANCY_START)), 60_000)
    return () => clearInterval(t)
  }, [])

  if (cityId !== "bengaluru") return null

  return (
    <div className="absolute bottom-[10.5rem] sm:bottom-40 left-1/2 -translate-x-1/2 z-[900] pointer-events-auto">
      <div className="flex items-stretch w-[min(360px,calc(100vw-2rem))] sm:w-[min(420px,90vw)] border border-ink/55 bg-paper">
        <div className="shrink-0 flex flex-col items-center justify-center min-w-[4.5rem] px-2 border-r border-ink/20">
          <span className="font-mono text-lg sm:text-xl font-semibold leading-none tabular-nums text-danger">
            {formatNumber(days)}
          </span>
          <span className="mt-1 font-mono text-[11px] uppercase tracking-[0.1em] text-ink/60">days</span>
        </div>
        <div className="min-w-0 px-3 py-2">
          <p className="text-[13px] font-semibold leading-snug text-ink">
            No elected corporator in your ward
          </p>
          <p className="sm:hidden mt-0.5 text-xs leading-snug text-ink/60">
            Council dissolved Sept 2020
          </p>
          <p className="hidden sm:block mt-0.5 text-xs leading-snug text-ink/60">
            BBMP&apos;s last elected council dissolved Sept 2020. Bengaluru&apos;s ward areas are run by unelected administrators.
          </p>
        </div>
      </div>
    </div>
  )
}
