# Bengaluru Civic Data Wiki

**An open, community-maintained knowledge base of Bengaluru's civic data.**

This wiki is the shared data layer for [kaun.city](https://kaun.city) and other civic tools. Anyone can contribute — add findings, upload RTI responses, document contractor histories, or correct errors.

## How to Contribute

1. **Edit a page** — click any file, hit the pencil icon, make your changes, submit a PR
2. **Add a finding** — create a new file in `findings/` using the [template](findings/_template.md)
3. **Upload an RTI response** — add to `rti-responses/` with the response document and a summary
4. **Document a contractor** — add or update a file in `contractors/`
5. **Correct data** — if something is wrong, fix it and explain in the PR description

All contributions are reviewed before merging. Cite your sources.

## Structure

```
wiki/
├── contractors/        # Contractor profiles with history, aliases, flags
│   ├── kridl.md
│   └── _template.md
├── wards/              # Per-ward civic facts and known issues
│   └── _template.md
├── findings/           # Verified civic findings with sources
│   ├── ghost-workers-scam.md
│   ├── kridl-4g-exemption.md
│   └── _template.md
├── sources/            # Data source documentation
│   ├── bbmp-ifms.md
│   ├── kppp.md
│   └── opencity.md
├── rti-responses/      # Scanned/documented RTI responses
│   └── _template.md
└── data/               # Machine-readable JSON (auto-consumed by kaun.city)
    ├── contractors.json
    └── findings.json
```

## Data Sources

| Source | Portal | What it has | Status |
|---|---|---|---|
| BBMP IFMS | [accounts.bbmp.gov.in](https://accounts.bbmp.gov.in/vssifms/) | Work orders, payments, bills | PublicView accessible |
| KPPP | [kppp.karnataka.gov.in](https://kppp.karnataka.gov.in) | Tenders, procurement | API integrated |
| OpenCity.in | [data.opencity.in](https://data.opencity.in) | Work orders, budgets, grievances | CSV integrated |
| MyNeta | [myneta.info](https://myneta.info) | MLA affidavits, criminal cases | Integrated |
| KGIS | [kgis.ksrsac.in](https://kgis.ksrsac.in) | Trees, clinics, waste centers | Integrated |
| OSM | [openstreetmap.org](https://openstreetmap.org) | Amenities, signals, bus stops | Integrated |
| KSPCB/CPCB | — | Water & air quality | Integrated |
| BNP B-RIGHT | [bright.nammabnp.org](https://bright.nammabnp.org) | 63,629 BBMP projects | Collaboration pending |
| BBMP HRMS | [hrms.bbmp.gov.in](https://hrms.bbmp.gov.in) | Staffing data | Login required (RTI path) |

## License

All data is from public records. Wiki content is [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Code is MIT.

## Links

- **Live platform**: [kaun.city](https://kaun.city)
- **API documentation**: [kaun.city/data](https://kaun.city/data)
- **System status**: [kaun.city/status](https://kaun.city/status)
- **GitHub**: [github.com/kaun-city/kaun](https://github.com/kaun-city/kaun)
