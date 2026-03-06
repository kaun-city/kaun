# KAUN?

**Pin a place. Know who's responsible.**

Civic accountability for Indian cities — drop a pin anywhere in Bengaluru and instantly see your elected representative, how they've voted with public funds, ward infrastructure data, and what you can do about it.

**[kaun.city](https://kaun.city)** — live for Bengaluru

---

## What It Does

Tap anywhere on the map (or hit "Find My Ward") and see:

| Tab | What you get |
|---|---|
| **Who** | Your MLA and corporator — party, criminal cases, asset growth, assembly attendance, LAD fund utilization. AI-generated ward brief. |
| **Spend** | BBMP budget breakdown for your constituency. LAD fund allocation vs actual spend. |
| **Citizen** | Traffic signals and BMTC bus stops in your ward vs city average. Pothole complaints on record. |
| **Reach** | RTI draft generator for 5 civic issues. BBMP, BTP, BWSSB, BESCOM, BMTC helplines. |

**Ask Kaun** — AI assistant that can answer questions about any of the 243 Bengaluru wards. Compare wards, find who has the worst attendance, ask what you can do about a problem.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15 + Leaflet.js + Tailwind CSS |
| Database | Supabase (PostgreSQL + PostGIS) |
| AI | OpenAI GPT-4o (Ask Kaun tools) + GPT-4o mini (ward story cache) |
| Hosting | Vercel (Edge runtime for OG images) |
| DNS / Protection | Cloudflare (Bot Fight Mode + WAF) |

No separate API server. Frontend talks directly to Supabase via PostgREST + RPC.

---

## Data Sources & Attribution

All data is sourced from public records and open datasets. We are grateful to the organisations that publish and maintain this data.

| Dataset | Source | Link |
|---|---|---|
| BBMP ward boundaries (243 wards) | datameet — Municipal Spatial Data | [github.com/datameet](https://github.com/datameet/Municipal_Spatial_Data/tree/master/Bangalore) |
| MLA affidavits (criminal cases, assets, net worth) | Election Commission of India via MyNeta | [myneta.info](https://www.myneta.info) |
| MLA LAD fund utilization | CIVIC Bengaluru via opencity.in | [opencity.in](https://opencity.in) |
| Ward committee meetings | opencity.in / BBMP | [opencity.in](https://opencity.in) |
| Rep report cards (attendance, questions asked) | CIVIC Bengaluru via opencity.in | [opencity.in](https://opencity.in) |
| BBMP Budget 2025-26 | opencity.in / BBMP | [opencity.in](https://opencity.in) |
| BMTC bus stops | opencity.in / BMTC | [opencity.in](https://opencity.in) |
| Pothole complaints | opencity.in / BBMP | [opencity.in](https://opencity.in) |
| BBMP work orders | opencity.in / BBMP | [opencity.in](https://opencity.in) |
| Traffic signals | OpenStreetMap contributors (Overpass API) | [openstreetmap.org](https://www.openstreetmap.org) |

**Key organisations:**
- [**datameet**](https://datameet.org) — civic data community that publishes and maintains open spatial datasets for Indian cities
- [**opencity.in**](https://opencity.in) — Open City Foundation's open data portal for Indian municipal data
- [**CIVIC Bengaluru**](https://civicbengaluru.org) — citizen platform that compiles and publishes elected rep performance data
- [**OpenStreetMap**](https://www.openstreetmap.org) — community-maintained map data used for infrastructure (signals, stops)
- [**Election Commission of India**](https://eci.gov.in) — source of all candidate affidavit data (criminal cases, assets)

> All elected representative data is self-declared in EC nomination affidavits and sourced from public records. Ward-level statistics reflect data available at the time of last update.

---

## Repo Structure

```
kaun/
├── apps/
│   └── web/                  # Next.js frontend
│       ├── app/              # Pages + API routes
│       │   ├── api/ask-kaun/ # GPT-4o tool-use AI assistant
│       │   ├── api/ward-story/ # GPT-4o mini narrative cache
│       │   ├── api/rti-draft/  # RTI letter generator
│       │   └── api/og/       # Dynamic ward OG images (edge)
│       ├── components/
│       │   ├── WardCard.tsx  # 4-tab ward card
│       │   ├── MapView.tsx   # Leaflet map
│       │   └── shared/       # AskKaunBar, RTIDraftSheet, WardStoryCard
│       └── lib/              # api.ts, types.ts, supabase.ts
└── .github/
    └── ISSUE_TEMPLATE/
        └── city-request.yml  # Request Kaun for your city
```

---

## Running Locally

```bash
git clone https://github.com/kaun-city/kaun
cd kaun/apps/web
cp .env.example .env.local
# Fill in:
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY
#   OPENAI_API_KEY
npm install
npm run dev
```

---

## Contributing

- **Request your city** — open an issue using the [City Request template](https://github.com/kaun-city/kaun/issues/new?template=city-request.yml&labels=city-request)
- **Add data** — fix ward stats, add missing corporator names, update budget figures
- **Build features** — pick an open issue labeled `good first issue`
- **Add a city** — city configs live in `apps/web/lib/cities/`; ward boundary GeoJSON + Supabase seed is all you need to get started

---

## Status

- [x] Leaflet map with 243 BBMP ward boundaries (PostGIS pin lookup)
- [x] Who tab — MLA/corporator with EC affidavit data (criminal cases, asset growth, attendance, LAD utilization)
- [x] Spend tab — BBMP budget 2025-26 by department
- [x] Citizen tab — traffic signals + BMTC bus stops vs city average
- [x] Reach tab — RTI draft generator (postal) + civic helplines
- [x] Ask Kaun — GPT-4o with live DB tools (rank, compare, find any of 243 wards)
- [x] AI ward brief — GPT-4o mini narrative, 7-day cache in Supabase
- [x] Share button — Web Share API + per-ward dynamic OG image
- [x] Find My Ward — geolocation with graceful denial handling
- [x] Out-of-Bengaluru detection — city request flow via GitHub issues
- [x] Cloudflare protection — Bot Fight Mode + WAF
- [ ] Ward percentile rankings ("bottom 15% for signals")
- [ ] More cities — open a request if you want yours
- [ ] Rate limiting on AI routes (Upstash)
- [ ] Test suite (Vitest + Playwright)

---

## License

MIT — see [LICENSE](LICENSE)

---

*Built with frustration, maintained with hope.*
