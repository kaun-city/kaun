# Adding a City to Kaun

You don't need to write code to add a city. You need:
1. Ward/zone boundary GeoJSON
2. A config file describing the city's agencies and jurisdiction
3. A PR

---

## Step 1: Find Ward Boundaries

Your city needs a GeoJSON file with ward/zone polygons. Places to look:

- **[datameet/Municipal_Spatial_Data](https://github.com/datameet/Municipal_Spatial_Data)** — has boundaries for many Indian cities (Bangalore, Chennai, Hyderabad, Pune, Mumbai wards)
- **[OpenCity](https://opencity.in)** — historical civic data for Indian cities
- **State GIS portals** — search "[state name] GIS ward boundary download"
- **RTI the municipal body** — if no public GeoJSON exists, RTI for ward boundary shapefiles

Save as `cities/<your-city>/wards.geojson`.

---

## Step 2: Create config.json

Copy `cities/bengaluru/config.json` as a template. Fill in:

```json
{
  "id": "your-city-slug",
  "name": "Your City",
  "country": "IN",
  "state": "Your State",
  "ward_count": 100,
  "ward_boundary_source": "URL or 'manual'",

  "agencies": {
    "roads_local": {
      "name": "Your Municipal Corporation",
      "short": "XMC",
      "helpline": "1234",
      "rti_address": "Public Information Officer, XMC, City - PINCODE"
    }
  },

  "jurisdiction_resolver": {
    "pothole": "roads_local",
    "water_supply": "water"
  },

  "tender_sources": [],

  "rti": {
    "fee_inr": 10,
    "response_days": 30
  }
}
```

You don't need to fill everything. Partial configs are fine — they show as "limited data" in the UI rather than breaking.

---

## Step 3: Open a PR

```
cities/
  your-city/
    config.json
    wards.geojson    (if you have it)
    README.md        (optional: notes about data sources, known gaps)
```

PR title: `feat: add [City Name]`

We'll review, ask questions if needed, and merge. The city will appear on kaun.city once live data is confirmed.

---

## What If I Don't Have All the Data?

Ship what you have. A config with just agency names and helplines is still useful — it answers "who do I call?" even without officer names or tender data.

Mark gaps honestly in `data_notes`. The community will fill them over time.

---

## Cities We'd Love Next

- Mumbai (BMC)
- Delhi (MCD)
- Chennai (GCC)
- Hyderabad (GHMC)
- Pune (PMC)
- Ahmedabad (AMC)
- Kolkata (KMC)
