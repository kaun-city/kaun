# South Delhi — Lok Sabha, Delhi

_`7-7` · दक्षिण दिल्ली · General seat · 10 assembly segments_

**[Open South Delhi on kaun.city →](https://kaun.city/india/c/7-7)** for the interactive view — the seat
on the national map, the choropleth layers (declared cases, MPLADS utilization, attendance) and
side-by-side comparison against any other seat.

---

## Identity

| Field | Value |
|---|---|
| Kaun seat key | `7-7` |
| State / UT | Delhi |
| Seat number within the state | 7 |
| Reservation | General (source: `2008-delimitation-order-table-b`) |
| Name (Hindi) | दक्षिण दिल्ली |
| Districts | South (80%), South West (20%) _(share of the seat's area by district, measured from polygon overlap — this state was re-delimited after 2008 and only the newer order's seat composition was transcribed, without district headings)_ |
| Assembly segments | 10 |
| Wikidata | [Q7567023](https://www.wikidata.org/wiki/Q7567023) |
| Crosswalk verification | mostly-verified |
| Boundary source | `datameet` |

_Reservation is shown only when it comes from the Delimitation Order. Kaun does not repeat the
SC/ST flags published in boundary files and roster APIs, because both were checked and both
undercount ST seats._

---

## Assembly segments

10 assembly constituencies make up this Lok Sabha seat, as listed in Table B of the delimitation order in force for this state.

| AC # | Assembly constituency | Reserved | District (per the Order) | Independent polygon check |
|---:|---|---|---|---|
| 36 | Bijwasan | — | — | ⚠ polygon puts it in Delhi 6-West Delhi |
| 37 | Palam | — | — | ⚠ polygon puts it in Delhi 6-West Delhi |
| 45 | Mehrauli | — | — | agrees |
| 46 | Chhatarpur | — | — | agrees |
| 47 | Deoli | SC | — | agrees |
| 48 | Ambedkar Nagar | SC | — | agrees |
| 49 | Sangam Vihar | — | — | agrees |
| 51 | Kalkaji | — | — | agrees |
| 52 | Tughlakabad | — | — | agrees |
| 53 | Badarpur | — | — | agrees |

_Independent check: 8 of 10 testable segments agree with the polygon geometry. Where the text and the
geometry disagree the order's text is the fixed point — the published AC boundaries predate the
2008 delimitation in several states. Every disagreement is published rather than hidden; see the
[crosswalk page](../pc-crosswalk.md)._

---

## Who holds this seat

**Ramvir Singh Bidhuri** (Bharatiya Janata Party) holds this seat.

| Field | Value |
|---|---|
| Name | Ramvir Singh Bidhuri |
| Party | Bharatiya Janata Party (BJP) |
| Term | LS18 |
| Status | Sitting |
| Terms served | 1 |
| Age | 73 |
| Gender | Male |
| Qualification | Graduate |
| Profession | Agriculturist; BUSINESSPERSON |
| Official profile | [sansad.in](https://sansad.in/ls/members/biography/5543) |


---

## Declared record

From the winning candidate's Election Commission nomination affidavit. **Self-declared** — Kaun
reproduces the declaration, it does not verify it.

| Declared | Value |
|---|---|
| Election | LokSabha2024 |
| Candidate as named on the affidavit | Ramvir Singh Bidhuri |
| Pending criminal cases | ⚠ 1 |
| Total assets | ₹52.64 Cr |
| Liabilities | ₹10.00 L |
| Education | Graduate — B.A. from Deshbandu Gupta Collage, Delhi University In 1973 |
| Profession (self-declared) | Business & Social Service |
| Age at nomination | 71 |
| Affidavit source | [myneta.info](https://myneta.info/LokSabha2024/candidate.php?candidate_id=7907) |

!!! warning "A pending case is an accusation, not a conviction"
    These are cases the candidate declared as pending against them when filing nomination.
    Indian law presumes innocence until conviction, and a count says nothing about the
    seriousness of the charges or who brought them.


---

## In Parliament

**Parliamentary activity has not been loaded for this seat yet.** The attendance, questions and
debate figures come from PRS MP Track and sansad.in on a separate cadence to the roster; this
section fills in on the next refresh once that pipeline has run.

Nothing here is a zero. An absent figure is absent, and Kaun will not render it as 0 —
that is the difference between "not recorded" and "did nothing".

---

## Local area development funds (MPLADS)

**MPLADS figures have not been loaded for this seat yet.** Each MP is entitled to recommend works
worth ₹5 crore a year in their constituency; the allocation, the release and the unspent balance
come from eSAKSHI (MoSPI) on a weekly cadence, and this section fills in once that pipeline has run.

---

## Central projects in Delhi

MoSPI reports central projects **by state only**. These are the state's projects, not this constituency's — no district or constituency breakdown exists in the source, and Kaun does not guess one from a project's name.

**No central projects loaded for Delhi yet.** MoSPI's Flash Report tracks every central
project of ₹150 crore or more and publishes monthly with a ~7–8 week lag; the first load is
pending, or this state has no projects in the latest report Kaun holds.

---

## Sources

| Dataset | Publisher | Notes |
|---|---|---|
| Seat identity and boundaries (543) | [DataMeet + shijithpk 2024 supplement](https://github.com/datameet/maps/tree/master/parliamentary-constituencies) | 2008 delimitation, with the 2022 J&K and 2023 Assam orders applied. Assam, J&K and Ladakh outlines were re-georeferenced from ECI press-note PDFs and are not survey-grade. |
| Assembly segments and districts (crosswalk `2008do+2023as+2022jk-2026.07`) | [Kaun, from ECI Delimitation Orders 2008 / 2022-J&K / 2023-Assam](../pc-crosswalk.md) | Table B of the order in force for each state, parsed and then independently verified against AC/PC/district polygons. |
| MP roster — 18th Lok Sabha | [sansad.in (Lok Sabha Secretariat)](https://sansad.in) | sansad.in publishes constituency names with no seat number. Names resolve to a `pc_code` through an alias table and exact normalized matching only — never by similarity. |
| Criminal cases, assets, education | [ECI nomination affidavits via myneta.info (ADR)](https://myneta.info) | Self-declared by the candidate. Kaun reproduces the declaration; it does not verify it. |

_Auto-generated on 2026-07-26 by [`scripts/generate-wiki/india-index.mjs`](https://github.com/kaun-city/kaun/blob/master/scripts/generate-wiki/india-index.mjs), reading the kaun.city Supabase tables with the public anon key. Refreshed weekly by the `refresh-india-wiki` workflow; if something looks wrong the source of truth is the database, so please [open an issue](https://github.com/kaun-city/kaun/issues/new) with the seat code and the correction._
