# OpenCity.in

## Portal

- **Data portal**: [data.opencity.in](https://data.opencity.in)
- **Analysis site**: [opencity.in](https://opencity.in)
- **Organization**: Open City Foundation
- **API**: CKAN REST API

## Key Datasets for kaun.city

| Dataset | ID | Records | Period |
|---|---|---|---|
| BBMP Work Orders (243 wards) | `bbmp-work-orders-and-payments-2024-25` | 7,240 | 2024-25 |
| BBMP Work Orders (198 wards) | `bbmp-work-orders-by-ward-2013-2022` | ~50,000+ | 2013-2022 |
| BBMP Work Orders Categorised | `bbmp-work-orders-categorised-2018-2023` | Per ward | 2018-2023 |
| BBMP Grievances | `bbmp-grievances-data` | Annual | 2021+ |
| BBMP Budget | `bbmp-budget-2025-26` | City-wide | 2025-26 |
| BBMP Tenders | `bbmp-tenders` | 5 yearly files | 2013-2018 |
| BBMP Registered Contractors | `bbmp-registered-contractors-list` | Civil + Electrical | 2015-2020 |
| MLA LAD Funds | Multiple AC-level CSVs | 28 ACs | 2013-2018 |
| Pothole Complaints | — | Per ward | 2022 |

## API Usage

```bash
# List all datasets
curl "https://data.opencity.in/api/3/action/package_list"

# Get specific dataset
curl "https://data.opencity.in/api/3/action/package_show?id=bbmp-work-orders-and-payments-2024-25"

# Download CSV directly
curl "https://data.opencity.in/dataset/{id}/resource/{resource_id}/download"
```

## Attribution

All opencity.in data is published under open licenses. Always cite:
> Source: opencity.in / Open City Foundation

---
*Last updated: 2026-04-21*
