/**
 * map-view-store.ts — the two things about the national map that belong to a
 * browser tab rather than to a URL.
 *
 * 1. THE VIEWPORT. Where the visitor had panned and zoomed to. This is not in
 *    the query string on purpose: a centre/zoom pair is four noisy numbers that
 *    would dominate every shared link, and unlike the seat, the layer and the
 *    state filter it is not a decision worth sharing — it is a scroll position.
 *    sessionStorage is the right shape for it: per tab, gone when the tab is.
 *
 * 2. WHETHER THE MAP HAS BEEN OPEN IN THIS TAB. The seat page's back control
 *    needs to know whether history.back() leads somewhere. history.length is
 *    useless for that (a fresh tab that has visited three other sites has a
 *    length of four), and document.referrer does not change across a soft
 *    navigation. A marker the map itself sets when it mounts answers the actual
 *    question — "did this visitor come through the map?" — and answers it
 *    per tab, so a shared link opened in a new tab correctly reports "no".
 *
 * Every function is a no-op that returns a safe default when there is no
 * window, or when sessionStorage throws (Safari private mode, embedded
 * webviews, storage disabled). None of this is load-bearing enough to be worth
 * a single broken render.
 */

const VIEW_KEY = "kaun.india.map.view"
const SESSION_KEY = "kaun.india.map.seen"

export interface MapView {
  /** Leaflet order: [lat, lng]. */
  center: [number, number]
  zoom: number
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/** The viewport this tab last left the map at, or null. */
export function readMapView(): MapView | null {
  const s = storage()
  if (!s) return null
  try {
    const raw = s.getItem(VIEW_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<MapView>
    const c = v.center
    if (!Array.isArray(c) || c.length !== 2) return null
    const [lat, lng] = c
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(v.zoom)) return null
    return { center: [lat as number, lng as number], zoom: v.zoom as number }
  } catch {
    return null
  }
}

export function saveMapView(view: MapView): void {
  const s = storage()
  if (!s) return
  try {
    s.setItem(VIEW_KEY, JSON.stringify(view))
  } catch {
    /* quota or disabled storage — the map just opens where it always did */
  }
}

/** Called by the map when it mounts. */
export function markMapSeen(): void {
  const s = storage()
  if (!s) return
  try {
    s.setItem(SESSION_KEY, "1")
  } catch {
    /* the back control falls back to a plain navigation, which always works */
  }
}

/** Has the national map been open in this tab? */
export function hasSeenMap(): boolean {
  const s = storage()
  if (!s) return false
  try {
    return s.getItem(SESSION_KEY) === "1"
  } catch {
    return false
  }
}
