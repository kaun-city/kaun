/**
 * Signal on Paper — the single source of Kaun's colours.
 *
 * Tailwind reads these (tailwind.config.ts), and code that cannot use classes
 * (Leaflet markers, OG images, icons) imports them directly. globals.css
 * mirrors them as CSS variables; tests/signal-on-paper-guard.test.mjs keeps
 * the three in step and blocks the old dark theme from returning.
 *
 * Contrast on paper (#F8F5EF), canvas (#F2EDE4) and muted (#EFE9DE):
 *   ink ≥ 60% opacity for any text (4.6:1+); 50% is the floor for icons,
 *   placeholders and hairline controls. accent ≥ 4.68:1, danger ≥ 5.6:1.
 */
export const PAPER = {
  /** Cards, sheets, headers. */
  DEFAULT: "#F8F5EF",
  /** Inputs and raised fields. */
  bright: "#FFFDF8",
  /** Nested panels, table stripes, quiet callouts. */
  muted: "#EFE9DE",
  /** Page and map ground. */
  canvas: "#F2EDE4",
  /** Backdrop behind framed records. No text on this tone. */
  stage: "#E5DFD3",
} as const

/** The one ink. Hierarchy is opacity, not extra greys. */
export const INK = "#16130E"

/** Burnt saffron: wordmark "?", primary links, active marks, map pins. */
export const ACCENT = "#A64E00"

export const DANGER = "#B42318"
export const SUCCESS = "#24643C"
export const WARNING = "#754500"
export const INFO = "#255C86"

export const COLORS = {
  paper: PAPER,
  ink: INK,
  accent: ACCENT,
  danger: DANGER,
  success: SUCCESS,
  warning: WARNING,
  info: INFO,
} as const
