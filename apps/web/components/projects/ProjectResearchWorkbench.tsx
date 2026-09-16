"use client"

import { FormEvent, useState } from "react"

interface Source {
  title: string
  url: string
}

interface ResearchResult {
  answer: string
  sources: Source[]
  searched_at: string
  can_submit: boolean
  origin: "kaun_record" | "published_research" | "recent_research" | "live_research"
}

type SubmissionState = "idle" | "saving" | "queued"

export function ProjectResearchWorkbench({
  projectSlug,
  suggestedQuestions,
}: {
  projectSlug: string
  suggestedQuestions: string[]
}) {
  const originLabel: Record<ResearchResult["origin"], string> = {
    kaun_record: "From Kaun’s record",
    published_research: "Reviewed Kaun research",
    recent_research: "Recent cited research",
    live_research: "New live research",
  }
  const [question, setQuestion] = useState("")
  const [result, setResult] = useState<ResearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submission, setSubmission] = useState<SubmissionState>("idle")

  async function research(event: FormEvent) {
    event.preventDefault()
    if (loading || question.trim().length < 8) return
    setLoading(true)
    setError(null)
    setResult(null)
    setSubmission("idle")

    try {
      const response = await fetch("/api/project-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_slug: projectSlug, question: question.trim() }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Research failed.")
      setResult(body as ResearchResult)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Research failed.")
    } finally {
      setLoading(false)
    }
  }

  async function submitToRecord() {
    if (!result?.can_submit || submission !== "idle") return
    setSubmission("saving")
    setError(null)
    try {
      const response = await fetch("/api/project-research/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_slug: projectSlug,
          question: question.trim(),
          answer: result.answer,
          sources: result.sources,
          searched_at: result.searched_at,
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not add this to the review queue.")
      setSubmission("queued")
    } catch (cause: unknown) {
      setSubmission("idle")
      setError(cause instanceof Error ? cause.message : "Could not add this to the review queue.")
    }
  }

  return (
    <section aria-labelledby="research-heading" className="border-2 border-[#101828] bg-white">
      <div className="border-b border-[#101828]/20 px-4 py-3 sm:px-5">
        <div className="flex items-center justify-between gap-4">
          <h2 id="research-heading" className="text-sm font-bold uppercase tracking-[0.12em] text-[#101828]">
            Live research desk
          </h2>
          <span className="font-mono text-xs text-[#101828]/60">PUBLIC SOURCES</span>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#101828]/70 sm:text-base">
          Ask one narrow question about this project. Kaun checks its existing record first and searches the public web only when the answer is genuinely new.
        </p>
      </div>

      <form onSubmit={research} className="p-4 sm:p-5">
        <label htmlFor="project-question" className="text-sm font-semibold text-[#101828]">
          What should we find out?
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <textarea
            id="project-question"
            value={question}
            onChange={event => setQuestion(event.target.value.slice(0, 300))}
            placeholder="For example: Has KRDCL disclosed the contractor or work order?"
            rows={3}
            className="min-h-24 flex-1 resize-y border border-[#101828]/35 bg-[#f8fafc] px-3 py-3 text-base leading-relaxed text-[#101828] outline-none placeholder:text-[#101828]/40 focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20"
          />
          <button
            type="submit"
            disabled={loading || question.trim().length < 8}
            className="min-h-12 self-stretch bg-[#101828] px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-white transition hover:bg-[#344054] focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 sm:self-end"
          >
            {loading ? "Searching…" : "Dig now →"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Suggested research questions">
          {suggestedQuestions.map(suggestion => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setQuestion(suggestion)}
              className="min-h-11 border border-[#101828]/20 bg-transparent px-3 py-2 text-left text-sm leading-snug text-[#101828]/70 hover:border-[#101828]/50 hover:text-[#101828] focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </form>

      {error && (
        <p role="alert" className="mx-4 mb-4 border border-[#b42318]/30 bg-[#b42318]/5 px-3 py-3 text-sm text-[#b42318] sm:mx-5">
          {error}
        </p>
      )}

      {result && (
        <div className="border-t-2 border-[#101828] bg-[#f8fafc] p-4 sm:p-5" aria-live="polite">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.1em] text-[#101828]">Research result</p>
              <p className="mt-1 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-[#2563eb]">
                {originLabel[result.origin]}
              </p>
            </div>
            <time className="font-mono text-xs text-[#101828]/60" dateTime={result.searched_at}>
              {new Date(result.searched_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
            </time>
          </div>
          <p className="mt-4 whitespace-pre-wrap text-base leading-7 text-[#101828]/85">{result.answer}</p>

          <div className="mt-5">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#101828]/60">Sources used</p>
            {result.sources.length > 0 ? (
              <ol className="mt-2 space-y-2">
                {result.sources.map((source, index) => (
                  <li key={source.url} className="flex gap-2 text-sm leading-relaxed">
                    <span className="font-mono text-[#2563eb]">{String(index + 1).padStart(2, "0")}</span>
                    <a className="text-[#101828] underline decoration-[#2563eb]/45 underline-offset-2 hover:decoration-[#2563eb]" href={source.url} target="_blank" rel="noopener noreferrer">
                      {source.title}
                    </a>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-sm text-[#b42318]">No citable source was returned, so this result cannot be proposed for publication.</p>
            )}
          </div>

          <div className="mt-5 border-t border-[#101828]/20 pt-4">
            {!result.can_submit ? (
              <p className="text-sm leading-relaxed text-[#101828]/60">
                This answer already belongs to Kaun’s reviewed record, so no new search or submission is needed.
              </p>
            ) : submission === "queued" ? (
              <p className="border border-[#027a48]/30 bg-[#027a48]/5 px-3 py-3 text-sm font-semibold text-[#067647]">
                Added to Kaun’s evidence-review queue. If the claims and sources check out, this becomes a dated entry in the permanent record.
              </p>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-xl text-sm leading-relaxed text-[#101828]/60">
                  AI research is never published automatically. Kaun preserves the question, answer, search time and sources for human evidence review.
                </p>
                <button
                  type="button"
                  disabled={!result.can_submit || submission === "saving"}
                  onClick={submitToRecord}
                  className="min-h-12 shrink-0 border-2 border-[#101828] bg-transparent px-4 py-3 text-sm font-bold uppercase tracking-[0.07em] text-[#101828] hover:bg-[#101828] hover:text-white focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {submission === "saving" ? "Adding…" : "Propose to record"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
