# KPPP (Karnataka Public Procurement Portal)

## Portal

- **URL**: [kppp.karnataka.gov.in](https://kppp.karnataka.gov.in)
- **Status**: Active, API integrated into kaun.city

## API Endpoints

kaun.city's `refresh-kppp.mjs` script calls these REST endpoints:

| Category | Endpoint |
|---|---|
| WORKS | `portal-service/works/search-eproc-tenders` |
| GOODS | `portal-service/search-eproc-tenders` |
| SERVICES | `portal-service/services/search-eproc-tenders` |

Request body: `{ category: "WORKS", status: "ALL", title: "BBMP" }`

## Fields Currently Extracted

- `tenderNumber` → `kppp_id`
- `title` → `title` (ward number extracted via regex)
- `deptName` → `department`
- `ecv` → `value_lakh` (converted from paise)
- `status` → `status`
- `publishedDate` → `issued_date`
- `tenderClosureDate` → `deadline`

## Known Gaps

- **Awarded contractor name** — not extracted. The API likely returns this for tenders with status "AWARDED" but the current scraper doesn't capture it.
- **BWSSB/BDA tenders** — searches for these return 400 errors. Likely need different request body format.
- **Subcontractor data** — not available through this portal.
- **Section 4(g) projects** — these bypass KPPP entirely, so they will never appear in tender data.

## How to Investigate Further

1. Open kppp.karnataka.gov.in in Chrome
2. Filter tenders by status "Awarded"
3. Open Chrome DevTools → Network tab
4. Click on an awarded tender
5. Look for the API response — the contractor/awardee field name will be visible

---
*Last updated: 2026-04-21*
