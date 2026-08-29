/**
 * Tables that are still Bengaluru-only in the live Supabase schema.
 *
 * Do not send city_id to these tables for Bengaluru: PostgREST rejects the
 * request because the column does not exist. Other cities remain scoped so a
 * new city cannot silently read Bengaluru rows. Remove entries as the schema
 * migrations add city_id to each table or view.
 */
export const BENGALURU_LEGACY_UNSCOPED_TABLES = new Set([
  "civic_signals",
  "ward_infra_stats",
  "ward_potholes",
  "ward_reports",
  "ward_spend_category",
])

export function wardQueryScope(
  table: string,
  wardNo: number,
  cityId: string,
): Record<string, string> {
  return {
    ward_no: `eq.${wardNo}`,
    ...(cityId === "bengaluru" && BENGALURU_LEGACY_UNSCOPED_TABLES.has(table)
      ? {}
      : { city_id: `eq.${cityId}` }),
  }
}
