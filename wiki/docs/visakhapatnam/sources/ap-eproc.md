# AP e-Procurement

**Awarded contract data, publicly accessible without login.**

## Portal

- **Main**: [apeprocurement.gov.in](https://apeprocurement.gov.in/)
- **Tender portal**: [tender.apeprocurement.gov.in](https://tender.apeprocurement.gov.in/)
- **Status**: Active, public, no login for awarded contract lookup

## At a glance

- Running since 2015
- **5.47 lakh+** tenders published
- **Rs 6,18,500+ crore** in tender value processed
- Top departments by volume: Municipalities (incl. GVMC), Roads & Buildings, Panchayat Raj, Water Resources, AP Industrial Infrastructure Corp

## Why this is the best e-procurement portal in India for civic transparency

Most state e-procurement portals — including Karnataka's KPPP and Telangana's tender portal — lock awarded tender data (winning bidder, awarded amount, contract date) behind a login. The **AP portal exposes awarded contract data publicly**, filterable by department, district, and tender ID.

This is the difference between knowing *what work was put out for tender* and knowing *who actually got the contract and for how much*. Only the second answers "where is the public's money going."

## What kaun.city pulls

Phase 1: **GVMC + VMRDA + Vizag Smart City awarded tenders for the last 3 financial years**, deduplicated and joined to ward where extractable from the work title.

Fields captured per tender:
- Tender ID, title, department, ECV (estimated contract value)
- Published date, closure date, awarded date
- Awardee name (often a contractor firm — feeds entity resolution)
- Awarded amount (the L1 winning bid)
- Status (awarded / completed / cancelled)

Phase 2: **Contractor profiles for AP** — the same entity-resolution pipeline that built 1,300+ profiles for Bengaluru, applied to AP. Phone-number entity matching is harder here (the Bengaluru-style name+phone format is BBMP-specific) so we'll lean on canonicalised name + GST when available.

Phase 3: **Cross-state contractor flagging** — if a Bengaluru-flagged contractor appears in Vizag tenders, surface it. The blacklist data we already cross-reference (GeM suspended sellers, World Bank debarment, CPPP, OpenSanctions) is national, so the same flags apply.

## How we access it

ASP.NET-based portal, no documented public API but stable HTML structure. Aggregators like TendersOnTime and IndianTenders.in already scrape it at scale, proving access is reliable.

The adapter (`scripts/adapters/ap-eproc.mjs`) hits the awarded-tenders search page, paginates through results filtered for Visakhapatnam district, and parses each detail page.

## Filterable URLs

Awarded tenders for GVMC: search → Department: GVMC → Status: Awarded.
Awarded tenders by district: search → District: Visakhapatnam → Status: Awarded.

## Related

- [GVMC eMunicipal](gvmc-emunicipal.md) — citizen tax/services side
- [Open Budgets India — GVMC](openbudgets-gvmc.md) — GVMC's own budget book in structured form
- AP Finance Department: [apfinance.gov.in/budget.html](https://apfinance.gov.in/budget.html)

---
*Last updated: 2026-05-06*
