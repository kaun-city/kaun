# Kaun Agent Handoff

> Written by Midas (main agent) on 2026-03-03. Everything you need to own Kaun.

---

## What is Kaun?

**"Pin a place. Know who's responsible."**

Open source civic accountability platform. Drop a pin on a map, see: who your elected representative is, what tenders are being spent in your ward, which contractor got the work, and how to file an RTI or complaint. Bengaluru first, any Indian city later.

The name "Kaun" means "Who?" in Hindi -- WHO approved this? WHO is responsible? WHO got the contract?

---

## Live URLs

| What | URL |
|---|---|
| **GitHub** | https://github.com/kaun-city/kaun |
| **Domain** | https://kaun.city (registered, not deployed yet) |
| **License** | MIT |
| **Branch** | `master` |

**Not deployed yet.** Running locally only. Deployment plan: Fly.io (API) + Cloudflare Pages (frontend).

---

## Code Location

```
C:\Users\Bharath\.openclaw\workspace\kaun
```

Also cloned at `C:\Users\Bharath\Projects\kaun` (may be stale -- workspace copy is canonical).

---

## Architecture

### Monorepo Structure

```
kaun/
  apps/
    api/              # FastAPI + PostGIS backend
      routers/
        pin.py        # POST /pin -- core endpoint, lat/lng -> ward + agencies
        wards.py      # GET /wards -- list all wards for a city
        ward_profile.py  # GET /ward-profile -- elected reps, tenders, officers
        buzz.py       # GET /buzz -- Reddit r/bangalore posts for a ward
      scripts/
        load_wards.py    # Downloads datameet GeoJSON, upserts 243 wards into PostGIS
        seed_bengaluru.py  # Seeds 21 MLAs + 4 MPs + 7 sample tenders
      models.py       # SQLAlchemy ORM: Ward, ElectedRep, Officer, Tender
      schemas.py      # Pydantic v2 request/response schemas
      city_config.py  # Loads cities/<id>/config.json, resolves jurisdiction
      config.py       # Settings from env vars (DATABASE_URL, etc.)
      database.py     # Async SQLAlchemy engine + session factory
      main.py         # FastAPI app, CORS, router registration, /health
      Dockerfile
      requirements.txt
      .env / .env.example
    web/              # Next.js 15 + Leaflet + Tailwind frontend
      app/
        page.tsx      # Main page -- dynamic imports MapView + WardCard
        layout.tsx    # Root layout, dark theme, Inter font
        globals.css   # Tailwind base + slide-up animation
      components/
        MapView.tsx   # Full-screen Leaflet map, ward overlay, pin click handler
        WardCard.tsx  # Bottom sheet with 3 tabs: WHO | MONEY | REPORT
      lib/
        api.ts        # dropPin(), fetchWardProfile(), fetchBuzz()
        types.ts      # TypeScript interfaces for all data models
      .env.local      # NEXT_PUBLIC_API_URL=http://localhost:8000
      package.json
      tailwind.config.ts
      next.config.ts
  cities/
    bengaluru/
      config.json     # Full city config: agencies, jurisdiction resolver, RTI info
  docs/
    adding-a-city.md  # Guide for contributors adding new cities
  docker-compose.yml  # PostgreSQL+PostGIS + API services
  CONTRIBUTING.md
  LICENSE (MIT)
  README.md
```

### City-Config Architecture

Adding a city = adding a folder under `cities/<city_id>/config.json`. No core code changes needed.

The config defines:
- **Agencies** (name, short code, helpline, website, complaint URL, RTI address)
- **Jurisdiction resolver** (issue type -> responsible agency mapping)
- **Tender sources** (where to scrape tender data)
- **RTI info** (fee, response timeline, portal URL)
- **Data notes** (governance context)

See `docs/adding-a-city.md` for the full guide.

---

## API Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/pin` | Core: lat/lng -> ward + agencies. Uses PostGIS `ST_Contains`. |
| `GET` | `/wards` | List all wards for a city (optional `?city=bengaluru`). |
| `GET` | `/ward-profile` | Full accountability: elected reps + officers + tenders + governance alert. Params: `ward_no`, `city_id`, `assembly_constituency`. |
| `GET` | `/buzz` | Reddit r/bangalore posts mentioning a ward name. Param: `ward_name`. |
| `GET` | `/health` | Always 200. `db: true/false` indicates database connectivity. |
| `GET` | `/docs` | Swagger/OpenAPI UI. |

