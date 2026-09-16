import type { Config } from "tailwindcss"
import { COLORS } from "./lib/design-tokens"

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      // Signal on Paper tokens only (lib/design-tokens.ts). Use bg-paper,
      // text-ink/80, border-ink/15, text-accent, bg-danger, etc.
      colors: COLORS,
      fontFamily: {
        mono: ["var(--font-plex-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      animation: {
        "slide-up": "slide-up 0.25s ease-out forwards",
      },
      // Viewport-relative units for mobile browser chrome awareness
      // svh = small viewport height (visible when browser chrome is showing)
      // dvh = dynamic viewport height (updates as chrome shows/hides)
      // These complement Tailwind 3.4's built-in h-dvh/min-h-dvh/max-h-dvh
      minHeight: {
        "48svh": "48svh",
      },
      maxHeight: {
        "88svh": "88svh",
      },
      height: {
        "dvh": "100dvh",
      },
    },
  },
  plugins: [],
}

export default config
