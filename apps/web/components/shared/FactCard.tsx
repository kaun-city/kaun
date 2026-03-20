"use client"

import { useState } from "react"
import type { CommunityFact } from "@/lib/types"
import { TrustBadge } from "./TrustBadge"

interface Props {
  fact: CommunityFact
  onCorroborate: (id: number) => Promise<void>
}

export function FactCard({ fact, onCorroborate }: Props) {
  const [voting, setVoting] = useState(false)
  const [count, setCount] = useState(fact.corroboration_count)
  const [voted, setVoted] = useState(false)

  async function handleCorroborate() {
    if (voted || voting) return
    setVoting(true)
    await onCorroborate(fact.id)
    setVoting(false)
    setVoted(true)
    setCount(c => c + 1)
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex-1 min-w-0">
        <p className="text-white/40 text-[10px]">{fact.field}</p>
        <p className="text-white text-sm font-medium truncate">{fact.value}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <TrustBadge level={fact.trust_level} />
        <button
          onClick={handleCorroborate}
          disabled={voted || voting}
          title="I can verify this"
          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-colors
            ${voted
              ? "bg-amber-500/20 text-amber-400 cursor-default"
              : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70 cursor-pointer"
            }`}
        >
          <span>+</span>
          <span>{count}</span>
        </button>
      </div>
    </div>
  )
}
