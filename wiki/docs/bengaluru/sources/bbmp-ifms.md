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

**Direct ingestion** via `scripts/adapters/ifms.mjs`, scheduled weekly (Sundays 02:00 UTC). The adapter talks to the PublicView portal over plain HTTPS and writes into `bbmp_work_orders` with `data_source='ifms_direct'`. No scraping UI is involved — the portal's own XHR endpoints return JSON.

Legacy coverage continues to come from the opencity.in mirror (`seed-work-orders-full.mjs`, FY 2013-2022 + FY 2024-25 CSVs) — those rows carry `data_source='opencity_ckan'` and are left alone.

### Fields captured per work order

From each LoadPaymentGridData row:
- `work_order_id` (wcname, e.g. `001-26-000006`)
- `ward_no` — parsed from the ward rname prefix
- `description` (nameofwork)
- `contractor_code` + `contractor_name` — parsed from the jobcode HTML blob
- `sanctioned_amount` — numeric rupees
- `fy` — derived from wcname (e.g. `001-26-…` → `2025-26`)
- `division` — e.g. *Executive Engineer Yelhanka Zone*
- `budget_head` — e.g. *40041001 Capital Works - Construction/Development/Improvement of Ward Works*
- `start_date`, `end_date` — work order dates
- `order_ref`, `sbr_ref`, `bill_ref` — the three register references with dates
- `payment_status` — where the bill sits in the approval chain (e.g. *Addl. Commr. Finance*)
- `ifms_wbid` — opaque work-bill id for future drill-down

### API endpoints used

All under `https://accounts.bbmp.gov.in/PublicView/vss00CvStatusData.php`:

| Action | Purpose |
|---|---|
| `LoadCombo&pTableName=vssmasters.vss20toward` | Ward list (new GBA + legacy "oo" wards) |
| `LoadFinancialYear&pTableName=vss.vss00tvfinancialyear` | FY registry (filter appears decorative — we grab all) |
| `LoadPaymentGridData` | Grid of work bills for a ward, returned as JSON |
| `LoadWorksbillDetails&pWorkBillID=` | *Not yet ingested* — per-bill detail, approval levels, attachments |

Session is established by a single GET to `/?l=1`, which sets `PHPSESSID` and a `dgLanguage` state the subsequent calls require.

## Technical notes

- The server ships an incomplete TLS chain (missing GoDaddy G2 intermediate). The repo bundles the intermediate at `scripts/adapters/ca/godaddy-g2.pem` and the adapter/workflow pin it via `NODE_EXTRA_CA_CERTS`.
- Ward scheme is in flux: IFMS carries both legacy BBMP 243-ward entries (prefixed `oo`) and the new GBA 369-ward entries (no prefix, rid starting at 2001). The adapter ingests only the new GBA series; the legacy wards are covered by the opencity.in import.
- Not yet pulled from IFMS: `net_paid`, `deduction`, `approval_levels`, attached files. Those would require per-bill drill-downs via `LoadWorksbillDetails` — a follow-up.

## Data Quality

- Contractor names have phone numbers embedded (format: `Name9876543210`)
- Some work order IDs are duplicated across wards (shared projects)
- Amounts are in rupees (not lakhs or crores)
- Financial year is encoded in the work order number format: `WARD-YY-XXXXXX`

---
*Last updated: 2026-04-21*
