/**
 * seats.ts — "is this a seat that exists?", answered from nothing but the URL.
 *
 * WHY THIS IS NOT A DATABASE CALL
 * -------------------------------
 * /c/<seat> has a loading.tsx, which puts the page inside a Suspense boundary.
 * Next flushes the shell — status line and headers included — before the
 * suspended body runs, so a notFound() thrown by the page arrives after the
 * 200 has already gone out and the response is a soft 404: the not-found body
 * under an HTTP 200. Crawlers index that, and anything reading Kaun
 * programmatically is told a seat exists when it does not.
 *
 * The fix is to answer above the boundary, in layout.tsx. That only works if
 * the check is free — a query there would delay the shell and defeat the
 * skeleton the boundary exists for. It is free here because the answer is
 * static: there are 543 Lok Sabha seats, the set changes once a delimitation,
 * and it is committed at data/pc-crosswalk/india_pc_crosswalk.csv.
 *
 * SHAPE IS NOT ENOUGH, WHICH IS THE WHOLE POINT.
 * isPcCode() in pc-code.ts says "29-25" is well formed. It also says "99-999"
 * is, and that is exactly the URL this module exists to reject.
 */
import { PC_CODES } from "./generated/pc-codes.ts"

const SEATS = new Set<string>(PC_CODES)

/** The 543 seat keys, sorted by (st_code, pc_no). */
export { PC_CODES }

/**
 * True only for one of the 543 real seats. Malformed input, leading zeros and
 * a well-formed key for a seat that does not exist all return false.
 */
export function isKnownSeat(pcCode: string | null | undefined): boolean {
  return SEATS.has(String(pcCode ?? ""))
}
