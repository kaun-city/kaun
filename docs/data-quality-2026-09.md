# Data-quality findings from the PR 129 UX review (16 Sep 2026)

Three issues from the review were traced to their tables and fixed in code. The production data is not changed yet: each fix has a dry-run backfill, listed at the end with what it would change.

## 1. The same MP with two education values ("Doctorate" and "Graduate Professional")

**Where the two values came from.** The India MP card (`components/india/MpCard.tsx`) and the wiki seat pages (`scripts/generate-wiki/india-index.mjs`) showed two different fields for one member:

| Shown as | Table.column | Source |
|---|---|---|
| subtitle "· Doctorate" / wiki "Qualification" | `in_mps.qualification` | sansad.in member list API (`api_ls/member`) |
| "Education" | `in_mp_affidavits.education_category` + `education_detail` | ECI nomination affidavit via myneta.info |

**Which is right.** The affidavit. For the reported case, Mallu Ravi (Nagarkurnool, 36-12), MyNeta's page reads "Graduate Professional — M.B.B.S., DLO from Gandhi Medical College, Osmania University in 1981-82", which is what Kaun stored. sansad.in's own biography of him says "M.B.B.S, D.L.O." too; only its list-level `qualification` label says "Doctorate", and it follows the "Dr." title rather than a degree. Across the 540 sitting members, sansad.in says "Doctorate" for 28. For 9 of them the affidavit declares no doctorate, including C M Ramesh (12th Pass) and S Jagathratchakan (10th Pass). Going the other way, 8 sitting members' affidavits list a doctorate (one of them stated as honorary) that sansad.in does not label "Doctorate".

**Found while tracing this, and worse: other people's affidavits on MP cards.** Affidavits were read by seat, and the loader linked each one to whoever held the seat when it ran. After a by-election, that is someone else:
- **Wayanad (32-4):** Priyanka Gandhi Vadra's card showed Rahul Gandhi's declared assets, 18 criminal cases and M.Phil.
- **Nanded (27-16):** Ravindra Chavan's card showed his late father Vasantrao Chavan's declaration.

This also affected the share image and the declared-cases map layer. Separately, 15 public affidavits had no `mp_id` at all.

**Fix.**
- The MP card and the wiki show one education value, taken from the affidavit. `qualification` is no longer read by the web app or the wiki.
- `in_mp_affidavits.mp_id` now means the member who filed the affidavit (`scripts/india/lib/affidavit-member.mjs`). The filer is worked out without name matching:
  - From the roster, which keeps members who died or resigned.
  - For the one case the roster can't answer, from a reviewed, cited exception (`data/india/ls18-affidavit-owners.csv`). That case is Wayanad: Rahul Gandhi won two seats and kept Rae Bareli.
- Every read path (the constituency page, the share image, the map layer and the wiki) shows an affidavit only when its filer is the sitting member (`apps/web/lib/india/affidavit.ts`). By-election winners get an explanation instead.
- The MyNeta loader uses the same rule, so re-running it can't bring the problem back.

## 2. Ward committee meetings above the "possible" count ("56 of ~48")

**The counts are not inflated. The denominator was made up.** `ward_committee_meetings` comes from opencity.in's "BBMP Ward Committee Meetings Aggregate (2020-22)": one count per BBMP-198 ward, with no dates.
- The "~48 possible" had no basis. Two years of monthly meetings is 24, and the bar was actually scaled to 56, the highest count in the file.
- The Karnataka Municipal Corporations (Ward Committee) Rules, 2016, r.5, ask for a meeting every month and allow extra meetings on requisition or urgency. So a monthly schedule is a minimum, not a cap: 80 wards recorded more than 24 meetings and 6 recorded more than 48.
- PR 129 already removed the ratio from the UI and withdrew the table, because it is keyed on BBMP-198 ward numbers.

**Problems found in the source file.** It has 198 rows but covers only 196 wards:
- **Two misfiled rows.** "181 Subhash Nagar, 0" and "145 Chalavadipalya, 0" duplicate wards that already appear under their own numbers (95 with 15 meetings, 138 with 37), and they reuse the numbers of Kumaraswamy Layout and Hombegowda Nagar.
- **Two missing wards.** Wards 64 (Rajamahal Guttahalli) and 104 (Govindaraja Nagar) have no row.

The hand-made production load happened to keep the correct rows. A naive reload would have given Kumaraswamy Layout and Hombegowda Nagar zero meetings, which the ward headline turns into "No ward committee meetings recorded".

**Fix.** `scripts/load-ward-committee-meetings.mjs` is a reproducible loader:
- It drops misfiled copies and never writes a ward that is missing from the file as 0.
- It strips "(SC)"/"(ST)" labels.
- It checks the ward rows against the file's own per-constituency totals.

## 3. `contractor_profiles.blacklist_flags` wording, and flags on the wrong firms

**Wording.** The stored strings used "Rs 4,700 crore" and had no citation. They also said "BBMP blacklisted (twice)" and "continued to receive … same as KRIDL". The cited reporting (Deccan Herald, 24 Jun 2020) says BBMP blacklisted KRIDL once, in 2010, and the Social Welfare Department did so in Oct 2018. The 4(g) figure in the report is ₹4,721 Cr, from a Bengaluru NavaNirmana Party analysis (Deccan Herald, 23 Sep 2020).

**Wrong firms.** The matcher in `scripts/scrape-blacklists.mjs` treated any substring as a match. So profiles whose parsed names were just "L" and "N" (one contract each) matched "KRIDL" and "Karnataka Rural Infrastructure Development", and were publicly flagged as blacklisted. The script also only ever added flags, so a bad match stayed forever. Two writers (that script and `/api/seed-contractors`) wrote different text.

**Fix.** `scripts/lib/contractor-flags.mjs` is now the only place flags are written:
- Each flag states one fact, in neutral words, in "₹ … Cr" form, and ends with "(publisher, d Mon yyyy)". `checkFlag()` refuses anything else.
- Names only match on whole words and only when the name is distinctive.
- The script reconciles: it removes flags nothing supports any more.
- List scrapers run only with `--lists`, and `--apply` refuses to run while a list failed to load.
- The seed route no longer writes flags, and the SpendTab no longer credits them to "KPPP / BBMP official records".

## Backfills (dry-run only; nothing written)

| Command | Dry-run result against production, 16 Sep 2026 |
|---|---|
| `node scripts/india/relink-affidavit-members.mjs` | 17 `mp_id` changes: Wayanad → Rahul Gandhi (129), Nanded → Vasantrao Chavan (29), 12 unlinked rows → the same sitting member, 3 vacant seats → the member who left |
| `node scripts/scrape-blacklists.mjs` | 4 profiles: both KRIDL rows rewritten to 3 cited flags; "L" and "N" cleared |
| `node scripts/load-ward-committee-meetings.mjs` | 1 update: ward 58's constituency "C.V. RAMAN NAGAR (SC)" → "C.V. RAMAN NAGAR"; counts already match the source |

Each takes `--apply` with `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` set. Run the relink and the flag reconcile **before this code deploys**:
- Without the relink, the 12 unlinked seats show "No affidavit matched" (the safe failure), and Wayanad and Nanded keep showing the wrong affidavit.
- Without the flag reconcile, the new "source named on each line" label sits under the old, uncited text.
