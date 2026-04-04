# Hyderabad Multi-City Architecture Findings
_Kaun agent deep-dive, 2026-04-04_

## TL;DR
The good news: the city abstraction layer already exists (`lib/cities/`). The bad news: it's incomplete — 
a lot of Bengaluru-specific logic bleeds through in API routes, components, and scripts.
Adding Hyderabad is ~2 weeks of work if done properly: 3-4 days architecture, 1 week data sourcing, 
3-4 days UI polish.

---

## 1. What's Already City-Agnostic (The Good)

### `lib/cities/` — Feature flag system ✅
- `CityConfig` type with `features` flags for every data dimension
- `getCity(cityId)` registry lookup with Bengaluru fallback
- `MapView` already reads from `cities.bengaluru` — just needs a `city` prop
- `PinResult` already has `city_id` field
- `ward_profile` RPC already takes `p_city_id`
- `departments` table already has `city_id`
- `community_facts` table has `city_id`
- `ward_amenities` table has `city_id`

### DB schema — partially ready ✅
Most tables already have `city_id TEXT` column. The `pin_lookup` RPC returns `city_id`.

---

## 2. What's Hardcoded for Bengaluru (The Problems)

### A. Routing — No city in URL yet
**Current:** Everything lives at `/` — single city implied
**Needed:** `/` = Bengaluru, `/hyd` = Hyderabad
- `app/page.tsx` and `HomePage.tsx` have no city awareness in the URL
- `MapView` has `DEFAULT_CITY = bengaluru` hardcoded — needs a prop
- `OutOfBoundsCard` in `HomePage.tsx` says "Kaun only covers Bengaluru right now" — needs to be dynamic

### B. `pin_lookup` RPC — Bengaluru boundaries only
The PostGIS `pin_lookup` function in Supabase only queries Bengaluru ward boundaries.
**Fix needed:** Either:
1. Add Hyderabad boundaries to `boundary_lookup` table and extend the RPC to search by city
2. Or have a separate `pin_lookup_hyd` RPC (simpler but ugly)
**Recommended:** Extend `boundary_lookup` table with `city_id` column, update `pin_lookup` to accept optional `p_city_id`.

### C. `ingest-signals` / CityPulse — Bengaluru RSS feeds only
```
ingest-signals/route.ts: BENGALURU_AREAS dict (243 wards hardcoded)
ingest-signals/route.ts: RSS feeds all Bengaluru-specific
refresh-pulse/route.ts: city_id: "bengaluru" hardcoded
```
**Fix:** Both routes need a `city_id` param or to be made multi-city aware with per-city RSS config in `CityConfig`.

### D. `ask-kaun` — Bengaluru-specific system prompt
```
"You are Kaun, a civic accountability assistant for Bengaluru, India."
"BBMP ward Corporator is the elected contact"
```
**Fix:** System prompt needs to be built from `CityConfig` (city name, civic body name, helpline numbers).

### E. `rti-draft` — Karnataka-specific RTI authorities
All RTI addresses are BBMP/Karnataka Legislature specific.
**Fix:** RTI authority config needs to move into `CityConfig` (or a city-specific config file).

### F. `ReportSheet.tsx` — BBMP helplines hardcoded
```
hoarding: { name: "BBMP", number: "1533" }
pothole:  { name: "BBMP", number: "1533" }
```
GHMC equivalent: `{ name: "GHMC", number: "040-21111111" }`
**Fix:** Move to `CityConfig.reportAgencies` map.

### G. `WardGrade.tsx` — "BBMP contractors" text
"A number from 0 to 100 based on publicly available data about your ward's MLA and BBMP contractors"
**Fix:** Dynamic text based on city config.

### H. `how-it-works/page.tsx` — Bengaluru-only methodology
Entire page describes Bengaluru data sources.
**Fix:** Either make it city-aware or keep it general with city-specific sections.

### I. Tables with no `city_id`:
```
bbmp_work_orders       — BBMP-specific, needs GHMC equivalent table
ward_grievances        — BBMP grievance data
ward_stats             — keyed by assembly_constituency (Bengaluru)
property_tax           — keyed by assembly_constituency (Bengaluru)
sakala_performance     — Karnataka-specific
ward_trade_licenses    — BBMP-specific
ward_potholes          — BBMP-specific
ward_spend_category    — BBMP 2018-23 data
mla_lad_funds          — Karnataka Legislature
rep_report_cards       — Karnataka Legislature
```
These tables are Bengaluru-only by structure. For Hyderabad, we either:
- Add `city_id` columns and populate equivalents (preferred long-term)
- Or create parallel `ghmc_*` tables (faster but messier)

