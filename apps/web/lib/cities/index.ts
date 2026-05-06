import { bengaluru } from "./bengaluru"
import { visakhapatnam } from "./visakhapatnam"
import type { CityConfig } from "./types"

export type { CityConfig, CityFeatures, CityTone } from "./types"

/** All registered cities keyed by city_id */
const REGISTRY: Record<string, CityConfig> = {
  bengaluru,
  visakhapatnam,
}

/**
 * Resolve a city_id to its CityConfig.
 * Falls back to Bengaluru so existing data never breaks.
 */
export function getCity(cityId?: string | null): CityConfig {
  return REGISTRY[cityId ?? "bengaluru"] ?? bengaluru
}

/**
 * List all registered cities — used for landing/expansion pages.
 */
export function allCities(): CityConfig[] {
  return Object.values(REGISTRY)
}

export { bengaluru, visakhapatnam }
