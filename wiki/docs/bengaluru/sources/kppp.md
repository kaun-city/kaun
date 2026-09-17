# KPPP (Karnataka Public Procurement Portal)

## Portal

- **URL**: [kppp.karnataka.gov.in](https://kppp.karnataka.gov.in)
- **Status**: Active. Kaun loads tenders from 11 Bengaluru agencies every week.
- **On kaun.city**: the ward card's *Latest corporation tenders* list shows the newest tenders from the ward's GBA city corporation. The list isn't ward-specific, because KPPP tenders aren't reliably tagged to wards.
- **Coverage (17 September 2026)**: 15,756 tenders; the newest was published on 12 September 2026.

## API Endpoints

[`scripts/adapters/kppp.mjs`](https://github.com/kaun-city/kaun/blob/master/scripts/adapters/kppp.mjs) uses KPPP's public tender search. Every endpoint is a `POST` under this base URL:

`https://kppp.karnataka.gov.in/supplier-registration-service/v1/api/`

| Category | Endpoint |
|---|---|
| WORKS | `portal-service/works/search-eproc-tenders` |
| GOODS | `portal-service/search-eproc-tenders` |
| SERVICES | `portal-service/services/search-eproc-tenders` |

- **Query string**: `?page=<n>&size=100&order-by-tender-publish=true`. Pages start at 0, newest tender first.
- **Request body**: `{ "category": "WORKS", "status": "ALL", "deptId": 12607 }`
- **Headers**: `Content-Type: application/json`, with `Origin` and `Referer` set to `https://kppp.karnataka.gov.in/`.
- **Response**: a JSON array of tenders. The `X-Total-Count` header gives the total number of matches.

Try it:

```bash
curl -X POST 'https://kppp.karnataka.gov.in/supplier-registration-service/v1/api/portal-service/works/search-eproc-tenders?page=0&size=10&order-by-tender-publish=true' \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://kppp.karnataka.gov.in' \
  -H 'Referer: https://kppp.karnataka.gov.in/' \
  -d '{"category":"WORKS","status":"ALL","deptId":12607}'
```

### Departments searched

Kaun searches by KPPP department ID, not by title. The `title` search is a loose full-text match that mixes departments. These IDs were checked against KPPP on 10 September 2026. Each agency is searched in all three categories, with a 300 ms pause between pages.

| deptId | Agency |
|---|---|
| 12603 | Bengaluru Central City Corporation |
| 12607 | Bengaluru East City Corporation |
| 12610 | Bengaluru North City Corporation |
| 12608 | Bengaluru South City Corporation |
| 12609 | Bengaluru West City Corporation |
| 5117 | Bengaluru Water Supply And Sewerage Board |
| 1566 | Bengaluru Development Authority |
| 3779 | Bangalore Electricity Supply Company Limited |
| 3583 | Bangalore Metropolitan Transport Corporation |
| 7914 | Bengaluru Solid Waste Management Limited |
| 7234 | Bangalore Metro Rail Corporation Limited |

## Schedule and loading

- **When**: the `refresh-kppp.yml` workflow runs every Sunday at 01:00 UTC (6:30 IST). It can also be run by hand, with an option for a full refresh.
- **Incremental run (default)**: reads the newest `issued_date` already stored, then pages through each search until it reaches older tenders.
- **Full run**: fetches every tender for every department and category.
- **Writes**: tenders are de-duplicated on `kppp_id` (the first agency wins), then upserted into the `tenders` table on `kppp_id`, 200 rows at a time.

## Fields Currently Extracted

| KPPP field | Kaun column | Notes |
|---|---|---|
| `tenderNumber` (or `id`) | `kppp_id` | |
| department searched | `agency` | |
| `title` | `title` | First 500 characters |
| `title` | `ward_no` | First "Ward No." number in the title; see gaps |
| `deptName` | `department` | |
| `ecv` | `value_lakh` | `ecv` is the estimated contract value in rupees, divided by 1,00,000. KPPP returns it for only some tenders, so about 30% of stored tenders have a value |
| `status` | `status` | For example `PUBLISHED`, `UNDER_EVALUATION`, `EVALUATION_COMPLETED`, `AWARDED`, `RETENDERED`, `NO_BIDS_RECIEVED` (KPPP's spelling) and `RECALLED` (shown as *Cancelled*) |
| `publishedDate` | `issued_date` | Sent as `dd-mm-yyyy hh:mm:ss` |
| `tenderClosureDate` | `deadline` | |
| — | `source_url` | The portal's home page |

The search also returns fields Kaun doesn't store yet, including `description`, `workCategoryName`, `locationName`, `tenderType` and `nitId`.

## Known Gaps

- **Awarded contractor**: search results don't include the winning bidder or the awarded value, so `contractor_name` stays empty. Whether a per-tender endpoint exposes them hasn't been checked.
- **Status changes**: an incremental run never re-fetches older tenders. A tender awarded or cancelled after it was first loaded keeps its old status until a full run.
- **Same-day tenders**: an incremental run only fetches tenders published after the newest stored date. Tenders published later on that same day can be missed until a full run.
- **Partial failures**: a failed department or category is logged and skipped, and the run still reports success.
- **Ward numbers**: titles use older BBMP ward numbers and, since 2026, the new corporations' own numbers (for example "Ward No.40 Shakthinagar" from Bengaluru North City Corporation). `ward_no` keeps the first number found and is not matched to a boundary, so Kaun doesn't use it to place tenders on the map.
- **Section 4(g) works**: these are awarded without tendering, so they never appear on KPPP.
- **Subcontractors**: not available through this portal.

---
*Last updated: 2026-09-17*
