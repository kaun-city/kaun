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
    },
  },
  plugins: [],
}

export default config
