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
        <p className="text-[11px] text-ink/60">{fact.field}</p>
        <p className="text-ink text-sm font-medium truncate">{fact.value}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <TrustBadge level={fact.trust_level} />
        <button
          onClick={handleCorroborate}
          disabled={voted || voting}
          title="I can verify this"
          className={`flex min-h-11 min-w-11 items-center justify-center gap-1 border px-2 font-mono text-xs font-semibold tabular-nums transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
            ${voted
              ? "border-ink/35 bg-ink/10 text-ink cursor-default"
              : "border-ink/20 text-ink/70 hover:bg-ink/5 hover:text-ink cursor-pointer"
            }`}
        >
          <span>+</span>
          <span>{count}</span>
        </button>
      </div>
    </div>
  )
}
