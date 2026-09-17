# blr-tenders-bids (tenders and awarded suppliers)

## Dataset

- **Source**: [Vonter/blr-tenders-bids](https://github.com/Vonter/blr-tenders-bids), an open dataset by Vonter. The same data powers [TenderSir](https://tendersir.bengawalk.com).
- **Scraped from**: the [Karnataka Public Procurement Portal (KPPP)](https://kppp.karnataka.gov.in) and the older [Karnataka eProcurement portal](https://eproc.karnataka.gov.in), including each tender's detail and award pages.
- **Bodies**: BBMP, GBA, GBDA, BDA, BMRDA, BWSSB, BESCOM, BMTC, BMRCL, BSMILE, BSWML, BNGSCL, BMTF and the five city corporations (BCCC, BECC, BNCC, BSCC, BWCC).
- **Licence**: [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Some tender documents remain under their publishers' copyright.
- **On kaun.city**: the ward card's contractor list shows the tenders a contractor won under its company name. See [Contractor matches](#contractor-matches).

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

## Contractor matches

The ward card lists contractors from BBMP work orders (`contractor_profiles`). Neither those records nor this dataset carry a registration number, so a contractor is linked to tenders only by name. A wrong link would put one firm's tenders on another, so the rules only match firm names that identify one firm. They live in [`scripts/lib/tender-supplier-matches.mjs`](https://github.com/kaun-city/kaun/blob/master/scripts/lib/tender-supplier-matches.mjs):

- **Firm names only.** The name must contain a trade word such as CONSTRUCTIONS, ENTERPRISES, INFRA or PVT LTD. Personal names are never matched. "ANANDA KUMAR" wins 79 tenders in the dataset, very likely as several people.
- **A rare word.** The name must contain a word that appears in at most 5 of the dataset's 2,433 firm names. BALAJI appears in 11 and MANJUNATHA in 17, so "BALAJI CONSTRUCTIONS" matches nothing.
- **One person.** KPPP writes a winner as `PERSON( COMPANY )`. A company name that KPPP shows under two different people matches nothing ("SRI SAI CONSTRUCTIONS" appears under three). The person part is never matched.
- **Same name.** The names must be equal after ignoring case, spacing, punctuation, "M/S" and legal forms. "SRI" is kept, because it is part of many firm names.
- **Cut-off names.** BBMP's exports cut names at 20 characters, e.g. "SAMRUDHI CONSTRUCTIO". Such a name matches only if exactly one identifiable firm name begins that way.
- **Aliases.** A contractor can match through any of the names Kaun lists under it. The card then says which name matched.

On 17 September 2026 these rules matched 182 of Kaun's 1,305 contractors to 4,706 tenders.

| Table or function | What it holds |
|---|---|
| `contractor_supplier_matches` | One row per contractor (`contractor_profile_id`) and supplier name (`supplier_key`). Also `matched_name` and `match_kind` (`exact`, or `truncated` for a cut-off name) |
| `contractor_tender_wins(p_entity_ids)` | For each matched contractor: the number of tenders won, how many have a published amount and their total, first and last year, the names that matched, how the winners were published, and the five latest |

The weekly job rebuilds the matches on every run, even when the dataset hasn't changed, so new contractor profiles are picked up.

## Schedule and loading

- **When**: the `refresh-tenders-bids.yml` workflow runs every Sunday at 05:30 UTC. Run by hand, it defaults to a dry run.
- **Download**: `data/tenders.parquet` from the dataset's GitHub repository, about 24 MB. The loader is [`scripts/adapters/blr-tenders-bids.mjs`](https://github.com/kaun-city/kaun/blob/master/scripts/adapters/blr-tenders-bids.mjs).
- **Compare**: the file's `generated_at` against the loaded `dataset_generated_at`. The job writes nothing if the snapshot is unchanged or older. It refuses a snapshot with fewer than 90% of the loaded rows unless run with `force`.
- **Replace**: the rows are staged in `procurement_tenders_staging`, then one transaction replaces both tables. The job checks the row counts after the swap. A failure leaves the previous snapshot in place.
- **Rematch**: contractor matches are rebuilt from the loaded snapshot in their own transaction. The job refuses to write if no contractor matches at all.

## Known Gaps

- **Republished by hand**: the GitHub dataset is not updated on a schedule. On 17 September 2026 its snapshot was from 21 August. TenderSir's own files update daily, but their format is internal to that site, so Kaun doesn't read them.
- **KPPP awards**: only 5,002 of 26,596 KPPP tenders have a supplier, mostly those marked *Awarded*. KPPP doesn't publish the awarded amount.
- **eProc award dates**: not available.
- **Supplier identity**: names are as published. With no registration number, contractor matches are by name only, under the rules above. The card says so and shows how each winner was published.
- **Wards**: tenders carry an office or location, not a ward.

## Attribution

Credit the dataset wherever these tables or anything built from them is shown:

> Tender and award data: [blr-tenders-bids](https://github.com/Vonter/blr-tenders-bids) by Vonter, from KPPP and Karnataka eProcurement, under the [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/).

Kaun offers `procurement_tenders` and `procurement_tender_winners`, as adapted from the dataset, under the same Open Database License.

---
*Last updated: 2026-09-17*
