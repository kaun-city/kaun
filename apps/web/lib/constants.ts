export const PARTY_COLORS: Record<string, string> = {
  INC: "#19AAED",
  BJP: "#FF6B00",
  "JD(S)": "#138808",
  JDS: "#138808",
  AAP: "#0066CC",
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
