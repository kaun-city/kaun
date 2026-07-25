# Committed source transcriptions

Two of this crosswalk's inputs are **not machine-reproducible**: the Assam 2023
and Jammu & Kashmir 2022 delimitation orders are scanned gazette PDFs with **no
embedded text layer**, so `pdftotext`/`pdfjs` return nothing. Their Table B
(the PC → constituent-AC table) was transcribed by reading the rendered pages.

Those transcriptions live here rather than outside the repo, because without
them `scripts/india/build-pc-crosswalk.mjs` cannot rebuild the 19 seats they
cover. Everything else the builder reads — the 2008 Order PDF, the PC/AC/district
geometry — is parsed deterministically from bulk sources that stay out of git
(see `../METHODOLOGY.md` for their provenance and URLs).

| File | Rows | Covers |
|---|---|---|
| `assam_pc_ac.csv` | 126 | all 14 Assam PCs, ACs 1–126 |
| `jk_pc_ac.csv` | 90 | all 5 Jammu & Kashmir PCs, ACs 1–90 |

Every row carries the gazette page it was read from (`source`) and a
transcription `confidence`.

## Provenance

**Assam Delimitation Order, 2023**
- Gazette of India, Part II, Section 3(iii), Extraordinary, **11 August 2023**;
  Assam State Gazette, Extraordinary, same date
- ECI Notification **No. 282/AS/2023(परिसीमन)/खंड.V** ("Order No. 2")
- Signed by CEC Rajiv Kumar with ECs Arun Goel and Anup Chandra Pandey
- Copy: `https://ceoassam.nic.in/Final_Order_and_Notification.pdf` (82 pp., 6.9 MB,
  official Chief Electoral Officer, Assam mirror). Table B is on pp. 81–82.

**Jammu and Kashmir Delimitation Order, 2022**
- J&K Official Gazette, Vol. 135, No. 5-2, **5 May 2022**, Part II-C
- Delimitation Commission Notification **No. 282/J&K/2022 (Vol. IV)**
  ("Order No. 2"), under s.10 of the Delimitation Act, 2002 and Part V of the
  J&K Reorganisation Act, 2019
- Signed by Chairperson Justice (Retd.) Ranjana Prakash Desai, CEC Sushil
  Chandra and SEC Kewal Kumar Sharma
- Copy: `https://cdn.s3waas.gov.in/s330ef30b64204a3088a26bc2e6ecf7602/uploads/2022/05/2022051069.pdf`
  (District Election Officer, Anantnag mirror). Table B is on gazette pp. 16–17.

`eci.gov.in` 403s automated fetches for both documents; the government mirrors
above host the same gazette notification numbers.

## Verification

The builder asserts these files on every run and refuses to publish silently if
any check fails:

- AC numbers form a complete sequence with no gaps and no duplicates
  (Assam 1–126, J&K 1–90), each AC in exactly one PC
- reserved-seat tallies match the orders' own recitals — Assam **9 SC + 19 ST**
  assembly seats and **1 SC + 2 ST** parliamentary seats, J&K **7 SC + 9 ST**
  assembly seats and **0 reserved** parliamentary seats
- PC numbering and names reconcile with the current 543-seat spine

## Known gap

The J&K copy is a DEO-compiled bundle: **Table B is complete**, but Table A
(the ward/tehsil-level extent of each of the 90 ACs) is only partially present.
That affects sub-AC granularity, not this crosswalk. A complete copy of
Notification No. 282/J&K/2022 (Vol. IV) would close it.

AC name spellings were read from page images, so minor punctuation variants
(`R.S.Pura-Jammu South` vs `R.S. Pura–Jammu South`) are cosmetic. Every row
cites its source page, so any name is checkable against the gazette in minutes.
