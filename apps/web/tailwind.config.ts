import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        saffron: "#FF9933",
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
