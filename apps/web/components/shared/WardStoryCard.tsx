"use client"

import { useState, useEffect, useCallback } from "react"
import type { WardStoryRequest } from "@/app/api/ward-story/route"

interface Props {
  storyData: WardStoryRequest | null
}

export function WardStoryCard({ storyData }: Props) {
  const [story, setStory] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const generate = useCallback(async (data: WardStoryRequest, force = false) => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch("/api/ward-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(force ? { ...data, _force: Date.now() } : data),
      })
      if (!res.ok) throw new Error("Failed")
      const json = await res.json()
      setStory(json.story)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-generate when we have enough data
  useEffect(() => {
    if (!storyData || story || loading) return
    generate(storyData)
  }, [storyData, story, loading, generate])

  // Reset when ward changes
  useEffect(() => {
    setStory(null)
    setError(false)
  }, [storyData?.ward_no])

  if (!storyData) return null

  return (
    <div className="bg-paper-muted border border-ink/15">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center border border-ink/20 px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase leading-none text-ink/70">AI</span>
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60">Ward Brief</span>
          </div>
          {story && !loading && (
            <button
              onClick={() => storyData && generate(storyData, true)}
              className="-my-3 -mr-2 inline-flex min-h-11 items-center px-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink/60 hover:text-ink transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              title="Regenerate"
            >
              Refresh
            </button>
          )}
        </div>

        {loading && (
          <div className="space-y-2 py-1">
            <div className="h-3 bg-ink/10 animate-pulse w-full" />
            <div className="h-3 bg-ink/10 animate-pulse w-5/6" />
            <div className="h-3 bg-ink/10 animate-pulse w-4/5" />
          </div>
        )}

        {error && !loading && (
          <p className="text-ink/70 text-xs py-1">
            Could not generate brief.{" "}
            <button
              onClick={() => storyData && generate(storyData)}
              className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              Try again
            </button>
          </p>
        )}

        {story && !loading && (
          <>
            <p className="text-ink/85 text-sm leading-relaxed">{story}</p>
            <p className="mt-2 text-xs text-ink/60">AI-generated. Verify important claims before acting.</p>
          </>
        )}
      </div>
    </div>
  )
}
