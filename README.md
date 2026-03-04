# Kaun?

**Pin a place. Know who's responsible.**

Kaun is an open civic accountability platform. Drop a pin anywhere in a city — see the elected rep, active public works tenders, infrastructure facts, citizen complaint data, and government service delivery rankings.

Built for Bengaluru. Designed for every Indian city.

**[kaun.vercel.app](https://kaun.vercel.app)** — live for Bengaluru

---

## What It Shows

Drop a pin anywhere in Bengaluru and instantly see:

- **WHO** — MLA/MP with criminal cases, declared assets, asset growth since 2018
- **Expenses** — KPPP tenders active in the ward (count, total value, contractor, status)
- **Area** — Population, roads, lakes, parks, schools, bus stops; citizen complaint closure rates; Sakala service delivery rank
- **Report** — Agency helplines (BBMP, BWSSB, BESCOM, BMTC, BDA) + RTI generator (coming soon)

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 + Leaflet.js + Tailwind CSS |
| Database | Supabase (PostgreSQL + PostGIS) |
| Data pipelines | Node.js scripts + GitHub Actions crons |
| Hosting | Vercel (free tier) |

No separate API server. Frontend talks directly to Supabase via PostgREST + RPC functions.

---

## Data Sources

| Dataset | Source | Rows | Refresh |
|---|---|---|---|
| KPPP tenders | kppp.karnataka.gov.in | 1,446 | Weekly (Sun) |
| BBMP grievances | data.opencity.in | 334K complaints, 199 wards | Monthly |
| Sakala performance | sakala.kar.nic.in | 28 ACs | Monthly |
| Ward stats | data.opencity.in/BBMP | 198 wards | Static |
| BBMP work orders | data.opencity.in | 465 | Monthly |
| Elected reps | myneta.info | 28 MLAs + MPs | Election cycle |

---

## Repo Structure

```
kaun/
├── apps/
│   └── web/              # Next.js frontend
│       ├── app/          # Pages
│       ├── components/   # WardCard, MapView
│       └── lib/          # api.ts, types.ts, supabase.ts
├── scripts/              # Data refresh scrapers (Node.js)
│   ├── refresh-kppp.mjs
│   ├── refresh-sakala.mjs
│   ├── refresh-grievances.mjs
│   └── lib/db.mjs
├── cities/               # City configs (add your city here)
│   └── bengaluru/
├── data/                 # Seed data CSVs
├── docs/
│   ├── DATA_SOURCES.md
│   └── adding-a-city.md
└── .github/workflows/    # Scheduled cron jobs
```

---

## Running Locally

```bash
git clone https://github.com/kaun-city/kaun
cd kaun/apps/web
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev
```

---

## Contributing

We welcome all contributions:

- **Add your city** — see [docs/adding-a-city.md](docs/adding-a-city.md). No coding required for basic configs.
- **Improve data** — fix officer names, add tender sources, update ward boundaries
- **Build features** — pick an open issue labeled `good first issue`
- **Add a data source** — extend the scrapers in `scripts/`

Read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## Status

- [x] Next.js frontend — Leaflet map, ward overlay, 4-tab WardCard
- [x] Supabase backend — PostGIS pin lookup, ward profile RPC
- [x] KPPP tender data — 1,446 BBMP tenders, weekly refresh
- [x] Grievances data — 334K complaints across 199 wards (2024 + 2025)
- [x] Sakala rankings — 28 Bengaluru ACs, monthly refresh
- [x] Ward infrastructure stats — population, roads, lakes, schools
- [x] Elected reps — 28 MLAs with MyNeta affidavit data
- [x] Deployed at kaun.vercel.app
- [ ] RTI generator — pre-filled PDF application
- [ ] WhatsApp share cards — ward accountability OG image
- [ ] More cities — Delhi, Chennai, Mumbai configs
- [ ] Air quality data (CPCB/aqinow.org)
- [ ] BBMP ward boundary update (198 -> 243 wards)

---

## License

MIT — see [LICENSE](LICENSE)

---

*Built with frustration, maintained with hope.*
