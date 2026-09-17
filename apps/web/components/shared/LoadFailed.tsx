"use client"

/**
 * What a ward-card section shows when its data could not be loaded (the
 * network could not reach Kaun's database, or a read timed out). It replaces
 * a loading placeholder that would otherwise never finish, and never reads
 * like "no data": the record may well exist.
 */
export function LoadFailed({ what, onRetry, message, className = "" }: {
  /** What failed, for screen readers ("the BBMP budget"). */
  what: string
  onRetry: () => void
  /** Visible text; the default suits a section that has its own heading. */
  message?: string
  className?: string
}) {
  return (
    <div role="alert" className={`flex min-h-11 items-center gap-1 border-y border-ink/15 ${className}`}>
      <p className="min-w-0 text-xs leading-snug text-ink/75">
        {message ?? <>Couldn&apos;t load<span className="sr-only"> {what}</span></>}
        <span aria-hidden="true" className="text-ink/60"> · </span>
      </p>
      <button
        type="button"
        onClick={onRetry}
        aria-label={`Retry loading ${what}`}
        className="min-h-11 shrink-0 px-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-accent hover:bg-ink/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        Retry
      </button>
    </div>
  )
}
