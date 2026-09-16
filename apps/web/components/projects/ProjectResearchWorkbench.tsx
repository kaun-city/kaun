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
  /** The exact question the server answered. */
  question: string
  /** Server signature; sent back unchanged when proposing to the record. */
  signature?: string
}

type SubmissionState = "idle" | "saving" | "queued"

export function ProjectResearchWorkbench({
  projectSlug,
  suggestedQuestions,
}: {
  projectSlug: string
  suggestedQuestions: string[]
}) {
  // Only reviewer-approved research may be called reviewed. AI answers are labelled as such.
  const originLabel: Record<ResearchResult["origin"], string> = {
    kaun_record: "From Kaun’s record",
    published_research: "Reviewer-approved research",
    recent_research: "AI-generated · cached · not reviewed",
    live_research: "AI-generated · not reviewed",
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
    const asked = question.trim()

    try {
      const response = await fetch("/api/project-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_slug: projectSlug, question: asked }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Research failed.")
      setResult({ ...body, question: typeof body.question === "string" ? body.question : asked } as ResearchResult)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Research failed.")
    } finally {
      setLoading(false)
    }
  }

  async function submitToRecord() {
    if (!result?.can_submit || !result.signature || submission !== "idle") return
    setSubmission("saving")
    setError(null)
    try {
      const response = await fetch("/api/project-research/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Everything is echoed exactly as the server signed it; any change is rejected.
        body: JSON.stringify({
          project_slug: projectSlug,
          question: result.question,
          answer: result.answer,
          sources: result.sources,
          searched_at: result.searched_at,
          origin: result.origin,
          signature: result.signature,
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

  const isAi = result?.origin === "live_research" || result?.origin === "recent_research"
  const canPropose = Boolean(isAi && result?.can_submit && result?.signature)

  return (
    <section aria-labelledby="research-heading" className="border-2 border-ink bg-paper">
      <div className="border-b border-ink/20 px-4 py-3 sm:px-5">
        <div className="flex items-center justify-between gap-4">
          <h2 id="research-heading" className="text-sm font-bold uppercase tracking-[0.12em] text-ink">
            Live research desk
          </h2>
          <span className="font-mono text-xs text-ink/60">AI WEB SEARCH</span>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink/70 sm:text-base">
          Ask one narrow question about this project. Kaun checks its record first, then runs an AI web search. AI answers are labelled, are not reviewed, and may be shown to other visitors who ask the same question for up to seven days.
        </p>
      </div>

      <form onSubmit={research} className="p-4 sm:p-5">
        <label htmlFor="project-question" className="text-sm font-semibold text-ink">
          What should we find out?
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <textarea
            id="project-question"
            value={question}
            onChange={event => setQuestion(event.target.value.slice(0, 300))}
            placeholder="For example: Has KRDCL disclosed the contractor or work order?"
            rows={3}
            className="min-h-24 flex-1 resize-y border border-ink/35 bg-paper-bright px-3 py-3 text-base leading-relaxed text-ink placeholder:text-ink/50 focus:border-ink/60 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent"
          />
          <button
            type="submit"
            disabled={loading || question.trim().length < 8}
            className="min-h-12 self-stretch bg-ink px-5 py-3 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-paper transition-colors enabled:hover:bg-ink/85 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-ink/15 disabled:text-ink/50 sm:self-end"
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
              className="min-h-11 border border-ink/20 bg-transparent px-3 py-2 text-left text-sm leading-snug text-ink/70 hover:border-ink/50 hover:bg-ink/5 hover:text-ink focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </form>

      {error && (
        <p role="alert" className="mx-4 mb-4 border border-danger/35 bg-danger/[0.07] px-3 py-3 text-sm text-danger sm:mx-5">
          {error}
        </p>
      )}

      {result && (
        <div className="border-t-2 border-ink bg-paper-muted p-4 sm:p-5" aria-live="polite">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.1em] text-ink">Research result</p>
              <p className={`mt-1 font-mono text-xs font-semibold uppercase tracking-[0.08em] ${isAi ? "text-warning" : "text-success"}`}>
                {originLabel[result.origin]}
              </p>
            </div>
            <time className="font-mono text-xs text-ink/60" dateTime={result.searched_at}>
              {new Date(result.searched_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
            </time>
          </div>
          {isAi && (
            <p className="mt-4 border-l-4 border-warning bg-warning/[0.07] px-3 py-2 text-sm leading-relaxed text-ink">
              <strong>AI-generated. Verify important claims before acting.</strong>{" "}
              {result.origin === "recent_research"
                ? "Cached from an earlier search for the same question. Kaun has not reviewed it."
                : "Kaun has not reviewed this answer."}
            </p>
          )}
          <p className="mt-4 whitespace-pre-wrap text-base leading-7 text-ink/85">{result.answer}</p>

          <div className="mt-5">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-ink/60">Sources used</p>
            {result.sources.length > 0 ? (
              <ol className="mt-2 space-y-2">
                {result.sources.map((source, index) => (
                  <li key={source.url} className="flex gap-2 text-sm leading-relaxed">
                    <span className="font-mono tabular-nums text-accent">{String(index + 1).padStart(2, "0")}</span>
                    <a className="text-ink underline decoration-accent/45 underline-offset-2 hover:decoration-accent focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" href={source.url} target="_blank" rel="noopener noreferrer">
                      {source.title}
                    </a>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-sm text-danger">No citable source was returned.</p>
            )}
          </div>

          <div className="mt-5 border-t border-ink/20 pt-4">
            {result.origin === "kaun_record" ? (
              <p className="text-sm leading-relaxed text-ink/60">
                This answer comes from Kaun’s existing project record, so no new search was run.
              </p>
            ) : result.origin === "published_research" ? (
              <p className="text-sm leading-relaxed text-ink/60">
                A Kaun reviewer approved this finding for the project record, so no new search was run.
              </p>
            ) : !canPropose ? (
              <p className="text-sm leading-relaxed text-ink/60">
                {result.sources.length === 0
                  ? "Without a citable source, this answer cannot be proposed for the project record."
                  : "Proposals to the project record are not open yet."}
              </p>
            ) : submission === "queued" ? (
              <p className="border border-success/35 bg-success/[0.07] px-3 py-3 text-sm font-semibold text-success">
                Added to Kaun’s review queue. If a reviewer confirms the claims and sources, it becomes a dated entry in the project record.
              </p>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-xl text-sm leading-relaxed text-ink/60">
                  Nothing joins the project record until a reviewer checks the question, answer, search time and sources.
                </p>
                <button
                  type="button"
                  disabled={!canPropose || submission === "saving"}
                  onClick={submitToRecord}
                  className="min-h-12 shrink-0 border-2 border-ink bg-paper px-4 py-3 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink transition-colors enabled:hover:bg-ink enabled:hover:text-paper focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-ink/25 disabled:bg-paper disabled:text-ink/50"
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
