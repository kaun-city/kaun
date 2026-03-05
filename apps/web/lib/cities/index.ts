import { bengaluru } from "./bengaluru"
import type { CityConfig } from "./types"

export type { CityConfig, CityFeatures } from "./types"

/** All registered cities keyed by city_id */
const REGISTRY: Record<string, CityConfig> = {
  bengaluru,
}

/**
 * Resolve a city_id to its CityConfig.
 * Falls back to Bengaluru so existing data never breaks.
 */
export function getCity(cityId?: string | null): CityConfig {
  return REGISTRY[cityId ?? "bengaluru"] ?? bengaluru
}

export { bengaluru }
