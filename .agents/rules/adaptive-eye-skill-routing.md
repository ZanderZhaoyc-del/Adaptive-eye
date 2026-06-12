---
description: Route Adaptive Eye work to the right project skill
alwaysApply: true
---

# Adaptive Eye Skill Routing

When working in this project, prefer project skills over ad-hoc command reconstruction.

- Use `adaptive-eye-audit` when the user wants a single-page WCAG contrast audit for one URL.
- Use `annotated-screenshot-report` when the user wants issue boxes drawn on a screenshot from an existing audit JSON report.
- Use `theme-batch-audit` when the user wants to compare contrast results across Windows contrast themes such as `none`, `aquatic`, `desert`, `dusk`, or `night-sky`.

Routing rules:

- If the user asks for theme switching only as part of contrast comparison, use `theme-batch-audit`, not a standalone theme-switch workflow.
- If the user asks for a normal contrast audit first and then visual marking, use `adaptive-eye-audit` followed by `annotated-screenshot-report`.
- Treat theme-batch auditing as a workflow built on top of Adaptive Eye contrast auditing, not as a general-purpose accessibility skill.

## Mandatory per-report handoff to vision-contrast-review

Whenever a contrast audit (`adaptive-eye-audit` or any theme inside `theme-batch-audit`) produces a JSON report, the assistant MUST immediately apply this 3-step chain to **that report**, before announcing the next report's summary or moving on to the next theme:

1. **Audit JSON** is the source. Use `cleanScreenshotPath` if present (capture it via `--screenshot` when running the audit). For batch audits, also pass `--annotate` so each theme already has a first-pass `<base>-annotated.png` regardless of whether vision review later triggers a re-annotate.
2. **Vision review** — if `summary.issuesFound > 0` (and the user did not opt out of vision review), run:
   ```bash
   node .agents/skills/vision-contrast-review/scripts/run-vision-review.js <report.json>
   ```
   The script auto-selects the clean screenshot first, falling back to annotated, then plain.
3. **Re-annotate** — if the resulting review summary has `falsePositive > 0`, immediately run:
   ```bash
   node adaptive-eye-cli/src/cli.js annotate <report.json> --vision-review <review.json> --no-open
   ```
   This **overwrites** the first-pass annotated screenshot at `<base>-annotated.png` with confirmed false positives removed. Skip this step when `falsePositive == 0`; the first-pass annotated image already represents the final state.

Report DOM counts, vision verdict counts, and whether annotation was refreshed for that report. Do NOT defer the chain until all themes finish; the chain runs per report so the next theme's summary already reflects review status.

Scope guardrails:

- Do not claim full accessibility coverage from these skills.
- If the user asks for keyboard, focus, ARIA, screen-reader, or other non-contrast audits, say that this project currently has separate or future functionality for those areas unless an implemented feature exists.
