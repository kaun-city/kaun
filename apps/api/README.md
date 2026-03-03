# Kaun API

FastAPI backend for [Kaun](https://kaun.city) — the civic accountability platform for Indian cities.

## Stack

- **FastAPI** — async Python web framework
- **PostgreSQL + PostGIS** — spatial queries (`ST_Contains`) for pin-to-ward resolution
- **SQLAlchemy 2.0 (async)** — ORM with full type hints
- **GeoAlchemy2** — PostGIS geometry column support

## Getting Started

### Prerequisites

- Python 3.12+
- Docker (for local PostgreSQL + PostGIS)

### 1. Start the database

```bash
docker compose up db -d
```

### 2. Set up the environment

```bash
cp apps/api/.env.example apps/api/.env
# Edit .env if needed (defaults work with docker compose)
```

### 3. Install dependencies

```bash
pip install -r apps/api/requirements.txt
```

### 4. Load ward boundaries

```bash
# Downloads Bengaluru ward GeoJSON from datameet and inserts into PostGIS
python -m apps.api.scripts.load_wards --city bengaluru
```

### 5. Run the API

```bash
uvicorn apps.api.main:app --reload
```

API is now live at `http://localhost:8000`.
Interactive docs at `http://localhost:8000/docs`.

## Key Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/pin` | Drop a pin, get ward + responsible agencies |
| `GET` | `/wards/{ward_no}?city_id=bengaluru` | Ward detail |
| `GET` | `/health` | Health check (always 200, `db` field shows DB status) |

### Example: Drop a pin

```bash
curl -X POST http://localhost:8000/pin \
  -H "Content-Type: application/json" \
  -d '{"lat": 12.9716, "lng": 77.5946, "city_id": "bengaluru"}'
```

```json
{
  "found": true,
  "city_id": "bengaluru",
  "ward_no": 84,
  "ward_name": "Shivajinagar",
  "zone": "East Zone",
  "agencies": [
    { "name": "Greater Bengaluru Authority", "short": "GBA", "helpline": "1533" },
    { "name": "BWSSB", "short": "BWSSB", "helpline": "1916" }
  ]
}
```

## Adding a City

1. Add `cities/<city_id>/config.json` (see [docs/adding-a-city.md](../../docs/adding-a-city.md))
2. Add a GeoJSON URL to `GEOJSON_URLS` in `scripts/load_wards.py`
3. Run the loader: `python -m apps.api.scripts.load_wards --city <city_id>`

## Degraded Mode

The API starts without a database and returns `503` on DB-dependent routes.
`GET /health` always returns `200` — use the `db` field to detect degraded state.
