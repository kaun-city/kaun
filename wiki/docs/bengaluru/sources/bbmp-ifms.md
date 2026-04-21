# BBMP IFMS (Integrated Financial Management System)

## Portal

- **URL**: [accounts.bbmp.gov.in/vssifms/](https://accounts.bbmp.gov.in/vssifms/)
- **Public View**: [accounts.bbmp.gov.in/PublicView/](https://accounts.bbmp.gov.in/PublicView/?l=1)
- **Vendor**: Vallabh Software Solutions Pvt Ltd
- **Status**: Active

## What's Available

### Public View (no login required)

Citizens can search by:
- **Ward name** — returns all work orders for that ward
- **Contractor name** — returns all work orders for that contractor across wards
- **Work description** — keyword search
- **Division name** — BBMP administrative division

Returns:
- Work order details (description, ward, division)
- Bill status (pending, cleared, paid)
- Payment receipts (BR/CBR/RTGS references with dates)
- Sanctioned amount, net paid, deductions
- Contractor name with embedded phone number
- Downloadable as **XLSX or PDF** per ward

### Internal System (login required)

- Non-property tax receipts
- Full accounting and MIS reports
- Budget monitoring
- Job number → work order → bill → payment (13 approval levels)

## How kaun.city Uses This Data

Currently **indirect** — via opencity.in which scraped and published BBMP work order data as CKAN datasets:
- `bbmp-work-orders-by-ward-2013-2022` (198 per-ward CSVs)
- `bbmp-work-orders-and-payments-2024-25` (single CSV, 243 wards)

kaun.city ingests these via the `seed-work-orders-full.mjs` script, extracts contractor phone numbers for entity resolution, and builds `contractor_profiles` in Supabase.

## Scraping Notes

- Direct `fetch()` returns 403 — requires browser-like headers or headless browser
- Playwright/Puppeteer approach needed for automated scraping
- Ward-level XLSX exports are the cleanest data extraction path
- Rate limiting unknown — be polite with delays between requests

## Data Quality

- Contractor names have phone numbers embedded (format: `Name9876543210`)
- Some work order IDs are duplicated across wards (shared projects)
- Amounts are in rupees (not lakhs or crores)
- Financial year is encoded in the work order number format: `WARD-YY-XXXXXX`

---
*Last updated: 2026-04-21*
