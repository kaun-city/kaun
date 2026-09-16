/**
 * affidavit-member.mjs — whose affidavit is this?
 *
 * in_mp_affidavits holds the Lok Sabha 2024 GENERAL-ELECTION winner's
 * affidavit for each seat. The seat's sitting member is not always that
 * person, and until September 2026 the loader linked the affidavit to
 * whoever was sitting when it ran. Two seats were wrong that way:
 *   - Wayanad (32-4): Rahul Gandhi's affidavit linked to Priyanka Gandhi Vadra,
 *     who won the November 2024 by-election;
 *   - Nanded (27-16): Vasantrao Chavan's affidavit linked to his son Ravindra,
 *     who won the by-election after his death.
 * kaun.city's MP card showed their declared assets, cases and education as
 * the sitting member's.
 *
 * So mp_id now names the member who FILED the affidavit, and every surface
 * shows it only when that member is the one sitting (apps/web/lib/india/affidavit.ts).
 *
 * How the filer is found, with no name matching (in_mp_affidavits'
 * match_method rules still apply):
 *   1. data/india/ls18-affidavit-owners.csv — a reviewed exception naming the
 *      filer's mpsno. Needed only when the filer's roster row is not at this
 *      seat (a winner of two seats who kept the other).
 *   2. The roster keeps members who died or resigned (status Died/Resigned).
 *      One LS row at the seat: that member. Two rows, one sitting and one
 *      not: the one who left, because the sitting member came in at a
 *      by-election.
 *   3. Anything else — no row, or three or more — has no structural answer
 *      and is left unlinked with a reason for review.
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parseCsv } from "../../lib/parsers.mjs"
import { REPO_ROOT } from "./sink.mjs"

export const AFFIDAVIT_OWNERS_CSV = resolve(REPO_ROOT, "data/india/ls18-affidavit-owners.csv")

/** pc_code -> { owner_mpsno, affidavit_filed_by, rationale, source_url } */
export function loadAffidavitOwners(path = AFFIDAVIT_OWNERS_CSV) {
  const [header, ...rows] = parseCsv(readFileSync(path, "utf8"))
  const out = new Map()
  for (const r of rows) {
    const row = Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""]))
    if (!/^\d+$/.test(row.owner_mpsno)) throw new Error(`${path}: ${row.pc_code} has no owner_mpsno`)
    if (!row.source_url.startsWith("https://")) throw new Error(`${path}: ${row.pc_code} has no source_url`)
    out.set(row.pc_code, { ...row, owner_mpsno: Number(row.owner_mpsno) })
  }
  return out
}

/**
 * The in_mps row of the member who filed a seat's general-election affidavit.
 *
 * lsRows: every in_mps row for the Lok Sabha term, any status
 *         ({ id, mpsno, pc_code, name, status }).
 * Returns { member, method, reason } — member null means leave mp_id unset.
 */
export function affidavitOwner(pcCode, lsRows, owners = new Map()) {
  const exception = owners.get(pcCode)
  if (exception) {
    const member = lsRows.find(r => r.mpsno === exception.owner_mpsno) ?? null
    return member
      ? { member, method: "reviewed_exception", reason: exception.rationale }
      : { member: null, method: null, reason: `reviewed owner mpsno ${exception.owner_mpsno} is not in the roster` }
  }
  const atSeat = lsRows.filter(r => r.pc_code === pcCode)
  if (atSeat.length === 1) return { member: atSeat[0], method: "only_member_of_seat", reason: null }
  if (atSeat.length === 2) {
    const left = atSeat.filter(r => r.status !== "Sitting")
    if (left.length === 1) {
      return { member: left[0], method: "member_before_by_election", reason: null }
    }
  }
  return {
    member: null,
    method: null,
    reason: atSeat.length === 0
      ? "no roster row for this seat"
      : `${atSeat.length} roster rows for this seat; which one filed the general-election affidavit needs a human`,
  }
}

/** mp_id changes that bring existing affidavit rows in line with affidavitOwner(). */
export function planAffidavitRelinks(affidavits, lsRows, owners = new Map()) {
  const byId = new Map(lsRows.map(r => [r.id, r]))
  const sittingAt = new Map(lsRows.filter(r => r.status === "Sitting").map(r => [r.pc_code, r]))
  const changes = []
  const unresolved = []
  for (const a of affidavits) {
    if (!a.pc_code || !a.is_winner) continue
    const { member, method, reason } = affidavitOwner(a.pc_code, lsRows, owners)
    if (!member) { unresolved.push({ id: a.id, pc_code: a.pc_code, candidate_name: a.candidate_name, mp_id: a.mp_id, reason }); continue }
    if (a.mp_id === member.id) continue
    const sitting = sittingAt.get(a.pc_code) ?? null
    changes.push({
      id: a.id,
      pc_code: a.pc_code,
      candidate_name: a.candidate_name,
      from_mp_id: a.mp_id,
      from_member: a.mp_id == null ? null : byId.get(a.mp_id)?.name ?? `unknown id ${a.mp_id}`,
      to_mp_id: member.id,
      to_member: member.name,
      to_member_status: member.status,
      sitting_member: sitting?.name ?? null,
      shown_on_member_card: Boolean(sitting && sitting.id === member.id),
      method,
    })
  }
  return { changes, unresolved }
}
