# Kaun Web

Next.js frontend for [Kaun](https://kaun.city) — the civic accountability platform for Indian cities.

## Stack

- **Next.js 15** (App Router, TypeScript)
- **Leaflet.js** — open source maps, no API key required
- **Stadia Maps** — dark map tiles, free for development
- **Tailwind CSS** — utility-first styling

## Getting Started

### Prerequisites

- Node.js 20+
- Kaun API running locally (see `apps/api/README.md`)

### 1. Install dependencies

```bash
cd apps/web
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
# NEXT_PUBLIC_API_URL defaults to http://localhost:8000
```

### 3. Run

```bash
npm run dev
```

App is live at `http://localhost:3000`.

## How It Works

1. Full-screen Leaflet map loads Bengaluru ward boundaries (GeoJSON from datameet)
2. Tap/click anywhere to drop a pin
3. The pin calls the backend `/pin` endpoint with the coordinates
4. Ward name, zone, and responsible agency helplines appear in the bottom card
5. If the backend is offline, the map still works (ward name from GeoJSON properties)

## Key Files

| File | Purpose |
|------|---------|
| `app/page.tsx` | Root page — composes map + ward card |
| `components/MapView.tsx` | Leaflet map (dynamic, no SSR) |
| `components/WardCard.tsx` | Slide-up info panel |
| `lib/api.ts` | Backend API client |
| `lib/types.ts` | Shared TypeScript types |

## Production

The frontend deploys to Cloudflare Pages (free).
Set `NEXT_PUBLIC_API_URL` to your Fly.io API URL in the Cloudflare Pages dashboard.
