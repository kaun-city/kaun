/** How many of a corporation's latest KPPP tenders the ward card lists. */
export const CORPORATION_TENDERS_SHOWN = 3

/** "West" / "Bengaluru West City Corporation" -> "Bengaluru West City Corporation", the KPPP department name. */
export function corporationDepartment(corporation: string | null | undefined): string | null {
  const direction = corporation?.match(/\b(Central|North|South|East|West)\b/i)?.[1]
  if (!direction) return null
  return `Bengaluru ${direction[0].toUpperCase()}${direction.slice(1).toLowerCase()} City Corporation`
}

/** The total from a PostgREST Content-Range header ("0-2/628" -> 628), or the rows in hand when it is missing. */
export function tenderTotal(contentRange: string | null, fallback: number): number {
  const part = contentRange?.split("/")[1]
  const total = part ? Number(part) : Number.NaN
  return Number.isInteger(total) && total >= 0 ? total : fallback
}
