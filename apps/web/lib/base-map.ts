const DEFAULT_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
const DEFAULT_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

export function resolveBaseMapConfig(config: {
  url?: string
  attribution?: string
  maxZoom?: string
} = {}) {
  const parsedMaxZoom = Number.parseInt(config.maxZoom ?? "", 10)
  return {
    url: config.url?.trim() || DEFAULT_TILE_URL,
    attribution: config.attribution?.trim() || DEFAULT_ATTRIBUTION,
    maxZoom: Number.isFinite(parsedMaxZoom) && parsedMaxZoom > 0 ? parsedMaxZoom : 19,
  }
}

const resolved = resolveBaseMapConfig({
  url: process.env.NEXT_PUBLIC_BASE_TILE_URL,
  attribution: process.env.NEXT_PUBLIC_BASE_TILE_ATTRIBUTION,
  maxZoom: process.env.NEXT_PUBLIC_BASE_TILE_MAX_ZOOM,
})

export const BASE_TILE_URL = resolved.url

export const BASE_TILE_OPTIONS = {
  attribution: resolved.attribution,
  maxZoom: resolved.maxZoom,
  className: "kaun-base-map-tiles",
}
