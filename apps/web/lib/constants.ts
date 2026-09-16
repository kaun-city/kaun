/**
 * The BBMP-225 ↔ DataMeet-243 ward crosswalk asset, and the version recorded
 * inside it. next.config.ts serves the file `immutable` for a year, which is
 * only correct while the URL names the version — bump this when the crosswalk
 * is rebuilt. tests/cities-registry.test.mjs asserts the two agree.
 */
export const WARD_CROSSWALK_VERSION = "2023f-2026.05"
export const WARD_CROSSWALK_URL = `/bengaluru-ward-crosswalk.json?v=${WARD_CROSSWALK_VERSION}`

/**
 * Current GBA-369 -> historical DataMeet-243 overlap asset. This version is
 * part of the URL because the public file is served with an immutable cache.
 */
export const GBA_CROSSWALK_VERSION = "gba369-dm243-2026.09"
export const GBA_CROSSWALK_URL = `/bengaluru-gba-369-to-datameet-243.json?v=${GBA_CROSSWALK_VERSION}`

/**
 * BBMP-198 (2010 delimitation) -> DataMeet-243 overlap asset. The spend,
 * pothole and ward committee tables are keyed on the 198-ward map and reach
 * a ward only through it. Versioned URL: the file is served immutable.
 */
export const BBMP198_CROSSWALK_VERSION = "bbmp198-dm243-2026.09"
export const BBMP198_CROSSWALK_URL = `/bengaluru-bbmp-198-to-datameet-243.json?v=${BBMP198_CROSSWALK_VERSION}`

export const PARTY_COLORS: Record<string, string> = {
  INC: "#19AAED",
  BJP: "#FF6B00",
  "JD(S)": "#138808",
  JDS: "#138808",
  AAP: "#0066CC",
  // National layer (india.kaun.city): the parties holding Lok Sabha seats.
  // Additive only — every key above keeps its existing colour. PartyBadge
  // still falls back to grey for anything unlisted.
  SP: "#ED1B24",
  AITC: "#20603D",
  DMK: "#E5241A",
  TDP: "#FFD700",
  "SHSUBT": "#F47216",
  SHS: "#F47216",
  NCP: "#00B2B2",
  "NCP(SP)": "#009FE3",
  RJD: "#008000",
  JDU: "#3B8DBC",
  "JD(U)": "#3B8DBC",
  CPIM: "#CC0000",
  "CPI(M)": "#CC0000",
  YSRCP: "#1569C7",
  BRS: "#EC1C24",
  IUML: "#008B45",
  JMM: "#0D7C3E",
  AIMIM: "#0F8A3C",
  IND: "#8A8A8A",
}

export const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  OPEN:      { bg: "bg-warning/[0.07] border border-warning/35", text: "text-warning", label: "Open" },
  AWARDED:   { bg: "bg-info/[0.07] border border-info/35",       text: "text-info",    label: "Awarded" },
  COMPLETED: { bg: "bg-success/[0.07] border border-success/35", text: "text-success", label: "Done" },
  CANCELLED: { bg: "bg-danger/[0.07] border border-danger/35",   text: "text-danger",  label: "Cancelled" },
}

export const TRUST_STYLES: Record<string, { bg: string; text: string; border: string; label: string; icon: string }> = {
  official:           { bg: "bg-success/[0.07]", text: "text-success", border: "border-success/35", label: "Govt source",        icon: "OK" },
  rti:                { bg: "bg-info/[0.07]",    text: "text-info",    border: "border-info/35",    label: "RTI sourced",        icon: "" },
  community_verified: { bg: "bg-warning/[0.07]", text: "text-warning", border: "border-warning/35", label: "Community verified", icon: "OK" },
  unverified:         { bg: "bg-ink/5",          text: "text-ink/60",  border: "border-ink/20",     label: "Unverified",         icon: "?" },
  disputed:           { bg: "bg-danger/[0.07]",  text: "text-danger",  border: "border-danger/35",  label: "Disputed",           icon: "!" },
}

export const OFFICER_SUBJECTS: Record<string, string> = {
  gba_ward_officer: "Ward Officer (GBA)",
  gba_ae_works:     "AE  -  Works (GBA)",
  gba_ae_health:    "AE  -  Health (GBA)",
  bwssb_ae:         "AE (BWSSB)",
  bescom_ae:        "AE (BESCOM)",
}
