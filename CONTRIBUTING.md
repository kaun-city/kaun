# Contributing to Kaun

Thanks for being here. Kaun is a public good — every contribution makes a city more accountable.

## Ways to Contribute

### 1. Add Your City
The most impactful contribution. See [docs/adding-a-city.md](docs/adding-a-city.md).
No coding required for basic city configs — just a `config.json` and a ward GeoJSON.

### 2. Improve Bengaluru Data
- Add a missing data source (file an issue or PR against `scripts/`)
- Fix ward boundary errors
- Add officer contact details

### 3. Build Features
Check open issues labeled `good first issue` or `help wanted`.
Comment before starting so we don't duplicate effort.

### 4. Report Bugs
Open an issue. Include: what you expected, what happened, city + ward + lat/lng if relevant.

---

## Dev Setup

**Prerequisites:** Node.js 20+, a free Supabase account

```bash
git clone https://github.com/kaun-city/kaun
cd kaun/apps/web
cp .env.example .env.local
```

Edit `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck  # TypeScript check
npm run build      # Production build
```

**To run data scrapers locally:**
```bash
# From repo root
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... SUPABASE_MANAGEMENT_TOKEN=... \
  node scripts/refresh-kppp.mjs
```

---

## PR Guidelines

- Keep PRs focused — one thing at a time
- Data-only changes (CSVs, configs) don't need tests
- Run `npm run typecheck` before pushing
- Don't commit `.env.local` or secrets
- If changing the DB schema, include the SQL migration

---

## Architecture Notes

- **No backend server** — frontend talks directly to Supabase via PostgREST and RPC functions
- **Pin lookup** uses PostGIS `ST_Contains` via the `pin_lookup(lat, lng)` RPC
- **Ward profile** data is assembled by the `ward_profile(ward_no)` RPC in Supabase
- **Cron jobs** run in GitHub Actions (see `.github/workflows/`) — no server needed

---

## Code of Conduct

Be direct. Be kind. This is civic infrastructure — it should work for everyone.

No tolerance for: discrimination, bad-faith contributions, or publishing private individuals' personal details (official contact info is fine; home addresses, personal phones are not).
