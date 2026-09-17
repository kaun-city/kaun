# blr-tenders-bids (tenders and awarded suppliers)

## Dataset

- **Source**: [Vonter/blr-tenders-bids](https://github.com/Vonter/blr-tenders-bids), an open dataset by Vonter. The same data powers [TenderSir](https://tendersir.bengawalk.com).
- **Scraped from**: the [Karnataka Public Procurement Portal (KPPP)](https://kppp.karnataka.gov.in) and the older [Karnataka eProcurement portal](https://eproc.karnataka.gov.in), including each tender's detail and award pages.
- **Bodies**: BBMP, GBA, GBDA, BDA, BMRDA, BWSSB, BESCOM, BMTC, BMRCL, BSMILE, BSWML, BNGSCL, BMTF and the five city corporations (BCCC, BECC, BNCC, BSCC, BWCC).
- **Licence**: [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Some tender documents remain under their publishers' copyright.
- **On kaun.city**: not shown on the map yet. The tables are loaded so tender awards can be added to ward and contractor views.

## What it adds to Kaun

Kaun's own [KPPP job](kppp.md) stores tenders from KPPP search results. Those results have no winner or awarded value, and they start in May 2023. This dataset adds:

- **Who won**: awarded supplier names, for 50,000 tenders.
- **Award amounts**: the sum of the selected bids, for eProc tenders.
- **History**: eProc tenders from 2009 to April 2023, and about 11,000 BBMP tenders on KPPP (May 2023 – February 2026) that Kaun's job doesn't search.

Snapshot generated 21 August 2026:

| Portal | Tenders | Published | With awarded suppliers | With award amount |
|---|---|---|---|---|
| eProc | 104,955 | May 2009 – Apr 2023 | 44,708 | 43,637 |
| KPPP | 26,596 | May 2023 – Aug 2026 | 5,002 | none |

**Winners, not bidders.** The dataset lists the suppliers a tender was awarded to. It does not list everyone who bid, so it can't show single-bid tenders. Its `bidder_count` and `bidders` fields count bid groups (KPPP packages) or selected award lines (eProc), not bidders, so Kaun doesn't load them.

## Tables

| Table | One row per | Key |
|---|---|---|
| `procurement_tenders` | tender | `source` (`kppp` or `eproc`), `tender_number` |
| `procurement_tender_winners` | awarded supplier of a tender | `source`, `tender_number`, `position` |

`procurement_tenders` columns:

| Column | From the dataset | Notes |
|---|---|---|
| `source`, `tender_number` | same | Unique together. The same number can exist on both portals |
| `title`, `department`, `category`, `location`, `procurement_method` | same | `department` uses the dataset's canonical names |
| `status`, `status_label` | same | For example `AWARDED` / *Awarded*, `RETENDERED`, `CANCELLED`, `NO_BIDS_RECEIVED` |
| `published_at`, `closes_at` | same | |
| `awarded_at` | same | KPPP only |
| `estimated_value_inr` | `estimated_value`, else `tender_value` | Rupees |
| `award_amount_inr` | `award_amount` | Rupees, eProc only |
| `awarded_bidders` | same | Supplier names in the dataset's order |
| `is_retendered` | same | KPPP only: true on later calls, otherwise empty |
| `call_number` | same | 2 or more for a re-tender |
| `notice_id`, `tender_id` | same | KPPP only; scoped to a category, so not usable alone as a key |
| `dataset_generated_at` | file metadata `generated_at` | The snapshot the row came from |

`procurement_tender_winners` repeats each name from `awarded_bidders` with its `position` (1 for the first) and a `supplier_key`: the name in lower case with everything except letters and digits removed. For example, `S NAGARAJAPPA( SHREE GANAPATHI ENGINEERS )` becomes `snagarajappashreeganapathiengineers`. The key only merges differences in case and punctuation. Different spellings of the same company stay separate.

Not loaded: contact names and phone numbers, corrigenda, addenda, document lists, fees and deposits, bid groups, and the raw portal JSON.

**Joining to Kaun's KPPP tenders**: `procurement_tenders.tender_number = tenders.kppp_id` where `source = 'kppp'`. On 17 September 2026, 15,214 of Kaun's 15,756 tenders matched. The rest were mostly published after the snapshot. Keep the two tables separate: the ward card counts `tenders` by department, and the KPPP job reads its newest `issued_date`.

## Schedule and loading

- **When**: the `refresh-tenders-bids.yml` workflow runs every Sunday at 05:30 UTC. Run by hand, it defaults to a dry run.
- **Download**: `data/tenders.parquet` from the dataset's GitHub repository, about 24 MB. The loader is [`scripts/adapters/blr-tenders-bids.mjs`](https://github.com/kaun-city/kaun/blob/master/scripts/adapters/blr-tenders-bids.mjs).
- **Compare**: the file's `generated_at` against the loaded `dataset_generated_at`. The job writes nothing if the snapshot is unchanged or older. It refuses a snapshot with fewer than 90% of the loaded rows unless run with `force`.
- **Replace**: the rows are staged in `procurement_tenders_staging`, then one transaction replaces both tables. The job checks the row counts after the swap. A failure leaves the previous snapshot in place.

## Known Gaps

- **Republished by hand**: the GitHub dataset is not updated on a schedule. On 17 September 2026 its snapshot was from 21 August. TenderSir's own files update daily, but their format is internal to that site, so Kaun doesn't read them.
- **KPPP awards**: only 5,002 of 26,596 KPPP tenders have a supplier, mostly those marked *Awarded*. KPPP doesn't publish the awarded amount.
- **eProc award dates**: not available.
- **Supplier identity**: names are as published. There is no registration number to link a supplier to a contractor in BBMP work orders.
- **Wards**: tenders carry an office or location, not a ward.

## Attribution

Credit the dataset wherever these tables or anything built from them is shown:

> Tender and award data: [blr-tenders-bids](https://github.com/Vonter/blr-tenders-bids) by Vonter, from KPPP and Karnataka eProcurement, under the [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/).

Kaun offers `procurement_tenders` and `procurement_tender_winners`, as adapted from the dataset, under the same Open Database License.

---
*Last updated: 2026-09-17*
