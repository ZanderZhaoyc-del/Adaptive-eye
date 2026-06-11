---
name: theme-batch-audit
description: Run Adaptive Eye contrast audits across Windows contrast themes and generate per-theme JSON/Markdown reports with optional annotated screenshots. Use when the user wants to compare `none`, `aquatic`, `desert`, `dusk`, or `night-sky`, run batch contrast audits under Windows contrast themes, or summarize per-theme WCAG contrast results.
---

# Theme Batch Audit

Use this skill for Windows contrast-theme batch audits in Adaptive Eye.

Prefer the bundled CLI. Do not manually recreate theme switching, per-theme audit loops, or batch index generation unless the CLI itself fails.

## Command

Run from `D:\code\Adaptive-eye`:

```bash
node adaptive-eye-cli/src/cli.js themes <url>
```

Example:

```bash
node adaptive-eye-cli/src/cli.js themes https://www.baidu.com
```

## Common Variants

Use these when needed:

```bash
node adaptive-eye-cli/src/cli.js themes <url> --themes none,dusk
node adaptive-eye-cli/src/cli.js themes <url> --themes aquatic,night-sky --report json
node adaptive-eye-cli/src/cli.js themes <url> --themes none --report both --annotate
node adaptive-eye-cli/src/cli.js themes <url> --out-dir reports/theme-batch-run
```

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

## Output Handling

After the command finishes:

1. Read the generated root `index.json` or `index.md`.
2. Tell the user the tested themes, per-theme `issuesFound`, `criticalIssues`, and `warningIssues`, output directory, batch index paths, and whether the original Windows theme was restored.
3. If a theme failed, include its `status`, `errorMessage`, or warnings.
4. If `--annotate` was used, include each available `annotatedScreenshot` path.
5. If any successful theme has `summary.issuesFound > 0`, immediately use `vision-contrast-review` on that theme's JSON report unless the user explicitly asked for DOM-only results. That review only sends DOM `contrastRatio` 1 findings to the vision model.
6. If any successful theme report has `fallbackRequired: true`, immediately use `vision-contrast-review` when a screenshot path is available.

## Vision Review Handoff

The theme batch audit is the producer of contrast findings. It must hand off to `vision-contrast-review` when findings exist, because that skill is the review layer for AI/vision-model validation of DOM `contrastRatio` 1 findings.

For each theme that needs review:

1. Use the theme result's `reportPaths.json` as the source report.
2. Prefer the theme result's `reportPaths.annotatedScreenshot` when `--annotate` was used.
3. Run vision review after summarizing the DOM findings, not as a replacement for the DOM audit.
4. If vision review marks any finding `false-positive`, pass the vision review JSON into annotation so those findings are not boxed in the final annotated screenshot.
5. Report both DOM counts and vision-review verdict counts, including how many findings were eligible for vision review.

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
