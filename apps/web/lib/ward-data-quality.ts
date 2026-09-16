/**
 * Known limits of ward-keyed source tables, shared by every surface (ward
 * sheet, map layers, Ask Kaun, generated stories and letters) so no surface
 * presents a figure the others have withdrawn.
 */

/**
 * ward_spend_category, ward_potholes and ward_committee_meetings are keyed on
 * BBMP's 198-ward map (2010 delimitation). Kaun's ward references are
 * DataMeet-243 wards, and the two numberings name different places: only 4 of
 * 198 numbers match (243 #67 is Sanjaya Nagar; 198 #67 is Nagapura). Looking
 * these tables up by a 243 number shows another ward's spend, potholes and
 * meetings, so no surface uses them until a reviewed 198 -> 243 spatial
 * crosswalk exists. Flip this only with one.
 */
export const BBMP_198_RECORDS_ATTRIBUTABLE = false

/**
 * ward_infra_stats.bus_stop_count and daily_trips are inflated: bmtc_stops
 * holds ~14 duplicate rows per physical stop and the view's signal join
 * multiplies trips. Bus figures come from ward_bus_stops instead;
 * ward_infra_stats.signal_count is a DISTINCT count and stays usable.
 */
export const INFRA_BUS_COUNTS_RELIABLE = false
