# Contributing

This commons only works if people contribute. Here's how.

## Quick contributions (edit in browser)

Every page has a **pencil icon** at the top right. Click it to:

1. Edit the page in GitHub's web editor
2. Make your change
3. Click "Propose changes" — GitHub creates a fork and PR on your behalf
4. We review and merge

No local setup needed. Works on mobile too.

## What to contribute

### Document a contractor

If you know a BBMP/GHMC contractor — especially one with aliases across phone numbers, blacklist flags, or a history of issues — add a profile.

- Template: [contractors/_template.md](../bengaluru/contractors/_template.md)
- Existing example: [KRIDL](../bengaluru/contractors/kridl.md)
- What to include: canonical name, known aliases, PAN/GST if public, phone numbers, wards active in, blacklist flags with source, total value, key findings

### File a finding

A finding is a verified civic issue — scam, systemic irregularity, governance failure — with sources and evidence. Examples: the ghost workers scam, KRIDL 4(g) exemption.

- Template: [findings/_template.md](../bengaluru/findings/_template.md)
- Existing examples: [Ghost Workers Scam](../bengaluru/findings/ghost-workers-scam.md), [KRIDL 4(g) Exemption](../bengaluru/findings/kridl-4g-exemption.md)
- Required: amount, period, entities involved, status, evidence table with cited sources, what citizens can do, cross-links to related pages

### Upload an RTI response

When you file an RTI and get a response, upload the document so others can build on it.

- Template: [rti-responses/_template.md](../bengaluru/rti-responses/_template.md)
- Include: what you asked, what you received, key findings, scan/PDF link, original filing date

### Document a ward

Ward-specific facts, ongoing issues, known contractor activity, citizen reports.

- Template: [wards/_template.md](../bengaluru/wards/_template.md)

### Fix errors

If something is wrong, fix it. Open a PR with:
- What was wrong
- What the correct information is
- Source for the correction

## Style rules

1. **Every claim cites a source.** No exceptions. Hyperlinks to primary documents preferred (government notifications, court orders, RTI responses) over secondary reporting.
2. **Use evidence tables** where possible — makes the evidence auditable.
3. **Cross-link liberally.** Every page should have a "Related Pages" section linking to other wiki pages it touches.
4. **Neutral tone.** Document what happened with evidence. Avoid editorializing — the facts are damning enough.
5. **No personal data.** Don't publish private phone numbers, home addresses, family details unless they're already public record in the context being documented.

## Local setup (for bigger changes)

If you want to preview your changes locally or contribute code:

```bash
git clone https://github.com/kaun-city/kaun.git
cd kaun
pip install mkdocs-material pymdown-extensions
cd wiki && mkdocs serve
# Open http://localhost:8000
```

Make your changes, commit, push, open a PR.

## Review

- Wiki content PRs: reviewed within a few days, usually faster
- Data corrections: prioritized — accuracy matters more than anything else
- New findings: reviewed for sourcing rigor before merge

## Code of conduct

Be respectful. Attack ideas and institutions, not people. Verify before you publish. Correct yourself when wrong.

## License reminder

By contributing, you agree your additions are released under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
