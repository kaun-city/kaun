# KAUN?

**Pin a place. Know who's responsible.**

Civic accountability for Indian cities — drop a pin anywhere in Bengaluru and instantly see your elected representative, who gets the contracts, how public money is spent, and what you can do about it.

**[kaun.city](https://kaun.city)** — live for Bengaluru (243 wards). Open source. City-agnostic architecture.

**[data.kaun.city](https://data.kaun.city)** — the civic data commons that powers kaun.city. Every source, methodology, and dataset used by the platform is documented here with citations, so anyone (journalists, researchers, citizens, other civic tech builders) can verify, reuse, or challenge the data.

---

## What You See

### Before dropping a pin

**City Pulse** — a rotating ticker of verified civic facts sourced from Deccan Herald, The News Minute, Citizen Matters, and CPCB/NCRB data. Auto-refreshed daily via RSS classification. No interaction needed — the city's accountability picture is on the face.

### After dropping a pin

**Ward Grade (A-F)** appears in the card header — a composite score from MLA attendance, LAD fund utilization, criminal cases, ward committee meetings, infrastructure gaps, and flagged contractors. Visible at a glance, no scrolling.

**Ward Headline** — the single most alarming finding for your ward, shown as a red/yellow alert above the tabs.

| Tab | What you get |
|---|---|
| **Who** | Your MLA and corporator — party, criminal cases, asset growth, assembly attendance, LAD fund utilization. Ward committee meeting count. GBA corporation contacts. Community-submitted facts. RTI draft generator. |
| **Spend** | BBMP budget breakdown by department. Ward-level spending by category (roads, drainage, water, waste). Work orders with contractor names. **Contractor profiles** — total value, ward spread, deduction rate, blacklist flags. Property tax collections. Trade licenses. |
| **Citizen** | Demographics, infrastructure (road length, streetlights, schools, police/fire stations, clinics). Traffic signals + bus stops vs city average. Neighbourhood amenities (hospitals, pharmacies, ATMs, public toilets, EV charging, metro stations — from OSM). Water body health (pH, BOD, DO, coliform — from KSPCB). Road crashes. Air quality. Pothole complaints. Civic reports. Reddit community buzz. |
| **Reach** | Civic agency helplines (GBA, BWSSB, BESCOM, BTP, BDA). Local offices (BESCOM division, police station, SRO). RTI draft generator for 5 civic issues. Service delivery performance (Sakala). Grievance trends. |

**Ask Kaun** — AI assistant (GPT-4o with tool use) that can answer questions about any of the 243 wards. Compare wards, find who has the worst attendance, look up contractors, check if someone is blacklisted.

---

## Contractor Accountability

The platform includes an investigative-grade contractor intelligence layer:

- **Entity resolution** — contractor names in BBMP work orders have phone numbers embedded. Same phone, different company names = same entity. Grouped by phone to collapse aliases.
- **Blacklist cross-referencing** — every contractor profile is checked against GeM suspended sellers, World Bank debarment (via OpenSanctions), CPPP national debarment list, KPCL Karnataka blacklisted firms, and documented BBMP cases.
- **AI tools** — Ask Kaun can search contractors by name, show top contractors by value/contracts/deduction rate, and list who operates in any ward.

---

## Data Sources & Attribution

All data is sourced from public records and open datasets.

| Dataset | Source |
|---|---|
| Ward boundaries (243 wards, PostGIS) | [datameet](https://github.com/datameet/Municipal_Spatial_Data/tree/master/Bangalore) |
| MLA affidavits (criminal cases, assets) | Election Commission via [MyNeta](https://www.myneta.info) |
| MLA performance (attendance, LAD, questions) | CIVIC Bengaluru via [opencity.in](https://opencity.in) |
| BBMP budget, work orders, grievances | [opencity.in](https://opencity.in) / BBMP |
| Tenders across BBMP, BWSSB, BDA, BESCOM | [KPPP](https://kppp.karnataka.gov.in) (Karnataka Public Procurement Portal) |
| Ward amenities (hospitals, ATMs, toilets, etc.) | [OpenStreetMap](https://www.openstreetmap.org) via Overpass API |
| Water body quality (pH, BOD, DO, coliform) | KSPCB / CPCB |
| Traffic signals | OpenStreetMap via Overpass API |
| Bus stops + routes | BMTC via opencity.in |
| Road crashes | Bengaluru Traffic Police |
| Air quality | KSPCB / CPCB |
| Contractor blacklists | GeM, World Bank/OpenSanctions, CPPP, KPCL |
| Civic news (City Pulse) | Deccan Herald, The News Minute, Citizen Matters, India Today RSS |

**Key organisations:** [datameet](https://datameet.org), [opencity.in](https://opencity.in), [CIVIC Bengaluru](https://civicbengaluru.org), [OpenStreetMap](https://www.openstreetmap.org), [ADR/MyNeta](https://adrindia.org)

> All elected representative data is self-declared in EC nomination affidavits. Contractor data is from BBMP work orders (public records). Ward statistics reflect data available at time of last update.

---

## Architecture

| Layer | Tech |
|---|---|
| Frontend — kaun.city | Next.js 15 + Leaflet.js + Tailwind CSS, hosted on Vercel |
| Wiki — data.kaun.city | MkDocs Material, hosted on GitHub Pages |
| Public JSON APIs | Next.js route handlers under `apps/web/app/api/data/*`, CORS-open, 1-hour cache |
| Database | Supabase (PostgreSQL + PostGIS) |
| AI | OpenAI GPT-4o (Ask Kaun tools) |
| DNS / Protection | Cloudflare (Bot Fight Mode + WAF) |
| Monitoring | [kaun.city/status](https://kaun.city/status) |

No separate API server. The Next.js app talks directly to Supabase via PostgREST + RPC. The wiki is a static site built from `wiki/` and deployed on push to `master`.

### Data Pipeline

Each government portal has one adapter. Every adapter writes to Supabase in a normalized shape, so adding a new source is one new file — no changes to the frontend, APIs, or wiki.

```
scripts/
├── adapters/                    # One file per portal
│   └── kppp.mjs                 # KPPP tenders (BBMP, BWSSB, BDA, BESCOM)
├── lib/
│   └── db.mjs                   # Shared Supabase helpers
├── seed-boundaries.mjs          # Ward GeoJSON → PostGIS
├── seed-work-orders-full.mjs    # BBMP work orders + contractor profiles
├── seed-osm-amenities.mjs       # 15 amenity categories from OpenStreetMap
├── seed-water-quality.mjs       # Lake water quality from KSPCB
├── seed-mla-contacts.mjs        # MLA contact info from MyNeta
├── seed-mla-lad-funds.mjs       # LAD fund data from opencity.in
├── seed-kgis-ward-data.mjs      # Trees, clinics, waste centres from KGIS
├── scrape-blacklists.mjs        # Cross-ref contractors against debarment lists
├── refresh-grievances.mjs       # BBMP complaints from opencity.in
├── refresh-city-pulse.mjs       # Civic news from RSS feeds
├── refresh-sakala-browser.mjs   # Sakala service delivery (local Playwright — site blocks cloud IPs)
└── refresh-trade-licenses.mjs   # Trade licence stats
```

### Scheduled Refreshes

| Schedule | Job | Runs on | Purpose |
|---|---|---|---|
| Daily 02:00 UTC | `/api/ingest-signals` | Vercel cron | RSS + Twitter-via-Google-News civic signal ingestion |
| Daily 06:00 UTC | `refresh-pulse` | GitHub Actions | Civic news classification for City Pulse ticker |
| Sundays 01:00 UTC | `refresh-kppp` | GitHub Actions | KPPP tenders across BBMP / BWSSB / BDA / BESCOM |
| 2nd of month | `refresh-grievances` | GitHub Actions | BBMP grievance counts |
| 3rd of month | `refresh-trade-licenses` | GitHub Actions | Trade licence stats |
| 1st of month (manual) | `refresh-sakala` | Local Playwright | Sakala service delivery (cloud-blocked) |
| On push to `master` | `deploy-wiki` | GitHub Actions | Build MkDocs and deploy data.kaun.city |

---

## Running Locally

```bash
git clone https://github.com/kaun-city/kaun
cd kaun/apps/web
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, OPENAI_API_KEY
npm install
npm run dev
```

---

## Adding a City

Kaun is designed to work for any Indian city. To add yours:

1. **Ward boundary GeoJSON** — usually available via datameet or municipal GIS portals
2. **City config** — create a file in `apps/web/lib/cities/` (see `bengaluru.ts` as template)
3. **Elected rep data** — MyNeta has every state
4. **Adapters** — write one adapter per data portal your city has (see `scripts/adapters/kppp.mjs` as template) and add a GitHub Actions workflow to cron it
5. **Wiki** — add a `wiki/docs/<your-city>/` folder documenting what data you have and where it came from

Open a [City Request issue](https://github.com/kaun-city/kaun/issues/new?template=city-request.yml&labels=city-request) if you want to help bring Kaun to your city.

---

## Contributing

All code comes in via pull request to `master`. PRs require review from a maintainer before merge.

- **Request your city** — open an issue using the [City Request template](https://github.com/kaun-city/kaun/issues/new?template=city-request.yml&labels=city-request)
- **Add data** — fix ward stats, add missing corporator names, update budget figures
- **Build features** — pick an open issue labeled `good first issue`
- **Report bugs** — open an issue with steps to reproduce

---

## License

MIT — see [LICENSE](LICENSE)

---

*Built with frustration, maintained with hope.*
