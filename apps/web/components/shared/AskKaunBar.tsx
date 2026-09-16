"use client"

import { useState, useRef, useEffect } from "react"
import type { AskKaunRequest } from "@/app/api/ask-kaun/route"

interface Message {
  role: "user" | "assistant"
  text: string
}

interface Props {
  wardContext: AskKaunRequest["ward_context"] | null
}

const SUGGESTIONS = [
  "Has my MLA done anything?",
  "Who is responsible for roads here?",
  "What can I do about potholes?",
  "How does my ward compare to others?",
]

export function AskKaunBar({ wardContext }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState("")
  const [loading, setLoading]   = useState(false)
  const [expanded, setExpanded] = useState(false)
  const bottomRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)
  const abortRef   = useRef<AbortController | null>(null)

  function collapse() {
    abortRef.current?.abort()
    setLoading(false)
    setExpanded(false)
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Reset when ward changes
  useEffect(() => {
    setMessages([])
    setExpanded(false)
  }, [wardContext?.ward_no, wardContext?.gba_corporation_id, wardContext?.gba_ward_no])

  async function ask(question: string) {
    if (!wardContext || !question.trim() || loading) return
    const q = question.trim()
    setMessages(m => [...m, { role: "user", text: q }])
    setInput("")
    setLoading(true)
    setExpanded(true)

    try {
      abortRef.current = new AbortController()
      const res = await fetch("/api/ask-kaun", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, ward_context: wardContext }),
        signal: abortRef.current.signal,
      })
      const j = await res.json()
      setMessages(m => [...m, { role: "assistant", text: j.answer ?? j.error ?? "Sorry, something went wrong." }])
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return // user collapsed — no error message
      setMessages(m => [...m, { role: "assistant", text: "Could not reach the server. Try again." }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  if (!wardContext) return null

  return (
    <div className="bg-paper">
      {/* Header row when expanded — shows collapse button */}
      {expanded && (
        <div className="flex items-center justify-between px-4 pt-1 pb-0">
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink/60">Ask Kaun</span>
          <button
            onClick={collapse}
            aria-label="Close chat"
            className="w-11 h-11 -mr-2 flex items-center justify-center text-ink/60 hover:text-ink transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 4.5L7 9.5L12 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      )}

      {/* Conversation history */}
      {expanded && messages.length > 0 && (
        <div className="px-4 py-2 space-y-2.5 max-h-56 overflow-y-auto" aria-live="polite">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <p className={`text-sm leading-relaxed max-w-[88%] px-3 py-2 ${
                m.role === "user"
                  ? "bg-ink text-paper"
                  : "border border-ink/15 bg-paper-muted text-ink/85"
              }`}>
                {m.text}
              </p>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="border border-ink/15 bg-paper-muted px-3 py-2.5 flex gap-1 items-center" aria-label="Kaun is answering">
                <span className="w-1.5 h-1.5 bg-ink/50 animate-bounce motion-reduce:animate-none" style={{animationDelay:"0ms"}} />
                <span className="w-1.5 h-1.5 bg-ink/50 animate-bounce motion-reduce:animate-none" style={{animationDelay:"150ms"}} />
                <span className="w-1.5 h-1.5 bg-ink/50 animate-bounce motion-reduce:animate-none" style={{animationDelay:"300ms"}} />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Suggestion chips (first time only) */}
      {!expanded && (
        <div className="px-4 pt-2.5 flex gap-2 overflow-x-auto scrollbar-hide">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => ask(s)}
              className="shrink-0 min-h-11 text-xs text-ink/70 border border-ink/20 hover:bg-ink/5 hover:text-ink px-2.5 py-1.5 transition-colors whitespace-nowrap"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* AI disclaimer */}
      {expanded && messages.some(m => m.role === "assistant") && (
        <p className="px-4 pb-1 text-[11px] text-ink/60">
          AI-generated. Verify important claims before acting.
        </p>
      )}

      {/* Input bar */}
      <div className="flex items-stretch gap-2 px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && ask(input)}
          onFocus={() => setExpanded(true)}
          placeholder={`Ask anything about ${wardContext.ward_name}...`}
          aria-label={`Ask Kaun about ${wardContext.ward_name}`}
          className="flex-1 min-w-0 min-h-11 border border-ink/25 bg-paper-bright px-3 text-sm text-ink placeholder:text-ink/50 focus:outline-none focus:border-ink/60"
          disabled={loading}
        />
        <button
          onClick={() => ask(input)}
          disabled={!input.trim() || loading}
          className="shrink-0 min-h-11 px-3.5 bg-ink font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-paper hover:bg-ink/85 disabled:bg-ink/15 disabled:text-ink/50 transition-colors"
        >
          Ask &rarr;
        </button>
      </div>
    </div>
  )
}
