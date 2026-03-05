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
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Reset when ward changes
  useEffect(() => {
    setMessages([])
    setExpanded(false)
  }, [wardContext?.ward_no])

  async function ask(question: string) {
    if (!wardContext || !question.trim() || loading) return
    const q = question.trim()
    setMessages(m => [...m, { role: "user", text: q }])
    setInput("")
    setLoading(true)
    setExpanded(true)

    try {
      const res = await fetch("/api/ask-kaun", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, ward_context: wardContext }),
      })
      const j = await res.json()
      setMessages(m => [...m, { role: "assistant", text: j.answer ?? j.error ?? "Sorry, something went wrong." }])
    } catch {
      setMessages(m => [...m, { role: "assistant", text: "Could not reach the server. Try again." }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  if (!wardContext) return null

  return (
    <div className="border-t border-white/10 bg-white/[0.02]">
      {/* Conversation history */}
      {expanded && messages.length > 0 && (
        <div className="px-4 py-3 space-y-3 max-h-56 overflow-y-auto">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" && (
                <span className="text-[10px] font-bold text-[#FF9933] mt-1 shrink-0">K</span>
              )}
              <p className={`text-sm leading-relaxed max-w-[85%] rounded-2xl px-3 py-2 ${
                m.role === "user"
                  ? "bg-white/10 text-white/80 rounded-br-sm"
                  : "bg-[#FF9933]/10 text-white/70 rounded-bl-sm"
              }`}>
                {m.text}
              </p>
            </div>
          ))}
          {loading && (
            <div className="flex gap-2 justify-start">
              <span className="text-[10px] font-bold text-[#FF9933] mt-1 shrink-0">K</span>
              <div className="bg-[#FF9933]/10 rounded-2xl rounded-bl-sm px-3 py-2 flex gap-1 items-center">
                <span className="w-1.5 h-1.5 bg-[#FF9933]/50 rounded-full animate-bounce" style={{animationDelay:"0ms"}} />
                <span className="w-1.5 h-1.5 bg-[#FF9933]/50 rounded-full animate-bounce" style={{animationDelay:"150ms"}} />
                <span className="w-1.5 h-1.5 bg-[#FF9933]/50 rounded-full animate-bounce" style={{animationDelay:"300ms"}} />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Suggestion chips (first time only) */}
      {!expanded && (
        <div className="px-4 pt-3 pb-1 flex gap-2 overflow-x-auto scrollbar-hide">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => ask(s)}
              className="shrink-0 text-[11px] text-white/40 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full px-3 py-1.5 transition-colors whitespace-nowrap"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-center gap-2 px-4 py-3">
        <span className="text-[#FF9933] font-bold text-sm shrink-0">Ask</span>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && ask(input)}
          onFocus={() => setExpanded(true)}
          placeholder={`Ask anything about ${wardContext.ward_name}...`}
          className="flex-1 bg-transparent text-sm text-white placeholder-white/20 focus:outline-none"
          disabled={loading}
        />
        <button
          onClick={() => ask(input)}
          disabled={!input.trim() || loading}
          className="shrink-0 w-8 h-8 rounded-full bg-[#FF9933] disabled:bg-white/10 flex items-center justify-center transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M12 7L2 2l2 5-2 5 10-5z" fill={input.trim() && !loading ? "#000" : "#666"} />
          </svg>
        </button>
      </div>
    </div>
  )
}
