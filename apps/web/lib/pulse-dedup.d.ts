// Type surface for the plain-.mjs canonical implementation (pulse-dedup.mjs).
// allowJs is false in this app, so the .mjs needs an explicit declaration.

export declare const SIGNATURE_TOKENS: number
export declare const MIN_SIGNIFICANT_TOKENS: number
export declare const STOPWORDS: Set<string>

/** Derive the stable, non-empty CityPulse dedup key for a headline. */
export declare function dedupKey(headline: string): string
