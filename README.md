# KAUN?

**Pin a place. Know who's responsible.**

Civic accountability for Indian cities — drop a pin anywhere and instantly see your elected representative, who gets the contracts, how public money is spent, and what you can do about it.

**[kaun.city](https://kaun.city)** — live for **Bengaluru** (243 wards · BBMP/GBA) and **Visakhapatnam** (98 wards · GVMC). Open source. City-agnostic architecture: adding a new city is a config file plus an adapter, not a fork.

Kaun adapts its tone to each city's data. Bengaluru ships with an *accountability* framing (red/yellow alerts on documented scams, missing money, MLA failures) because Karnataka's failures are well-recorded in the public record. Visakhapatnam ships with a *transparency* framing (green badges on UPYOG/RTGS/GSWS coverage, ward-level service-request data) because Andhra Pradesh has built genuinely best-in-class open data infrastructure across all 123 ULBs and that's the honest story.

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

### Bengaluru

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

### Visakhapatnam

| Dataset | Source |
|---|---|
| Ward boundaries (98 wards, PostGIS) | [OpenCity.in](https://data.opencity.in/dataset/visakhapatnam-wards-map-2024) — GVMC 2024 delimitation KML |
| Grievances, property tax, trade licences | [CDMA AP Open Portal](https://apcdmaopenportal.emunicipal.ap.gov.in) — UPYOG/DIGIT backend shared by all 123 AP ULBs |
| Awarded tenders (GVMC, VMRDA, GVSCCL, APIIC, APEPDCL) | [AP eProcurement](https://tender.apeprocurement.gov.in) |
| MLA affidavits (Vizag constituencies) | [MyNeta AP 2024](https://myneta.info/AndhraPradesh2024/) |
| GVMC budget summary | GVMC General Body resolution + [Open Budgets India](https://openbudgetsindia.org) |
| Real-time service delivery (193 services, 45 depts) | [AP RTGS](https://www.core.ap.gov.in/cmdashboard/Index.aspx) |
| Ward-level service delivery (500+ services) | [Grama-Ward Sachivalayam](https://gramawardsachivalayam.ap.gov.in/) |
| Air quality | [APPCB / CPCB CAAQMS](https://airquality.cpcb.gov.in/AQI_India/) |
| Cyclone preparedness | [APSDMA GIS](https://apsdmagis.ap.gov.in/) |
| Ward amenities | [OpenStreetMap](https://www.openstreetmap.org) via Overpass API |

**Key organisations:** [datameet](https://datameet.org), [opencity.in](https://opencity.in), [CIVIC Bengaluru](https://civicbengaluru.org), [OpenStreetMap](https://www.openstreetmap.org), [ADR/MyNeta](https://adrindia.org), [eGov Foundation (UPYOG/DIGIT)](https://www.egovernments.org/), [Open Budgets India](https://openbudgetsindia.org)

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
│   ├── kppp.mjs                 # KPPP tenders (BBMP, BWSSB, BDA, BESCOM)
│   ├── ifms.mjs                 # BBMP IFMS work orders (contractor, division, dates, payment status)
│   ├── upyog.mjs                # CDMA Open Portal — grievances, property tax, trade licences for all 123 AP ULBs
│   └── ap-eproc.mjs             # AP eProcurement — awarded tenders for Vizag entities (GVMC/VMRDA/GVSCCL/APIIC/APEPDCL)
├── lib/
│   ├── db.mjs                   # Shared Supabase helpers
│   ├── kml.mjs                  # KML → GeoJSON parser (boundary ingest)
│   ├── html.mjs                 # Embedded-state JSON + HTML table extractors (adapters)
│   └── parsers.mjs              # Quoted CSV, contractor name/phone, AC name normaliser
├── seed-boundaries.mjs                  # BBMP ward GeoJSON → PostGIS
├── seed-boundaries-visakhapatnam.mjs    # GVMC 98 wards (KML → GeoJSON → PostGIS)
├── seed-work-orders-full.mjs            # BBMP work orders + contractor profiles
├── seed-osm-amenities.mjs               # 15 amenity categories from OpenStreetMap (--city flag)
├── seed-water-quality.mjs               # Lake water quality from KSPCB
├── seed-mla-contacts.mjs                # Karnataka MLA contact info from MyNeta
├── seed-mla-contacts-ap.mjs             # AP MLAs (2024 Vidhan Sabha) from data/ap-mla-2024.json
├── seed-mla-lad-funds.mjs               # LAD fund data from opencity.in
├── seed-gvmc-budget.mjs                 # GVMC budget summary from data/gvmc-budget-2024-25.json
├── seed-kgis-ward-data.mjs              # Trees, clinics, waste centres from KGIS
├── scrape-blacklists.mjs                # Cross-ref contractors against debarment lists
├── refresh-grievances.mjs               # BBMP complaints from opencity.in
├── refresh-city-pulse.mjs               # Civic news from RSS feeds
├── refresh-sakala-browser.mjs           # Sakala service delivery (local Playwright — site blocks cloud IPs)
└── refresh-trade-licenses.mjs           # Trade licence stats
```

### Scheduled Refreshes

| Schedule | Job | Runs on | Purpose |
|---|---|---|---|
| Daily 02:00 UTC | `/api/ingest-signals` | Vercel cron | RSS + Twitter-via-Google-News civic signal ingestion |
| Daily 06:00 UTC | `refresh-pulse` | GitHub Actions | Civic news classification for City Pulse ticker |
| Sundays 01:00 UTC | `refresh-kppp` | GitHub Actions | KPPP tenders across BBMP / BWSSB / BDA / BESCOM |
| Sundays 02:00 UTC | `refresh-ifms` | GitHub Actions | BBMP IFMS work orders — contractor code, division, budget head, dates, payment status |
| Sundays 03:00 UTC | `refresh-wiki-wards` | GitHub Actions | Regenerate per-ward wiki pages from the freshly refreshed data |
| 2nd of month | `refresh-grievances` | GitHub Actions | BBMP grievance counts |
| 3rd of month | `refresh-trade-licenses` | GitHub Actions | Trade licence stats |
| 1st of month (manual) | `refresh-sakala` | Local Playwright | Sakala service delivery (cloud-blocked) |
| Daily 04:00 UTC | `refresh-upyog` | GitHub Actions | UPYOG/CDMA grievances, property tax, trade licences (all registered AP ULBs) |
| 5th of month | `refresh-ap-eproc` | GitHub Actions | AP eProcurement awarded tenders for Vizag departments |
| On push to `master` | `test` | GitHub Actions | Unit tests + apps/web typecheck |
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

1. **Ward boundary GeoJSON** — usually available via datameet or municipal GIS portals (or extract from KML using `scripts/lib/kml.mjs`)
2. **City config** — create a file in `apps/web/lib/cities/` (see `bengaluru.ts` for accountability tone or `visakhapatnam.ts` for transparency tone) and register it in `apps/web/lib/cities/index.ts`
3. **Elected rep data** — MyNeta has every state
4. **Adapters** — write one adapter per data portal your city has, or reuse an existing one. Any AP ULB is `node scripts/adapters/upyog.mjs --ulb=<name>` (Vijayawada, Tirupati, Guntur, etc. are zero-marginal-cost). Karnataka uses `kppp.mjs` + `ifms.mjs`. Add a GitHub Actions workflow under `.github/workflows/` to cron it.
5. **Wiki** — add a `wiki/docs/<your-city>/` folder documenting what data you have and where it came from

Open a [City Request issue](https://github.com/kaun-city/kaun/issues/new?template=city-request.yml&labels=city-request) if you want to help bring Kaun to your city.

### Tests

```bash
npm test           # node --test for the seeder/adapter helpers
cd apps/web && npm run typecheck
```

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
