/**
 * Known limits of ward-keyed source tables, shared by every surface (ward
 * sheet, map layers, Ask Kaun, generated stories and letters) so no surface
 * presents a figure the others have withdrawn.
 */

/**
 * ward_spend_category, ward_potholes and ward_committee_meetings are keyed on
 * BBMP's 198-ward map (2010 delimitation). Kaun's ward references are
 * DataMeet-243 wards, and the two numberings name different places: only 4 of
 * 198 numbers match (243 #67 is Sanjaya Nagar; 198 #67 is Nagapura), so these
 * tables are never looked up by a 243 or GBA ward number.
 *
 * They reach a ward only through the spatial BBMP-198 -> DataMeet-243
 * crosswalk (lib/bbmp198-crosswalk.ts, scripts/wardmap/build-bbmp198-crosswalk.mjs):
 * spend and pothole totals are allocated by legacy_share x bbmp198_share;
 * a ward committee's meeting count is never split or summed, only named under
 * wards it materially overlaps. Set this to false to withdraw all three
 * everywhere (ward sheet, map layers, Ask Kaun, stories, RTI letters) if the
 * crosswalk is ever found wrong.
 */
export const BBMP_198_RECORDS_ATTRIBUTABLE = true

/*
 * Bus stops and trips come only from ward_bus_stops (one row per physical
 * BMTC stop inside a DataMeet-243 ward), on every surface: ward sheet, Ask
 * Kaun, the public ward API and the CSV export. bmtc_stops used to hold ~14
 * rows per physical stop (one per nearby polling booth) and ward_infra_stats
 * joined signals and stops in one query, inflating bus_stop_count ~21x and
 * daily_trips ~240x. Migration 20260917_bmtc_stops_dedup.sql deduplicates the
 * table and rebuilds the view (asserting it equals ward_bus_stops); reading
 * ward_bus_stops keeps every surface right before and after it is applied.
 * ward_infra_stats.signal_count was always a DISTINCT count and stays in use.
 */
