$prompt = @"
Do a comprehensive code review of this Kaun civic accountability platform codebase. Review all files thoroughly. Check for: security vulnerabilities, code quality, performance issues, missing error handling, architecture concerns, API design, database schema correctness, and bugs or logic errors. Write a detailed report to CODEX_REVIEW.md with file names, severity levels (critical/high/medium/low), and specific recommendations. When done, run: openclaw system event --text "Done: Kaun code review complete" --mode now
"@
codex exec --full-auto $prompt
