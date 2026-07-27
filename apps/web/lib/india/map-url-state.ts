/**
 * map-url-state.ts — the national map's state, written into the query string.
 *
 * WHY THIS EXISTS
 * ---------------
 * The map is an entry point: you pan to a seat, paint a layer, open the seat's
 * page, read it, and come back. Everything the map knows used to live in
 * useState, so "come back" meant a blank map — the seat deselected, the
 * choropleth off, the state filter cleared. The round trip cost the visitor
 * every decision they had made.
 *
 * Putting that state in the URL fixes it for free in three ways at once: the
 * back button restores it because the history entry carries it, a reload keeps
 * it, and a copied address bar is now a shareable view of the map.
 *
 * WHY THE PARAMETER NAMES ARE WHAT THEY ARE — READ BEFORE RENAMING
 * ----------------------------------------------------------------
 * After the cutover (NEXT_PUBLIC_INDIA_ROOT=1) this map is served at "/" on
 * the root domain, and "/" on the root domain is also where the viral
 * Bengaluru deep links land. lib/host-routing.ts 308s a bare "/" to
 * bengaluru.kaun.city the moment it carries ANY of CITY_UI_PARAMS —
 * ward, report, city, layer.
 *
 * So "layer" — the obvious name for the choropleth, and the one the city map
 * already uses — is exactly the name that must not be used here: painting the
 * national map would have redirected the visitor to Bengaluru. It is "lyr".
 * The other two are "seat" and "st", neither of which the city UI claims.
 *
 * tests/india-map-url-state.test.mjs asserts the disjointness against the real
 * CITY_UI_PARAMS list and drives resolveSurface() with a fully populated map
 * URL in both cutover modes, so this can never silently regress.
 *
 * Pure functions only — no window, no next/navigation — so the node:test suite
 * can exercise every branch. The React side lives in components/india.
 */
import { INDIA_LAYERS, type IndiaLayerId } from "./layers.ts"
import { isPcCode } from "./pc-code.ts"

/** Selected seat, as a pc_code ("29-25"). */
export const MAP_PARAM_SEAT = "seat"
/** Active choropleth layer id. NOT "layer" — see the header. */
export const MAP_PARAM_LAYER = "lyr"
/** State filter, as an st_code ("29"). */
export const MAP_PARAM_STATE = "st"

/** Every parameter this module owns, in the order it writes them. */
export const MAP_STATE_PARAMS = [MAP_PARAM_SEAT, MAP_PARAM_LAYER, MAP_PARAM_STATE] as const

export interface MapUrlState {
  /** pc_code of the selected seat, or null. */
  seat: string | null
  layer: IndiaLayerId | null
  /** st_code of the filtered state, or null for all of India. */
  stateFilter: number | null
}

export const EMPTY_MAP_URL_STATE: MapUrlState = { seat: null, layer: null, stateFilter: null }

function params(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
}

/**
 * Read map state out of a query string.
 *
 * Every value is validated, because these arrive from the address bar and from
 * links other people wrote. An unrecognised layer id, a malformed pc_code or a
 * non-numeric state code is dropped rather than carried into the UI: the map
 * opens in its default state instead of half-broken.
 */
export function decodeMapState(search: string): MapUrlState {
  const p = params(search)

  const rawSeat = p.get(MAP_PARAM_SEAT)
  const seat = rawSeat && isPcCode(rawSeat) ? rawSeat : null

  const rawLayer = p.get(MAP_PARAM_LAYER)
  const layer = INDIA_LAYERS.find(l => l.id === rawLayer)?.id ?? null

  const rawState = p.get(MAP_PARAM_STATE)
  const stateFilter = rawState && /^[1-9]\d*$/.test(rawState) ? Number(rawState) : null

  return { seat, layer, stateFilter }
}

/**
 * Write map state into a query string, preserving anything this module does
 * not own (`?host=` in dev, campaign tags on a shared link, …).
 *
 * Returns "" — not "?" — when nothing is set, so a default map has a clean URL
 * and `pathname + encodeMapState(...)` is always a valid address.
 */
export function encodeMapState(state: MapUrlState, existingSearch = ""): string {
  const p = params(existingSearch)
  for (const key of MAP_STATE_PARAMS) p.delete(key)

  if (state.seat) p.set(MAP_PARAM_SEAT, state.seat)
  if (state.layer) p.set(MAP_PARAM_LAYER, state.layer)
  if (state.stateFilter !== null && state.stateFilter !== undefined) {
    p.set(MAP_PARAM_STATE, String(state.stateFilter))
  }

  const s = p.toString()
  return s ? `?${s}` : ""
}

/**
 * The map's address with one seat pre-selected.
 *
 * Used for the seat page's "Map" control when there is no history to go back
 * to — someone who opened a shared link. Without the seat they would land on
 * an unfocused national map and have to find the constituency they were just
 * reading about; with it, the map opens on that seat.
 *
 * `base` is whatever indiaHref("/") returns in the current cutover mode, so
 * this never has to know which mode it is in.
 */
export function mapHrefForSeat(base: string, seat: string | null): string {
  if (!seat || !isPcCode(seat)) return base
  return `${base}${encodeMapState({ ...EMPTY_MAP_URL_STATE, seat })}`
}
