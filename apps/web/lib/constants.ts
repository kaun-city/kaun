/**
 * The BBMP-225 ↔ DataMeet-243 ward crosswalk asset, and the version recorded
 * inside it. next.config.ts serves the file `immutable` for a year, which is
 * only correct while the URL names the version — bump this when the crosswalk
 * is rebuilt. tests/cities-registry.test.mjs asserts the two agree.
 */
export const WARD_CROSSWALK_VERSION = "2023f-2026.05"
export const WARD_CROSSWALK_URL = `/bengaluru-ward-crosswalk.json?v=${WARD_CROSSWALK_VERSION}`

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
  OPEN:      { bg: "bg-yellow-500/20", text: "text-yellow-400", label: "Open" },
  AWARDED:   { bg: "bg-blue-500/20",   text: "text-blue-400",   label: "Awarded" },
  COMPLETED: { bg: "bg-green-500/20",  text: "text-green-400",  label: "Done" },
  CANCELLED: { bg: "bg-red-500/20",    text: "text-red-400",    label: "Cancelled" },
}

export const TRUST_STYLES: Record<string, { bg: string; text: string; border: string; label: string; icon: string }> = {
  official:           { bg: "bg-green-500/10",  text: "text-green-400",  border: "border-green-500/20", label: "Govt source",        icon: "OK" },
  rti:                { bg: "bg-blue-500/10",   text: "text-blue-400",   border: "border-blue-500/20",  label: "RTI sourced",        icon: "" },
  community_verified: { bg: "bg-amber-500/10",  text: "text-amber-400",  border: "border-amber-500/20", label: "Community verified", icon: "OK" },
  unverified:         { bg: "bg-white/5",       text: "text-white/30",   border: "border-white/10",     label: "Unverified",         icon: "?" },
  disputed:           { bg: "bg-red-500/10",    text: "text-red-400",    border: "border-red-500/20",   label: "Disputed",           icon: "!" },
}

export const OFFICER_SUBJECTS: Record<string, string> = {
  gba_ward_officer: "Ward Officer (GBA)",
  gba_ae_works:     "AE  -  Works (GBA)",
  gba_ae_health:    "AE  -  Health (GBA)",
  bwssb_ae:         "AE (BWSSB)",
  bescom_ae:        "AE (BESCOM)",
}
