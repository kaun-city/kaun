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
    <div className="absolute bottom-44 sm:bottom-36 left-1/2 -translate-x-1/2 z-[900] pointer-events-auto">
      <div className="
        flex items-center gap-3 px-5 py-3 rounded-2xl
        bg-[#111]/90 backdrop-blur-md border border-red-500/20
        shadow-xl shadow-red-500/5
        w-[min(420px,90vw)]
      ">
        <div className="shrink-0 flex flex-col items-center justify-center w-16 h-14 rounded-xl bg-red-500/10">
          <span className="text-red-400 text-xl font-bold leading-none tabular-nums">
            {formatNumber(days)}
          </span>
          <span className="text-red-400/60 text-[9px] uppercase tracking-wider mt-0.5">days</span>
        </div>
        <div className="min-w-0">
          <p className="text-white/80 text-xs font-semibold leading-snug">
            No elected corporator in your ward
          </p>
          <p className="text-white/40 text-[10px] leading-snug mt-0.5">
            BBMP&apos;s last elected council dissolved Sept 2020. All 243 wards are run by unelected administrators.
          </p>
        </div>
      </div>
    </div>
  )
}