### J. Scripts — all Bengaluru-specific
| Script | Reusable? | Notes |
|---|---|---|
| `seed-boundaries.mjs` | ✅ with params | Already uploads GeoJSON — just needs GHMC URL |
| `refresh-kppp.mjs` | ❌ | KPPP is Karnataka-only portal |
| `refresh-sakala.mjs` | ❌ | Karnataka Sakala only |
| `refresh-grievances.mjs` | ❌ | BBMP grievances API |
| `refresh-trade-licenses.mjs` | ❌ | BBMP trade license data |
| `seed-mla-contacts.mjs` | ✅ with params | Myneta.info works for Telangana too |
| `seed-kgis-ward-data.mjs` | ❌ | KGIS is Karnataka GIS |
| `seed-osm-amenities.mjs` | ✅ with params | OSM works everywhere |
| `seed-water-quality.mjs` | ⚠️ partial | Source-specific |
| `parse-budget.mjs` | ⚠️ partial | PDF parsing, needs GHMC budget PDFs |
| `scrape-blacklists.mjs` | ❌ | BBMP blacklist specific |
| `seed-mla-lad-funds.mjs` | ❌ | Karnataka LAD fund data |
| `seed-work-orders-full.mjs` | ❌ | BBMP work orders via opencity.in |
| `refresh-city-pulse.mjs` | ✅ with config | RSS feeds configurable |

---

## 3. Hyderabad Data Reality Check

### What we CAN show:
- Ward map (145/150 wards from Datameet GeoJSON) ✅
- MLA data for ~24 Hyderabad constituencies via Myneta ✅
- 2020 corporator results (Wikipedia scrape — historical, no current reps) ✅
- GHMC budget totals (city-level, not ward-level) ✅
- OSM amenities (hospitals, ATMs, etc.) ✅
- r/hyderabad buzz ✅
- Report a civic issue (GHMC number) ✅

### What we CANNOT show (data doesn't exist):
- Ward-level spending — not available
- Ward committee meetings — no public records
- Grievance counts per ward — login-walled portal
- Property tax per ward — not available
- Pothole data per ward — no structured source
- Sakala equivalent — Telangana uses Meeseva but no ward-level SLA data
- Current corporator — no elections since Feb 2026

### Honest UI approach:
Show a ward card with available data, clearly flag gaps with "Data not available for GHMC" badges.
The `CityFeatures` flags in `CityConfig` gate every section — set to `false` and the UI shows nothing (or a tasteful "coming soon" state).

---

## 4. Proposed DB Schema Changes

```sql
-- 1. Extend boundary_lookup to support multi-city pin lookup
ALTER TABLE boundary_lookup ADD COLUMN IF NOT EXISTS city_id TEXT DEFAULT 'bengaluru';
CREATE INDEX IF NOT EXISTS boundary_lookup_city_idx ON boundary_lookup(city_id);

-- 2. Hyderabad ward table (mirrors `wards` for Bengaluru)
-- Option A: Extend existing `wards` table (preferred)
ALTER TABLE wards ADD COLUMN IF NOT EXISTS city_id TEXT DEFAULT 'bengaluru';
-- Then insert GHMC wards with city_id = 'hyderabad'

-- 3. City config table (optional, for DB-driven config)
CREATE TABLE IF NOT EXISTS cities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  state TEXT,
  country TEXT DEFAULT 'India',
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  zoom INT DEFAULT 11,
  geojson_url TEXT,
  subreddit TEXT,
  budget_year TEXT,
  features JSONB DEFAULT '{}',
  launched_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT false
);

-- 4. Elected reps — already has city_id via constituency linkage
-- GHMC corporators (2020 results, historical)
-- Insert into elected_reps with role='CORPORATOR', city_id='hyderabad'

-- 5. Update pin_lookup RPC to be city-aware
-- (PostGIS function update needed in Supabase)
```

---

## 5. Routing Architecture (Path-Based)

```
/              → Bengaluru (existing, no change)
/hyd           → Hyderabad city page  
/hyd?ward=42   → Hyderabad ward 42 pre-selected
/pune          → Pune (future)
```

