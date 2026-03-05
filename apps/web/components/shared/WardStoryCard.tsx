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
    <div className="rounded-xl overflow-hidden bg-gradient-to-br from-[#FF9933]/10 to-white/5 border border-white/10">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#FF9933]/20 text-[#FF9933] uppercase tracking-wider">AI</span>
            <span className="text-white/40 text-[10px] uppercase tracking-wider">Ward Brief</span>
          </div>
          {story && !loading && (
            <button
              onClick={() => storyData && generate(storyData, true)}
              className="text-white/20 hover:text-white/50 transition-colors text-[10px]"
              title="Regenerate"
            >
              Refresh
            </button>
          )}
        </div>

        {loading && (
          <div className="space-y-2 py-1">
            <div className="h-3 bg-white/10 rounded animate-pulse w-full" />
            <div className="h-3 bg-white/10 rounded animate-pulse w-5/6" />
            <div className="h-3 bg-white/10 rounded animate-pulse w-4/5" />
          </div>
        )}

        {error && !loading && (
          <p className="text-white/30 text-xs py-1">
            Could not generate brief.{" "}
            <button onClick={() => storyData && generate(storyData)} className="underline hover:text-white/50">
              Try again
            </button>
          </p>
        )}

        {story && !loading && (
          <p className="text-white/70 text-sm leading-relaxed">{story}</p>
        )}
      </div>
    </div>
  )
}
