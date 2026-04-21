# API Reference

Public JSON APIs for consuming civic data. Free, open, CORS-enabled, no auth required.

All endpoints cache for 1 hour (`Cache-Control: public, max-age=3600`). All return JSON with source attribution.

**Base URL:** `https://kaun.city/api/data`

## Endpoints

### `GET /api/data/wards`

All Bengaluru wards with ward-level detail on request.

| Parameter | Description |
|---|---|
| `ward` | Ward number for detailed data (infrastructure, spending, work orders, potholes, crashes, air quality) |

**Examples:**
- All wards: [`/api/data/wards`](https://kaun.city/api/data/wards)
- Ward 42 detail: [`/api/data/wards?ward=42`](https://kaun.city/api/data/wards?ward=42)

### `GET /api/data/contractors`

1,300+ contractor profiles with entity resolution (phone-based alias grouping), total contract value, ward spread, deduction rates, and blacklist flags.

| Parameter | Description |
|---|---|
| `ward` | Filter contractors active in a specific ward |
| `flagged` | Set to `true` to get only blacklist-flagged contractors |
| `limit` | Max results (default 100, max 500) |

**Examples:**
- Top contractors: [`/api/data/contractors?limit=10`](https://kaun.city/api/data/contractors?limit=10)
- Flagged only: [`/api/data/contractors?flagged=true`](https://kaun.city/api/data/contractors?flagged=true)
- Ward 42: [`/api/data/contractors?ward=42`](https://kaun.city/api/data/contractors?ward=42)

### `GET /api/data/reps`

MLA and corporator data with criminal cases, assets, attendance, LAD fund utilization, and report cards from EC affidavits.

| Parameter | Description |
|---|---|
| `constituency` | Filter by assembly constituency name (partial match) |
| `role` | Filter by role: MLA, MP, CORPORATOR |

**Examples:**
- All MLAs: [`/api/data/reps?role=MLA`](https://kaun.city/api/data/reps?role=MLA)
- Yelahanka: [`/api/data/reps?constituency=Yelahanka`](https://kaun.city/api/data/reps?constituency=Yelahanka)

### `GET /api/data/spending`

BBMP budget, work orders, ward-level spending by category, and property tax collections.

| Parameter | Description |
|---|---|
| `ward` | Ward number for ward-specific data |
| `type` | `budget`, `work-orders`, `ward-spending`, `property-tax`, or `all` |

**Examples:**
- City budget: [`/api/data/spending?type=budget`](https://kaun.city/api/data/spending?type=budget)
- Work orders: [`/api/data/spending?ward=42&type=work-orders`](https://kaun.city/api/data/spending?ward=42&type=work-orders)

### `GET /api/export`

Full ward-level dataset as downloadable CSV. Demographics, infrastructure, spending by category, potholes, crashes, air quality, work order counts. Source attribution footer included.

| Parameter | Description |
|---|---|
| `type` | `all`, `ward-spending`, or `ward-demographics` |

**Example:**
- [`/api/export?type=all`](https://kaun.city/api/export?type=all) — downloads CSV

## Response format

All endpoints return JSON in this shape:

```json
{
  "data": [...],
  "count": 243,
  "source": "kaun.city - public records aggregated from BBMP, opencity.in, OSM, CPCB",
  "license": "Public data, MIT licensed platform"
}
```

For ward-specific endpoints (`?ward=X`), the response includes nested objects per data category (infrastructure, spending, work_orders, etc.).

## CORS

All endpoints set:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

You can call these APIs from any frontend, no proxy needed.

## Attribution

When using this data, please:

1. **Cite the source** — include a link back to kaun.city or data.kaun.city
2. **Preserve source tags** — the `source` field in each response documents the original data provenance
3. **Respect licenses** — data is from public records; wiki content is CC BY-SA 4.0

## Interactive data catalog

The [data catalog on kaun.city](https://kaun.city/data) has "try it" links and full source attribution tables.

## Questions

- Missing data? [Open an issue](https://github.com/kaun-city/kaun/issues/new)
- Building on top of this? We'd love to hear — add yourself to the [Partners](partners.md) page via PR
