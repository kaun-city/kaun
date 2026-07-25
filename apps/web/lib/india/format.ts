/**
 * Formatting helpers for the India layer.
 *
 * Pure functions only — imported by server components, client components and
 * the node:test suite (via --experimental-strip-types), same rule as
 * lib/map-layers.ts. No React, no Leaflet, no Supabase.
 *
 * Two money units exist on purpose (see lib/india/types.ts): affidavit and
 * MPLADS amounts are whole rupees, MoSPI project costs are crore. Each has its
 * own formatter so a caller cannot pass one to the other by accident.
 */

/** Indian digit grouping: 1,23,45,678. */
export function groupIndian(n: number): string {
  return Math.round(n).toLocaleString("en-IN")
}

/**
 * Whole rupees -> the largest unit that keeps it readable.
 *   410300000 -> "₹41.03 Cr"      4103000 -> "₹41.03 L"      4103 -> "₹4,103"
 * Returns "—" for null so a missing value never renders as ₹0.
 */
export function formatRupees(inr: number | null | undefined): string {
  if (inr === null || inr === undefined || !Number.isFinite(inr)) return "—"
  const abs = Math.abs(inr)
  if (abs >= 1e7) return `₹${(inr / 1e7).toFixed(2)} Cr`
  if (abs >= 1e5) return `₹${(inr / 1e5).toFixed(2)} L`
  return `₹${groupIndian(inr)}`
}

/**
 * Crore -> display. MoSPI's own unit, so no conversion; only grouping and a
 * lakh-crore step for the handful of projects above ₹1,00,000 Cr.
 *   30695.1 -> "₹30,695 Cr"      4.5 -> "₹4.5 Cr"
 */
export function formatCrore(cr: number | null | undefined): string {
  if (cr === null || cr === undefined || !Number.isFinite(cr)) return "—"
  const abs = Math.abs(cr)
  if (abs >= 1e5) return `₹${(cr / 1e5).toFixed(2)} L Cr`
  if (abs >= 100) return `₹${groupIndian(cr)} Cr`
  return `₹${cr.toFixed(2)} Cr`
}

/** Signed crore, for overruns: "+₹4,290 Cr" / "−₹12 Cr" / "no change". */
export function formatCroreDelta(cr: number | null | undefined): string {
  if (cr === null || cr === undefined || !Number.isFinite(cr)) return "—"
  if (cr === 0) return "no change"
  return `${cr > 0 ? "+" : "−"}${formatCrore(Math.abs(cr))}`
}

/** Percent with one decimal, or "—". Never rounds a null to 0. */
export function formatPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—"
  return `${v.toFixed(digits)}%`
}

/** A schema date ("2026-05-01") or MoSPI month -> "May 2026". */
export function formatMonth(iso: string | null | undefined): string {
  if (!iso) return "—"
  const m = /^(\d{4})-(\d{2})/.exec(iso)
  if (!m) return iso
  const month = Number(m[2])
  if (month < 1 || month > 12) return iso
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${MONTHS[month - 1]} ${m[1]}`
}

/**
 * Whole months between two schema dates, b - a. Used for schedule slip and
 * "months since last change". Returns null if either side is missing — the
 * caller must render that as "not recorded", not as 0.
 */
export function monthsBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null
  const pa = /^(\d{4})-(\d{2})/.exec(a)
  const pb = /^(\d{4})-(\d{2})/.exec(b)
  if (!pa || !pb) return null
  return (Number(pb[1]) - Number(pa[1])) * 12 + (Number(pb[2]) - Number(pa[2]))
}

/**
 * Slip in months -> plain English. Negative means the revised date is EARLIER
 * than the original, which does happen in MoSPI's data and must not be
 * silently shown as a delay.
 */
export function formatSlip(months: number | null | undefined): string {
  if (months === null || months === undefined || !Number.isFinite(months)) return "—"
  if (months === 0) return "on original schedule"
  const abs = Math.abs(months)
  const unit = abs === 1 ? "month" : "months"
  return months > 0 ? `${abs} ${unit} later` : `${abs} ${unit} earlier`
}
