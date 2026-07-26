# Central projects — cost overruns and stalled work

_Auto-generated on 2026-07-26 by [`scripts/generate-wiki/india-index.mjs`](https://github.com/kaun-city/kaun/blob/master/scripts/generate-wiki/india-index.mjs), reading the kaun.city Supabase tables with the public anon key. Refreshed weekly by the `refresh-india-wiki` workflow; if something looks wrong the source of truth is the database, so please [open an issue](https://github.com/kaun-city/kaun/issues/new) with the seat code and the correction._

MoSPI's Flash Report tracks every central-sector project of **₹150 crore or more** — what it was
sanctioned at, what it now costs, when it was meant to finish and when it now will. MoSPI
publishes the current month; Kaun keeps every month, so what follows is change over time rather
than a status snapshot.

**[Open the interactive tracker on kaun.city →](https://kaun.city/india/projects)** to sort, filter by state and open
any project's full revision history.

---

## First monthly load pending

**Kaun holds no MoSPI Flash Report data yet.** The tables below are generated from
`in_central_projects` and `in_central_project_snapshots`; both are empty at the moment this page
was generated, so there is nothing to rank.

This is the expected state before the first monthly load. The parser is committed
([`scripts/india/mospi/parse_flash_report.py`](https://github.com/kaun-city/kaun/blob/master/scripts/india/mospi/parse_flash_report.py))
and the loader runs monthly on the 5th; the page fills in on the first refresh after that.

Nothing here is a zero — an empty ranking is an empty ranking, and Kaun will not publish a
"top overruns" table whose rows do not exist.

---

## What this page will show

- **Furthest above sanctioned cost** — projects ranked by revised cost minus original cost.
- **Longest unchanged** — projects whose cost, completion date, expenditure and physical
  progress have not moved for the most consecutive monthly reports. A project that stops
  moving is the signal a monthly status report is least able to show.
- **What changed in the latest report** — the cost revisions and schedule slips MoSPI published
  this month, which is the diff MoSPI itself does not publish.

## Sources

| Dataset | Publisher | Notes |
|---|---|---|
| Central projects ≥ ₹150 crore | [MoSPI Flash Report, Table 6 (PAIMANA)](https://www.mospi.gov.in) | Monthly, with a ~7–8 week publication lag. Published with a state column and nothing finer. |

