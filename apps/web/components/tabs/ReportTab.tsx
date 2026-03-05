"use client"

import type { Department, LocalOffice } from "@/lib/types"
import { FreshnessBadge } from "@/components/shared/FreshnessBadge"

const OFFICE_LABELS: Record<string, string> = {
  pincode:               "Pin Code",
  admin_taluk:           "Taluk",
  bescom_division:       "BESCOM Division",
  bescom_subdivision:    "BESCOM Subdivision",
  bwssb_division:        "BWSSB Division",
  bwssb_service_station: "BWSSB Service Station",
  police_city:           "City Police Station",
  police_traffic:        "Traffic Police",
  stamps_sro:            "Sub-Registrar (SRO)",
  stamps_dro:            "Dist. Registrar (DRO)",
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
    <div className="px-5 py-4 space-y-4 pb-6">

      {/* RTI Button */}
      <div className="space-y-1.5">
        <button
          onClick={() => alert("RTI Generator coming soon")}
          className="w-full py-3.5 rounded-xl bg-[#FF9933]/15 border border-[#FF9933]/40 text-[#FF9933] text-sm font-semibold hover:bg-[#FF9933]/25 active:scale-[0.98] transition-all"
        >
          Generate RTI Application
        </button>
        <p className="text-white/25 text-xs text-center">
          Right to Information Act, 2005  ·  Rs. 10 fee  ·  30-day response
        </p>
      </div>

      {/* Local offices */}
      {offices.length > 0 ? (
        <div className="rounded-xl bg-white/5 p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-white/50 text-[10px] uppercase tracking-wider">Your Local Offices</p>
            <FreshnessBadge label="2024" source="opencity.in" />
          </div>
          {offices.map(o => (
            <div key={o.boundary_type} className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-white/30 text-xs block">{OFFICE_LABELS[o.boundary_type] ?? o.boundary_type}</span>
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
      ) : (
        <div className="p-4 rounded-xl bg-white/5 text-center space-y-1">
          <p className="text-white/30 text-sm">Loading local offices...</p>
          <div className="h-2 w-full bg-white/5 rounded animate-pulse mt-2" />
          <div className="h-2 w-3/4 bg-white/5 rounded animate-pulse" />
        </div>
      )}

      {/* Government agencies */}
      {departments.length > 0 ? (
        <div className="space-y-2">
          <p className="text-white/30 text-xs uppercase tracking-wider">Agencies &amp; Helplines</p>
          {departments.filter(d => d.complaint_url || d.toll_free || d.helpline).map(dept => (
            <a
              key={dept.short}
              href={dept.complaint_url || dept.website || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/15 transition-colors"
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
                    : <span className="text-white/20 text-xs">File online &rarr;</span>}
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-white/30 text-xs uppercase tracking-wider">Agencies &amp; Helplines</p>
          {[1,2,3,4].map(i => (
            <div key={i} className="p-3 rounded-xl bg-white/5 flex items-center justify-between">
              <div className="space-y-1.5 flex-1">
                <div className="h-3 w-16 bg-white/10 rounded animate-pulse" />
                <div className="h-2.5 w-32 bg-white/5 rounded animate-pulse" />
              </div>
              <div className="h-4 w-12 bg-white/5 rounded animate-pulse" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
