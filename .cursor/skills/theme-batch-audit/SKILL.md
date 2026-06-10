---
name: theme-batch-audit
description: Run Adaptive Eye contrast audits across Windows contrast themes and generate per-theme JSON/Markdown reports with optional annotated screenshots. Use when the user wants to compare `none`, `aquatic`, `desert`, `dusk`, or `night-sky`, run batch contrast audits under Windows contrast themes, or summarize per-theme WCAG contrast results.
---

# Theme Batch Audit

Use this skill for Windows contrast-theme batch audits in Adaptive Eye.

Prefer the bundled CLI. Do not manually recreate theme switching, per-theme audit loops, or batch index generation unless the CLI itself fails.

## Command

Run from `c:\adaptive-eye`:

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

1. Read the generated root `index.json` or `index.md`
2. Tell the user:
   - tested themes
   - per-theme `issuesFound`, `criticalIssues`, and `warningIssues`
   - output directory
   - batch index paths
   - whether the original Windows theme was restored
3. If a theme failed, include its `status`, `errorMessage`, or warnings
4. If `--annotate` was used, include each available `annotatedScreenshot` path

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