### Next.js structure:
```
app/
  page.tsx                    ← Bengaluru (existing)
  [city]/
    page.tsx                  ← Dynamic city route, reads city from params
  layout.tsx                  ← Update metadata dynamically per city
```

### Key changes:
1. `app/[city]/page.tsx` — new dynamic route, passes `cityId` to `HomePage`
2. `HomePage.tsx` — accept `cityId` prop, pass to `MapView` and `WardCard`
3. `MapView.tsx` — accept `city: CityConfig` prop (already reads from `cities.bengaluru`, just needs prop)
4. `WardCard.tsx` — accept city-aware context for helplines, RTI, body names
5. `pinLookup()` in `lib/api.ts` — pass `city_id` to `pin_lookup` RPC
6. `OutOfBoundsCard` — use city registry to suggest other cities instead of "Bengaluru only"

---

## 6. Effort Estimate

| Task | Days | Complexity |
|---|---|---|
| Extend `pin_lookup` RPC for GHMC boundaries | 1 | Medium (PostGIS) |
| Seed GHMC ward boundaries into `boundary_lookup` | 0.5 | Low |
| Seed GHMC wards table | 0.5 | Low |
| Scrape + seed 2020 corporator results | 1 | Low |
| Scrape Myneta for Hyderabad MLAs | 0.5 | Low |
| Path-based routing (`/hyd`) | 1 | Medium |
| City-aware `HomePage` + `MapView` | 1 | Medium |
| City-aware `WardCard` (helplines, RTI, body names) | 1 | Medium |
| City-aware `ask-kaun` system prompt | 0.5 | Low |
| City-aware `CityPulse` RSS feeds | 0.5 | Low |
| `how-it-works` multi-city content | 0.5 | Low |
| QA + edge cases | 1 | Medium |
| **Total** | **~9 days** | |

---

## 7. Recommended Build Order

1. **Day 1:** DB — extend `boundary_lookup` + seed GHMC wards + update `pin_lookup` RPC
2. **Day 2:** Data — scrape corporators + MLAs for Hyderabad
3. **Day 3:** Routing — `app/[city]/page.tsx`, update `HomePage` to accept city prop
4. **Day 4:** Map + WardCard — city-aware, feature-flagged sections
5. **Day 5:** API layer — city-aware ask-kaun, CityPulse, RTI
6. **Day 6-7:** Polish, QA, deploy

---

## 8. Key Risks

1. **`pin_lookup` RPC** — the core spatial query. If GHMC ward boundaries have gaps (145/150 features), some pins will return `found: false`. Need fallback UX.
2. **GeoJSON property mismatch** — BBMP GeoJSON has `KGISWardNo`, `KGISWardName`; GHMC GeoJSON has `name` = "Ward 91 Khairatabad". Ward number parsing needs to handle both formats.
3. **No current corporators** — GHMC has no elected reps. The WHO tab will look thin. Be explicit: "GHMC under administrator rule since Feb 2026".
4. **GHMC split** — technically 3 corporations now. Users in MMC/CMC areas will get a confusing experience. Consider a banner: "Note: Parts of Hyderabad are now under MMC/CMC jurisdiction. Ward data reflects pre-2026 GHMC boundaries."
5. **300-ward transition** — when elections happen (2026), new boundaries will change ward numbers. Build with this in mind.

---

## 9. What Changes in GHMC GeoJSON vs BBMP

| Property | BBMP (Bengaluru) | GHMC (Hyderabad) |
|---|---|---|
| Ward number | `KGISWardNo` (integer) | Parse from `name` ("Ward 91 ...") |
| Ward name | `KGISWardName` | Parse from `name` ("Ward 91 Khairatabad") |
| Zone | `ZoneName` | Not present in GeoJSON |
| Assembly | `Assembly` | Not present in GeoJSON |
| Coordinate system | WGS84 | WGS84 |
| Feature count | 243 | 145 (of 150) |

**The GHMC GeoJSON needs a normalization step** to extract ward_no and ward_name from the `name` field.
Regex: `/^Ward (\d+) (.+)$/`

---

## 10. Files Created in This Exploration
- `data/hyderabad/ghmc-wards.geojson` — 145 ward boundaries from Datameet (586KB)
- `data/hyderabad/architecture-findings.md` — this document
- `apps/web/lib/cities/hyderabad.ts` — Hyderabad CityConfig (feature-flagged)
- `apps/web/lib/cities/index.ts` — Updated registry to include hyderabad
