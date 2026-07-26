# Alwar — Lok Sabha, Rajasthan

_`8-8` · अलवर · General seat · 8 assembly segments_

**[Open Alwar on kaun.city →](https://kaun.city/india/c/8-8)** for the interactive view — the seat
on the national map, the choropleth layers (declared cases, MPLADS utilization, attendance) and
side-by-side comparison against any other seat.

---

## Identity

| Field | Value |
|---|---|
| Kaun seat key | `8-8` |
| State / UT | Rajasthan |
| Seat number within the state | 8 |
| Reservation | General (source: `2008-delimitation-order-table-b`) |
| Name (Hindi) | अलवर |
| Districts | Alwar |
| Assembly segments | 8 |
| Wikidata | [Q4738368](https://www.wikidata.org/wiki/Q4738368) |
| Crosswalk verification | divergent |
| Boundary source | `datameet` |

_Reservation is shown only when it comes from the Delimitation Order. Kaun does not repeat the
SC/ST flags published in boundary files and roster APIs, because both were checked and both
undercount ST seats._

---

## Assembly segments

8 assembly constituencies make up this Lok Sabha seat, as listed in Table B of the delimitation order in force for this state.

| AC # | Assembly constituency | Reserved | District (per the Order) | Independent polygon check |
|---:|---|---|---|---|
| 59 | Tijara | — | Alwar | agrees |
| 60 | Kishangarh Bas | — | Alwar | agrees |
| 61 | Mundawar | — | Alwar | agrees |
| 62 | Behror | — | Alwar | agrees |
| 65 | Alwar Rural | SC | Alwar | ⚠ polygon puts it in Rajasthan 9-Bharatpur |
| 66 | Alwar Urban | — | Alwar | ⚠ polygon puts it in Rajasthan 9-Bharatpur |
| 67 | Ramgarh | — | Alwar | ⚠ polygon puts it in Rajasthan 9-Bharatpur |
| 68 | Rajgarh –Laxmangarh | ST | Alwar | ⚠ polygon puts it in Rajasthan 9-Bharatpur |

_Independent check: 4 of 8 testable segments agree with the polygon geometry. Where the text and the
geometry disagree the order's text is the fixed point — the published AC boundaries predate the
2008 delimitation in several states. Every disagreement is published rather than hidden; see the
[crosswalk page](../pc-crosswalk.md)._

---

## Who holds this seat

**Bhupender Yadav** (Bharatiya Janata Party) holds this seat.

| Field | Value |
|---|---|
| Name | Bhupender Yadav |
| Party | Bharatiya Janata Party (BJP) |
| Term | LS18 |
| Status | Sitting |
| Terms served | 1 |
| Age | 57 |
| Gender | Male |
| Qualification | Graduate |
| Profession | Advocate; POLITICIAN |
| Minister | yes — This MP is a minister. Ministers represent the government in debates, so we do not report their participation. They do not sign the attendance register, ask questions, or introduce private member bills. Data corresponds to the period from 24-06-2024 to 18-04-2026. |
| Official profile | [sansad.in](https://sansad.in/ls/members/biography/5541) |


---

## Declared record

From the winning candidate's Election Commission nomination affidavit. **Self-declared** — Kaun
reproduces the declaration, it does not verify it.

| Declared | Value |
|---|---|
| Election | LokSabha2024 |
| Candidate as named on the affidavit | Bhupender Yadav |
| Pending criminal cases | none declared |
| Total assets | ₹2.32 Cr |
| Liabilities | — |
| Education | Graduate Professional — LLB in 1993 from Govt College Ajmer , University of Ajmer |
| Profession (self-declared) | Public Life, Political Activity |
| Age at nomination | 55 |
| Affidavit source | [myneta.info](https://myneta.info/LokSabha2024/candidate.php?candidate_id=360) |


---

## In Parliament

**Not recorded for ministers.**

Ministers and the Speaker do not sign the attendance register, do not ask questions and do not introduce private member bills. Their metrics are recorded as **not applicable — never as zero**, because a zero here would read as absenteeism and would be false.

_Recorded reason: This MP is a minister. Ministers represent the government in debates, so we do not report their participation. They do not sign the attendance register, ask questions, or introduce private member bills. Data corresponds to the period from 24-06-2024 to 18-04-2026.._

---

## Local area development funds (MPLADS)

**MPLADS figures have not been loaded for this seat yet.** Each MP is entitled to recommend works
worth ₹5 crore a year in their constituency; the allocation, the release and the unspent balance
come from eSAKSHI (MoSPI) on a weekly cadence, and this section fills in once that pipeline has run.

---

## Central projects in Rajasthan

MoSPI reports central projects **by state only**. These are the state's projects, not this constituency's — no district or constituency breakdown exists in the source, and Kaun does not guess one from a project's name.

**No central projects loaded for Rajasthan yet.** MoSPI's Flash Report tracks every central
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
