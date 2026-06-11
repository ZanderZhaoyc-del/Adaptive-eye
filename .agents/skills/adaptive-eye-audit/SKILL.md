---
name: adaptive-eye-audit
description: Run Adaptive Eye single-page WCAG color contrast audits and generate JSON/Markdown reports. Use when the user wants a normal one-page contrast audit for a URL, check WCAG AA/AAA contrast compliance, or summarize one-page contrast results. For Windows contrast-theme comparisons across `none`, `aquatic`, `desert`, `dusk`, or `night-sky`, use `theme-batch-audit` instead.
---

# Adaptive Eye Audit

Use this skill for normal single-page color contrast accessibility audits. The CLI is the source of truth for execution.

## Default Workflow

Run from `D:\code\Adaptive-eye`:

```bash
node adaptive-eye-cli/src/cli.js page <url> --report both
```

For example:

```bash
node adaptive-eye-cli/src/cli.js page https://www.baidu.com --report both
```

If the user wants to compare the same page across Windows contrast themes, do not loop manually here. Use `theme-batch-audit` instead.

## Annotated Screenshot Workflow

When the user asks to visually mark issues in the report, run annotation after the audit JSON is generated:

```bash
node adaptive-eye-cli/src/cli.js annotate <report-json>
```

This injects issue boxes into the browser page, captures a combined annotated PNG screenshot, updates the JSON report with `annotatedScreenshotPath`, and inserts an `Annotated Screenshot` section into the sibling Markdown report when available.

## Report Workflow

After running the CLI:

1. Locate the generated JSON and Markdown reports under `adaptive-eye-cli/reports/adaptive-eye-YYYY-MM-DD-HHMM/`, or under the `--out-dir` value if one was passed.
2. Read the JSON report before summarizing results.
3. Tell the user the total scanned elements, issue count, critical count, warning count, and report paths.
4. If `fallbackRequired` is `true`, tell the user the DOM audit returned `empty` or `error`.
5. If `summary.issuesFound > 0`, immediately use `vision-contrast-review` unless the user explicitly asked for DOM-only results. That review only sends DOM `contrastRatio` 1 findings to the vision model.
6. If `fallbackRequired` is `true` and `screenshotPath` exists, immediately use `vision-contrast-review`.
7. If `warnings` is non-empty, include those warnings without treating the entire audit as failed.
8. If `annotatedScreenshotPath` exists, include the annotated screenshot path in the response.

## Vision Review Handoff

Use `vision-contrast-review` as the follow-up layer for AI/vision-model validation of DOM `contrastRatio` 1 findings. Keep DOM measurements as the source audit and report vision verdicts separately.

When generating an annotated screenshot after vision review, pass the vision review JSON into annotation so `false-positive` findings are excluded from the final image.

## Useful Options

```bash
node adaptive-eye-cli/src/cli.js page <url> --report json
node adaptive-eye-cli/src/cli.js page <url> --report markdown
node adaptive-eye-cli/src/cli.js page <url> --out-dir reports/<run-name>
node adaptive-eye-cli/src/cli.js page <url> --no-screenshot
node adaptive-eye-cli/src/cli.js annotate <report-json>
```

## Boundaries

Do not claim full accessibility coverage. This skill covers single-page WCAG color contrast through DOM analysis and annotated screenshots from DOM bounding boxes.

This skill does not cover:

- Windows contrast-theme batch execution across `none`, `aquatic`, `desert`, `dusk`, or `night-sky`
- Multi-page crawling
- Keyboard, focus-order, ARIA, screen-reader, or other non-contrast accessibility audits

For Windows contrast-theme comparison runs, use `theme-batch-audit`.
