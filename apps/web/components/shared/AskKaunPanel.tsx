"use client"

import { useState, useRef, useEffect } from "react"
import type { AskKaunRequest } from "@/app/api/ask-kaun/route"

interface Message {
  role: "user" | "assistant"
  text: string
}

interface Props {
  wardContext: AskKaunRequest["ward_context"] | null
  /** Whether the panel is showing. It stays mounted while hidden so a
   *  conversation survives switching back to the record. */
  open: boolean
  onClose: () => void
}

const SUGGESTIONS = [
  "Has my MLA done anything?",
  "Who is responsible for roads here?",
  "What can I do about potholes?",
  "How does my ward compare to others?",
]

/**
 * Ask Kaun, on demand. The ward record owns the sheet; the conversation opens
 * over it only when someone asks for it, from the Ask control beside the tabs.
 */
export function AskKaunPanel({ wardContext, open, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState("")
  const [loading, setLoading]   = useState(false)
  const bottomRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)
  const abortRef   = useRef<AbortController | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages, loading])

  // Reset when ward changes
  useEffect(() => {
    abortRef.current?.abort()
    setMessages([])
    setInput("")
    setLoading(false)
  }, [wardContext?.ward_no, wardContext?.gba_corporation_id, wardContext?.gba_ward_no])

  // Opening is an explicit request to ask, so the field is ready to type into.
  useEffect(() => {
    if (open) inputRef.current?.focus({ preventScroll: true })
  }, [open])

  async function ask(question: string) {
    if (!wardContext || !question.trim() || loading) return
    const q = question.trim()
    setMessages(m => [...m, { role: "user", text: q }])
    setInput("")
    setLoading(true)

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
      if ((e as Error)?.name === "AbortError") return // ward changed mid-answer
      setMessages(m => [...m, { role: "assistant", text: "Could not reach the server. Try again." }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 100)
    }
  }

  if (!wardContext) return null

  return (
    <section
      id="ask-kaun-panel"
      aria-label={`Ask Kaun about ${wardContext.ward_name}`}
      className={`${open ? "flex" : "hidden"} flex-1 min-h-0 flex-col bg-paper`}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-ink/15 pl-5 pr-3 py-1.5">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink/60">Ask Kaun</p>
          <p className="truncate text-sm font-semibold text-ink">About {wardContext.ward_name}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close Ask Kaun and return to the ward record"
          aria-controls="ask-kaun-panel"
          className="shrink-0 w-11 h-11 flex items-center justify-center border border-ink/20 text-ink/60 hover:bg-ink/5 hover:text-ink transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-3" aria-live="polite">
        {messages.length === 0 ? (
          <div>
            <p className="text-sm leading-relaxed text-ink/70">
              Ask about this ward&apos;s representatives, spending or services. Answers are drawn from Kaun&apos;s records by AI.
            </p>
            <div className="mt-3 divide-y divide-ink/10 border-y border-ink/15">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="flex w-full min-h-11 items-center justify-between gap-3 py-2 text-left text-sm text-ink/80 hover:text-ink"
                >
                  <span>{s}</span>
                  <span aria-hidden="true" className="text-ink/60">&rarr;</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
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
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-ink/15">
        <p className="px-5 pt-2 text-[11px] text-ink/60">
          AI-generated. Verify important claims before acting.
        </p>
        <div className="flex items-stretch gap-2 px-5 pt-2 pb-2.5">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && ask(input)}
            placeholder={`Ask about ${wardContext.ward_name}...`}
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
    </section>
  )
}
