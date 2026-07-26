# Nagaon — Lok Sabha, Assam

_`18-9` · नौगांव · General seat · 8 assembly segments_

**[Open Nagaon on kaun.city →](https://kaun.city/india/c/18-9)** for the interactive view — the seat
on the national map, the choropleth layers (declared cases, MPLADS utilization, attendance) and
side-by-side comparison against any other seat.

---

## Identity

| Field | Value |
|---|---|
| Kaun seat key | `18-9` |
| State / UT | Assam |
| Seat number within the state | 9 |
| Reservation | General (source: `2008-delimitation-order-table-b`) |
| Name (Hindi) | नौगांव |
| Districts | Marigaon (53%), Nagaon (43%), Karbi Anglong (4%), Kamrup Metropolitan (1%) _(share of the seat's area by district, measured from polygon overlap — this state was re-delimited after 2008 and only the newer order's seat composition was transcribed, without district headings)_ |
| Assembly segments | 8 |
| Wikidata | [Q1606595](https://www.wikidata.org/wiki/Q1606595) |
| Crosswalk verification | divergent |
| Boundary source | `shijithpk-2024` |

_Reservation is shown only when it comes from the Delimitation Order. Kaun does not repeat the
SC/ST flags published in boundary files and roster APIs, because both were checked and both
undercount ST seats._

---

## Assembly segments

8 assembly constituencies make up this Lok Sabha seat, as listed in Table B of the delimitation order in force for this state.

| AC # | Assembly constituency | Reserved | District (per the Order) | Independent polygon check |
|---:|---|---|---|---|
| 52 | Jagiroad | SC | — | agrees |
| 53 | Laharighat | — | — | agrees |
| 54 | Morigaon | — | — | not testable |
| 55 | Dhing | — | — | ⚠ polygon puts it in Assam 11-Sonitpur |
| 56 | Rupahihat | — | — | not testable |
| 58 | Samaguri | — | — | ⚠ polygon puts it in Assam 10-Kaziranga |
| 60 | Nagaon-Batadraba | — | — | not testable |
| 61 | Raha | SC | — | agrees |

_Independent check: 3 of 5 testable segments agree with the polygon geometry; 3 could not be tested. Where the text and the
geometry disagree the order's text is the fixed point — the published AC boundaries predate the
2008 delimitation in several states. Every disagreement is published rather than hidden; see the
[crosswalk page](../pc-crosswalk.md)._

---

## Who holds this seat

**This seat is vacant.** The bypoll to fill it has not been held, or its result has not reached
the roster yet. Kaun keeps the predecessor's record and names them below, but never presents a
former member as the current MP.

| Previous member | Party | Left the seat as | Term |
|---|---|---|---|
| Pradyut Bordoloi ([profile](https://sansad.in/ls/members/biography/5108)) | Indian National Congress | Resigned | LS18 |

_Pradyut Bordoloi is recorded with status `Resigned`. The database enforces at most one sitting member per seat, so a predecessor row can never be mistaken for the incumbent._

---

## Declared record

**Affidavit not published yet.** Kaun serves a nomination affidavit only once its MyNeta↔seat join has been reviewed by a human and the source page has parsed cleanly — unreviewed rows are hidden by a database policy, not by this page. Attaching a criminal-case count to the wrong person is the failure this guards against, so the count is withheld rather than guessed.

The underlying declarations are public at [myneta.info](https://myneta.info) in the meantime.

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

## Central projects in Assam

MoSPI reports central projects **by state only**. These are the state's projects, not this constituency's — no district or constituency breakdown exists in the source, and Kaun does not guess one from a project's name.

**No central projects loaded for Assam yet.** MoSPI's Flash Report tracks every central
project of ₹150 crore or more and publishes monthly with a ~7–8 week lag; the first load is
pending, or this state has no projects in the latest report Kaun holds.

---

## Sources

| Dataset | Publisher | Notes |
|---|---|---|
| Seat identity and boundaries (543) | [DataMeet + shijithpk 2024 supplement](https://github.com/datameet/maps/tree/master/parliamentary-constituencies) | 2008 delimitation, with the 2022 J&K and 2023 Assam orders applied. Assam, J&K and Ladakh outlines were re-georeferenced from ECI press-note PDFs and are not survey-grade. |
| Assembly segments and districts (crosswalk `2008do+2023as+2022jk-2026.07`) | [Kaun, from ECI Delimitation Orders 2008 / 2022-J&K / 2023-Assam](../pc-crosswalk.md) | Table B of the order in force for each state, parsed and then independently verified against AC/PC/district polygons. |
| MP roster — 18th Lok Sabha | [sansad.in (Lok Sabha Secretariat)](https://sansad.in) | sansad.in publishes constituency names with no seat number. Names resolve to a `pc_code` through an alias table and exact normalized matching only — never by similarity. |

_Auto-generated on 2026-07-26 by [`scripts/generate-wiki/india-index.mjs`](https://github.com/kaun-city/kaun/blob/master/scripts/generate-wiki/india-index.mjs), reading the kaun.city Supabase tables with the public anon key. Refreshed weekly by the `refresh-india-wiki` workflow; if something looks wrong the source of truth is the database, so please [open an issue](https://github.com/kaun-city/kaun/issues/new) with the seat code and the correction._
