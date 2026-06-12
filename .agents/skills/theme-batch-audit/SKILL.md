---
name: theme-batch-audit
description: Run Adaptive Eye contrast audits across Windows contrast themes and generate per-theme JSON/Markdown reports with optional annotated screenshots. Use when the user wants to compare `none`, `aquatic`, `desert`, `dusk`, or `night-sky`, run batch contrast audits under Windows contrast themes, or summarize per-theme WCAG contrast results.
---

# Theme Batch Audit

Use this skill for Windows contrast-theme batch audits in Adaptive Eye.

Prefer the bundled CLI. Do not manually recreate theme switching, per-theme audit loops, or batch index generation unless the CLI itself fails.

## Command

Run from `D:\code\Adaptive-eye`. The recommended invocation captures both a clean per-theme screenshot (for vision review) and a first-pass annotated overlay (so every theme has a visual artifact even when no follow-up review is triggered):

```bash
node adaptive-eye-cli/src/cli.js themes <url> --screenshot --annotate
```

Example:

```bash
node adaptive-eye-cli/src/cli.js themes https://www.baidu.com --screenshot --annotate
```

## Common Variants

Use these when needed:

```bash
node adaptive-eye-cli/src/cli.js themes <url> --screenshot --annotate --themes none,dusk
node adaptive-eye-cli/src/cli.js themes <url> --screenshot --annotate --themes aquatic,night-sky --report json
node adaptive-eye-cli/src/cli.js themes <url> --screenshot --annotate --out-dir reports/theme-batch-run
node adaptive-eye-cli/src/cli.js themes <url> --screenshot --annotate --reload-between-themes
node adaptive-eye-cli/src/cli.js themes <url> --screenshot                  # clean only; skip when you accept some themes lacking annotated artifacts
```

Flag semantics:

- `--screenshot` captures one clean full-page PNG per theme (`<base>-clean.png`) with no overlay. Recorded in JSON as `cleanScreenshotPath`. This is the input the vision review consumes.
- `--annotate` produces a first-pass annotated overlay (`<base>-annotated.png`, every DOM finding boxed) per theme. Recommended in every batch so that even themes whose vision review yields no false positives still ship with an annotated visual. The same path is later overwritten by the post-review re-annotation when needed.

## Theme Semantics

Supported themes:

- `none`
- `aquatic`
- `desert`
- `dusk`
- `night-sky`

Behavior:

- If `--themes` is omitted, the CLI runs all themes in this order: `none,aquatic,desert,dusk,night-sky`
- If `--themes` is provided, run exactly that subset in the caller's order
- `none` means explicitly disable Windows contrast themes before auditing
- The CLI restores the original Windows theme after the batch run

## Single-Session Execution

The batch runner opens the browser once, then loops `apply theme → eval analyze → (optional) eval overlay + screenshot` against the same long-lived `browser-use` session. This avoids the IPC `sock.recv timed out` errors that occurred when re-issuing `browser-use open` after each theme switch, and roughly halves total runtime.

Key points:

- Chromium re-evaluates `forced-colors`, `prefers-contrast`, and system color tokens live, so DOM `getComputedStyle` reflects the new theme without a reload.
- If a per-theme audit eval throws, the runner does one `location.reload()` + brief wait and retries the audit once. The retry warning is recorded in the theme result.
- If the initial `browser-use open` fails, the runner falls back to the legacy per-theme open behavior. `result.sessionMode` reports either `single-session` or `per-theme`, and `result.sessionOpenError` carries the reason if it fell back.
- Use `--reload-between-themes` only for sites whose contrast styling is decided by JS at load time (rare). It forces a reload before each theme's audit.

## Output Handling

After the command finishes:

1. Read the generated root `index.json` or `index.md`.
2. Tell the user the tested themes, per-theme `issuesFound`, `criticalIssues`, and `warningIssues`, output directory, batch index paths, and whether the original Windows theme was restored.
3. If a theme failed, include its `status`, `errorMessage`, or warnings.
4. Include each available `cleanScreenshot` path; with `--annotate` (recommended) every theme also has an `annotatedScreenshot` path — themes with zero findings simply produce an annotated PNG identical to the clean one.
5. **Mandatory per-theme handoff (not after the whole batch — per report)**: for every theme whose `summary.issuesFound > 0`, immediately invoke `vision-contrast-review` on **that theme's** JSON report before moving on to the next theme's summary. Skip only when the user explicitly asked for DOM-only results.
6. If any successful theme report has `fallbackRequired: true`, immediately invoke `vision-contrast-review` for that theme using the fallback screenshot path.

## Vision Review Handoff

The theme batch audit is the producer of contrast findings. It must hand off to `vision-contrast-review` whenever a theme's report has DOM `contrastRatio: 1` findings, because that skill is the review layer for AI/vision-model validation.

For each theme that needs review, run this 3-step chain **per theme** (not deferred to batch end):

1. **Audit (already done)** — use the theme result's `reportPaths.json` as the source. With `--annotate` the first-pass `annotatedScreenshot` is also already written.
2. **Vision review** — run `node .agents/skills/vision-contrast-review/scripts/run-vision-review.js <reportPaths.json>`.
   - The script auto-picks `cleanScreenshotPath` first, then `annotatedScreenshotPath`, then `screenshotPath`.
   - Always prefer the clean screenshot to avoid overlay-induced misperception.
3. **Re-annotate (only if `summary.falsePositive > 0`)** — run `node adaptive-eye-cli/src/cli.js annotate <reportPaths.json> --vision-review <vision-review.json> --no-open`. This **overwrites** the first-pass `<base>-annotated.png` with the false-positive boxes removed. Skip this step when `falsePositive == 0`; the existing first-pass annotated image already represents the final state for that theme.

Report DOM counts, vision verdict counts (`confirmed`, `likely`, `falsePositive`, `inconclusive`), and whether annotation was refreshed.

## Report Layout

Batch runs write:

- a root `index.json`
- a root `index.md`
- one subdirectory per tested theme

Each theme directory contains the normal single-page audit outputs for that theme.

## Boundaries

- Windows only
- Built-in contrast themes only
- This workflow is for contrast-theme batch execution, not general accessibility coverage
- Do not claim support for keyboard, focus-order, ARIA, or multi-page audits unless those features are implemented separately
