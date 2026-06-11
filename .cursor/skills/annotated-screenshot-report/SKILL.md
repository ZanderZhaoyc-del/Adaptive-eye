---
name: annotated-screenshot-report
description: Generate annotated screenshots from Adaptive Eye audit JSON reports. Use when the user wants accessibility findings visually boxed on a page screenshot, severity-colored issue overlays, or annotated screenshots inserted into reports.
---

# Annotated Screenshot Report

Use this skill after an Adaptive Eye audit has produced a JSON report.

## Command

Run from the project root directory:

```bash
node adaptive-eye-cli/src/cli.js annotate <report-json>
```

Example:

```bash
node adaptive-eye-cli/src/cli.js annotate adaptive-eye-cli/reports/run/contrast-report-example-com-2026-06-04-120000.json
```

## Behavior

The annotation command:

1. Reads the audit JSON report.
2. Opens `pageUrl` with `browser-use` unless `--no-open` is passed.
3. Captures a full-page screenshot.
4. Injects overlay boxes into the browser page using each finding's `boundingBox`.
5. Uses red boxes for `critical` issues and orange boxes for `warning` issues.
6. Writes `annotatedScreenshotPath` back into the JSON report.
7. Inserts an `Annotated Screenshot` section into the sibling Markdown report when it exists.

## Options

```bash
node adaptive-eye-cli/src/cli.js annotate <report-json> --out-dir reports/annotated
node adaptive-eye-cli/src/cli.js annotate <report-json> --no-open
```

## Fallback Notes

This command depends on DOM-derived `boundingBox` data. If findings have no bounding boxes, the generated PNG may have no visible issue boxes. In that case, use a vision-model workflow to estimate locations before annotation.
