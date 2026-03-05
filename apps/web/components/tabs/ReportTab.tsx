"use client"

import type { Department, LocalOffice } from "@/lib/types"

const OFFICE_LABELS: Record<string, string> = {
  pincode:             "Pin Code",
  admin_taluk:         "Taluk",
  bescom_division:     "BESCOM Division",
  bescom_subdivision:  "BESCOM Subdivision",
  bwssb_division:      "BWSSB Division",
  bwssb_service_station: "BWSSB Service Station",
  police_city:         "City Police Station",
  police_traffic:      "Traffic Police",
  stamps_sro:          "Sub-Registrar (SRO)",
  stamps_dro:          "Dist. Registrar (DRO)",
}

function formatOfficeName(type: string, name: string): string {
  if (type === "pincode") {
    const parts = name.split(": ")
    return parts.length === 2 ? `${parts[0]} (${parts[1]})` : name
  }
  return name
}

interface Props {
  localOffices: LocalOffice[]
  departments: Department[]
}

export function ReportTab({ localOffices, departments }: Props) {
  const offices = localOffices.filter(o => o.boundary_type !== "gba_corporation")

  return (
    <div className="px-5 py-4 max-h-[28rem] overflow-y-auto space-y-3">
      {/* RTI Button */}
      <button
        onClick={() => alert("RTI Generator coming soon")}
        className="w-full py-3.5 rounded-xl bg-[#FF9933]/15 border border-[#FF9933]/40 text-[#FF9933] text-sm font-semibold hover:bg-[#FF9933]/25 transition-colors"
      >
        Generate RTI Application
      </button>
      <p className="text-white/25 text-xs text-center -mt-1">
        Right to Information Act, 2005  -  Rs. 10 fee  -  30-day response
      </p>

      {/* Local offices */}
      {offices.length > 0 && (
        <div className="rounded-xl bg-white/5 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-white/50 text-[10px] uppercase tracking-wider">Your Local Offices</p>
            <p className="text-white/15 text-[10px]">opencity.in</p>
          </div>
          {offices.map(o => (
            <div key={o.boundary_type} className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-white/30 text-xs">{OFFICE_LABELS[o.boundary_type] ?? o.boundary_type}</span>
                <p className={`text-xs font-semibold ${o.boundary_type === "pincode" ? "text-[#FF9933]" : "text-white"}`}>
                  {formatOfficeName(o.boundary_type, o.name)}
                </p>
              </div>
              {o.phone && (
                <a href={`tel:${o.phone.replace(/\s/g, "")}`} className="text-[#FF9933] text-xs font-mono shrink-0 hover:underline mt-0.5">
                  {o.phone}
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Government agencies */}
      <div className="pt-2 space-y-2">
        <p className="text-white/30 text-xs uppercase tracking-wider">Government Agencies & Helplines</p>
        {departments.filter(d => d.complaint_url || d.toll_free || d.helpline).map(dept => (
          <a
            key={dept.short}
            href={dept.complaint_url || dept.website || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium">{dept.short}</p>
              <p className="text-white/30 text-xs truncate">{dept.name}</p>
            </div>
            <div className="text-right shrink-0 ml-2">
              {dept.toll_free
                ? <span className="text-[#FF9933] text-sm font-mono font-semibold">{dept.toll_free}</span>
                : dept.helpline
                  ? <span className="text-white/40 text-xs font-mono">{dept.helpline}</span>
                  : null}
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
