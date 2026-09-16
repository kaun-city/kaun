// Type surface for the plain-.mjs canonical implementation (pulse-ingest.mjs).
// allowJs is false in this app, so the .mjs needs an explicit declaration.

export interface PulseSource {
  name?: string
  url?: string
}

export interface PulseFeedItem {
  title: string
  description: string
  link: string
  pubDate: string
  source: PulseSource | null
}

export interface PulseFact {
  category: string
  severity: "red" | "yellow"
  headline: string
  detail: string | null
  source_name: string
  source_url: string
}

export declare const CATEGORY_SEVERITY: Record<string, "red" | "yellow">
export declare const MIN_HEADLINE_LENGTH: number

export declare function decodeEntities(text: string): string
/** Remove emoji, their modifiers and the joiners that glued them; collapse whitespace. */
export declare function stripEmoji(text: string): string
/** Mathematical bold/italic letters (X's "fancy text") → plain letters. */
export declare function plainLetters(text: string): string
export declare function descriptionText(raw: string): string
export declare function hostOf(url: string | null | undefined): string
/** The publisher an item came from, never the search that found it. */
export declare function sourceName(item: { link: string; source?: PulseSource | null }): string
export declare function stripPublisherTag(title: string, source?: PulseSource | null): string
export declare function cleanHeadline(title: string, source?: PulseSource | null): string
/** The civic category for an item, or null when it is not a civic story. */
export declare function classifyPulse(title: string, description?: string): string | null
export declare function severityFor(category: string): "red" | "yellow"
export declare function parseRssItems(xml: string): PulseFeedItem[]
export interface PulseLabels extends Omit<PulseFact, "category" | "severity"> {
  category: string | null
  severity: "red" | "yellow" | null
}

type PulseItemInput = { title: string; description?: string; link: string; source?: PulseSource | null }

/** Every label for one feed item; category is null when it is not a civic story. */
export declare function labelPulseItem(item: PulseItemInput): PulseLabels
/** Label one feed item for ingestion, or say why it is skipped. */
export declare function buildPulseFact(
  item: PulseItemInput,
): { fact: PulseFact; skip?: undefined } | { skip: "no-link" | "search-page" | "not-civic" | "too-short"; fact?: undefined }
