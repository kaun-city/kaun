/**
 * pc-code.ts — the browser-side mirror of scripts/india/lib/pc-code.mjs.
 *
 * The loaders' copy is canonical (it is also what the in_constituencies
 * pc_code CHECK constraint reproduces). This file exists because the Next
 * app cannot import from scripts/ without dragging the whole loader tree into
 * the bundle, and it carries ONLY the two pure functions the surface needs.
 *
 * tests/india-surface-pc-code.test.mjs imports both modules and asserts they
 * agree across every real (st_code, pc_no) pair plus a set of malformed
 * inputs, so the mirror cannot silently drift from the canonical helper.
 */

/** Census 2011 predates the 2019 bifurcation; 38 is Kaun's Ladakh code. */
export const LADAKH_ST_CODE = 38

/** Canonical PC key: unpadded "<st_code>-<pc_no>", e.g. Bangalore Central = "29-25". */
export function pcCode(stCode: number, pcNo: number): string {
  const s = Number(stCode)
  const p = Number(pcNo)
  if (!Number.isInteger(s) || !Number.isInteger(p) || s < 1 || p < 1) {
    throw new Error(`pcCode: bad (st_code, pc_no) = (${stCode}, ${pcNo})`)
  }
  return `${s}-${p}`
}

/** Inverse of pcCode(). Leading zeros are not canonical and are rejected. */
export function parsePcCode(code: string): { st_code: number; pc_no: number } {
  const m = /^([1-9]\d*)-([1-9]\d*)$/.exec(String(code ?? ""))
  if (!m) throw new Error(`parsePcCode: not a pc_code: ${code}`)
  return { st_code: Number(m[1]), pc_no: Number(m[2]) }
}

/** Non-throwing form for URL params, which arrive as arbitrary strings. */
export function isPcCode(code: string | undefined | null): boolean {
  return /^[1-9]\d*-[1-9]\d*$/.test(String(code ?? ""))
}

/**
 * Sort comparator for pc_codes. Sorting must use the integer pair, never the
 * string: "29-10" sorts before "29-9" lexicographically, which would scramble
 * every seat list in the UI.
 */
export function comparePcCode(a: string, b: string): number {
  const x = parsePcCode(a)
  const y = parsePcCode(b)
  return x.st_code - y.st_code || x.pc_no - y.pc_no
}