### API Design Principles

- **Never crash the frontend**: All endpoints return empty arrays/null on errors, wrapped in try-catch.
- **Graceful degradation**: App boots without DB (503 on DB-dependent routes, `/health` always 200).
- **City-config driven**: Backend reads `cities/<id>/config.json` for agency data. No hardcoded city logic.

---

## Database

### PostgreSQL + PostGIS

Local dev via Docker:
```bash
docker compose up db -d
```

Connection: `postgresql+asyncpg://postgres:postgres@localhost:5432/kaun`

### Tables

**`wards`** -- 243 Bengaluru ward boundaries (PostGIS MultiPolygon)
- `city_id`, `ward_no`, `ward_name`, `zone`, `assembly_constituency`, `geom`
- Unique: `(city_id, ward_no)`
- Spatial index on `geom` (GeoAlchemy2 auto-creates)
- Source: [datameet Municipal_Spatial_Data](https://github.com/datameet/Municipal_Spatial_Data) (CC BY-SA 2.5 IN)

**`elected_reps`** -- MLAs, MPs, Corporators
- `city_id`, `role` (MLA/MP/CORPORATOR), `constituency`, `name`, `party`, `elected_since`, `photo_url`, `phone`, `email`, `profile_url`, `notes`, `data_source`
- Unique: `(city_id, role, constituency)`
- Currently seeded: 21 Bengaluru MLAs (2023 Karnataka elections) + 4 MPs (2024 Lok Sabha)

**`officers`** -- Ward-level officers (Ward Officer, AE, EE)
- `city_id`, `ward_no`, `department`, `role`, `name`, `phone`, `source`, `updated_at`
- Unique: `(city_id, ward_no, department, role)`
- **Currently empty** -- populated via RTI responses over time

**`tenders`** -- Civic works tenders
- `city_id`, `ward_no` (null = city-wide), `kppp_id`, `title`, `department`, `contractor_name`, `contractor_blacklisted`, `value_lakh`, `status` (OPEN/AWARDED/COMPLETED/CANCELLED), `issued_date`, `deadline`, `source_url`, `scraped_at`
- Unique: `kppp_id`
- Currently seeded: 7 representative samples (realistic format, not real data yet)

### Seeding

```bash
# Load ward boundaries (243 wards from datameet GeoJSON)
python -m apps.api.scripts.load_wards --city bengaluru

# Seed elected reps + sample tenders
python -m apps.api.scripts.seed_bengaluru
```

---

## Frontend

### Stack
- Next.js 15 App Router
- Leaflet.js (free, no API key) -- loaded dynamically (`{ ssr: false }`)
- Stadia Maps dark tiles (`alidade_smooth_dark`)
- Tailwind CSS

### Brand
- Background: `#0A0A0A` (near black) / `#111111` (card)
- Accent: `#FF9933` (saffron)
- Text: white with opacity variants
- Mobile-first responsive

### MapView Component
- Full-screen Leaflet map centered on Bengaluru `[12.9716, 77.5946]`, zoom 12
- Ward boundary overlay from datameet GeoJSON (saffron stroke, 5% fill)
- Click anywhere -> drops a pin -> calls `POST /pin` -> opens WardCard
- Custom saffron pin icon with white border
- Leaflet CSS loaded via `document.createElement('link')` in `useEffect` (SSR workaround)
- Uses `onPinRef` pattern to avoid re-initializing map on prop changes

### WardCard Component (Bottom Sheet)
Three tabs:

**WHO tab**
- Governance alert banner (yellow): "No elected corporator since September 2020"
- Elected representatives: name, party (color-coded badge), constituency, election year, notes
- Party colors: INC=#19AAED, BJP=#FF6B00, JD(S)=#138808, AAP=#0066CC
- Profile link for each rep
- Ward Officers section (currently shows "not yet available" + RTI prompt)

**MONEY tab**
- Tender count + total value header
- Each tender: title, status badge (Open/Awarded/Done/Cancelled), Rs. amount, date
- Contractor name with red "FLAGGED" badge if blacklisted
- Link to KPPP source
- Reddit r/bangalore posts below tenders (lazy-loaded)

**REPORT tab**
- RTI Generator button (hero CTA -- currently `alert("coming soon")`)
- RTI Act info: Rs. 10 fee, 30-day response
- Sampark Karnataka (universal grievance portal, helpline 1902)
- Agency-specific complaint portals (GBA Sahaaya, BWSSB, BESCOM, BTP, BDA)

### Offline Fallback
Frontend works without backend -- if `/pin` fails, it uses GeoJSON feature properties directly for basic ward info. The WardCard shows agency data from the GeoJSON overlay.

---

## Key Bengaluru Context

### BBMP Dissolved
BBMP was dissolved in September 2020 (elections delayed). In September 2025, it was replaced by the **Greater Bengaluru Authority (GBA)** + 5 city corporations. Ward-level elections are still pending (as of March 2026). This governance gap IS the story -- prominently shown as a yellow alert banner.

### Ward Boundaries
- 243 wards, 2022 delimitation
- Source: datameet/Municipal_Spatial_Data (CC BY-SA 2.5 IN)
- GeoJSON properties: `KGISWardNo`, `KGISWardName`, `ZoneName`, `Assembly`
- The `Assembly` field maps wards to assembly constituencies (used for MLA lookup)

### Agencies
| Short | Full Name | Helpline | Handles |
|---|---|---|---|
| GBA | Greater Bengaluru Authority (formerly BBMP) | 1533 | Roads, drains, garbage, parks, streetlights |
| BWSSB | Bangalore Water Supply and Sewerage Board | 1916 | Water supply, sewage |
| BESCOM | Bangalore Electricity Supply Company | 1912 | Electricity |
| BTP | Bengaluru Traffic Police | 103 | Traffic signals, violations |
| BDA | Bangalore Development Authority | -- | Arterial roads, layouts |

### KPPP (Karnataka Public Procurement Portal)
- URL: https://kppp.karnataka.gov.in
- API base: `https://kppp.karnataka.gov.in/supplier-registration-service/v1/api`
- **API is unreliable** -- consistently returns 500 for valid payloads (as of March 2026)
- DTO: `tenderSearchFilter` with `category` (WORKS/GOODS/SERVICES) and `title` fields
- Plan: Pre-fetch via GitHub Actions scraper, store in Kaun DB, serve from own API
- Current data: 7 representative samples seeded manually

---

## Known Issues & Gotchas

### Ward Loader Spatial Index Bug
`load_wards.py` previously failed on retry with `relation "idx_wards_geom" already exists`. Fixed: GeoAlchemy2 auto-creates the GiST index; removed manual index definition from model. Use `checkfirst=True` in `create_all`.

**Current state**: Ward loader has been run partially. Wards table exists, 243 features downloaded, but may need a clean re-run. Check:
```bash
python -m apps.api.scripts.load_wards --city bengaluru
```

### Reddit Buzz Endpoint
`/buzz` endpoint returns 200 but sometimes returns empty `[]`. Reddit API works from direct PowerShell/browser calls but httpx in FastAPI may get rate-limited or blocked. The frontend also has a direct Reddit fetch in `api.ts` (browser-side, no CORS issues) as a fallback.

### Assembly Constituency Name Matching
Ward -> MLA lookup depends on the `Assembly` field in the GeoJSON matching `constituency` in the `elected_reps` table exactly. If names don't match (e.g. "C V Raman Nagar" vs "CV Raman Nagar"), the lookup fails silently (returns empty array). Verify with:
```sql
SELECT DISTINCT assembly_constituency FROM wards WHERE city_id='bengaluru';
```
Compare against:
```sql
SELECT DISTINCT constituency FROM elected_reps WHERE city_id='bengaluru';
```

### Test Files to Clean Up
`test_kppp.py` and `test_reddit.py` at repo root -- gitignored but still present locally. Can be deleted.

---

## Local Development

### Prerequisites
- Docker (for PostgreSQL+PostGIS)
- Python 3.12+ with venv
- Node.js 20+

### Backend
```bash
# Start database
docker compose up db -d

# Create venv and install deps
python -m venv .venv
.venv\Scripts\activate  # Windows
pip install -r apps/api/requirements.txt

# Load ward boundaries
python -m apps.api.scripts.load_wards --city bengaluru

# Seed elected reps + tenders
python -m apps.api.scripts.seed_bengaluru

# Start API
uvicorn apps.api.main:app --reload --port 8000
```

### Frontend
```bash
cd apps/web
npm install
npm run dev
# Opens at http://localhost:3000
```

### Verify
```bash
# Health check
curl http://localhost:8000/health

# Test pin (Koramangala)
curl -X POST http://localhost:8000/pin -H "Content-Type: application/json" -d '{"lat":12.9352,"lng":77.6245}'

# Test ward profile
curl "http://localhost:8000/ward-profile?ward_no=67&city_id=bengaluru&assembly_constituency=Mahadevapura"
```

---

## Deployment Plan (Not Done Yet)

### Backend: Fly.io
- Deploy `apps/api` with Dockerfile
- Provision PostgreSQL with PostGIS extension
- Set `DATABASE_URL` as Fly secret
- Set `CORS_ORIGINS` to `["https://kaun.city"]`

### Frontend: Cloudflare Pages
- Deploy `apps/web`
- Set `NEXT_PUBLIC_API_URL` to Fly.io API URL
- Connect to `kaun.city` domain

### Data Refresh: GitHub Actions
- Weekly KPPP tender scraper (when API is available, or web scraping fallback)
- Daily Reddit r/bangalore ingestion (cache in DB for faster serving)
- Quarterly elected rep verification (post-election updates)

---

## What Needs Doing

### Immediate (Phase 1)
1. **Fix & run ward loader** -- verify all 243 wards are in the DB with correct `assembly_constituency` values
2. **Test frontend end-to-end** -- start Next.js dev, click on map, verify WardCard renders with real data
3. **Verify constituency name matching** -- ensure GeoJSON `Assembly` values match seed data `constituency` values exactly
4. **Deploy to Fly.io + Cloudflare Pages** -- get kaun.city live

### High Impact Features
5. **RTI Generator** -- the killer feature. 5 templates (from research in `civic-map/research/agent-D-legal-rti.md`). Drop pin, see overdue work, generate pre-filled RTI application as PDF. Rs. 10 fee, 30-day response.
6. **WhatsApp share cards** -- OG image per ward for viral sharing via RWA groups
7. **KPPP tender scraper** -- GitHub Actions cron job, replace sample data with real tenders
8. **Kannada language support** -- Bengaluru is primary Kannada-speaking

### Data Quality
9. **Verify all 21 MLA names** -- cross-check against ECI results (some may have changed due to by-elections)
10. **Add MP -> Lok Sabha constituency -> assembly constituency mapping** -- currently MPs show up if ward's assembly constituency matches, but Lok Sabha constituencies span multiple assembly constituencies
11. **Officer data via RTI** -- file RTIs for ward officer directories, populate `officers` table

---

## Research Archive

Extensive feasibility research from 5 overnight agents is saved in:
```
C:\Users\Bharath\.openclaw\workspace\civic-map\research\
  research-synthesis.md     # Comprehensive synthesis
  agent-A-jurisdiction.md   # Ward boundaries, agency mapping
  agent-B-tenders.md        # KPPP API reverse-engineering, tender data
  agent-C-complaints.md     # Reddit, social media, complaint portals
  agent-D-legal-rti.md      # RTI Act, 5 RTI templates, legal analysis
  agent-E-ux-mvp.md         # UX patterns, architecture recommendations
```

Key finding: **RTI Generator is the viral hook.** Drop pin -> see overdue work -> generate pre-filled RTI in 5 minutes -> share via WhatsApp to RWA groups.

---

## Commit History

```
2a815ed chore: gitignore .venv and test files, untrack venv from repo
f2c7f36 feat: real data -- elected reps, tenders, ward profile API, WHO/MONEY/REPORT tabs
7d0410e fix(web): agency website link + helpline as plain text
fc1e5e5 fix: map initialises once via onPinRef -- eliminates hot-reload useEffect size error
0fa5bb8 fix: remove duplicate spatial index, idempotent loader, drop react-leaflet (react 19 compat)
5d74975 feat(web): Next.js 15 + Leaflet frontend, WardCard, dark saffron theme
37a5c25 feat(api): FastAPI + PostGIS backend, /pin endpoint, ward loader
bf12f48 init: README, city config, docs, contributing guide
```

---

## Python Dependencies

```
fastapi==0.115.6
uvicorn==0.32.1
sqlalchemy==2.0.36
asyncpg==0.30.0
geoalchemy2==0.15.2
pydantic==2.10.4
pydantic-settings==2.7.0
alembic==1.14.0
httpx==0.28.1
python-dotenv==1.0.1
```

---

*This doc should be everything you need. Research archive is in civic-map/research/ if you need the deep-dive feasibility analysis.*
