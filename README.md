# Adaptive Eye CLI

Reusable CLI for browser-use based accessibility audits.

This first version focuses on single-page WCAG contrast audits:

1. Open a page with `browser-use`.
2. Run a DOM-based contrast audit through `browser-use eval`.
3. Normalize the result.
4. Write JSON and/or Markdown reports.
5. Capture a fallback screenshot when the DOM audit returns `empty` or `error`.

## Usage

From this folder:

```bash
node src/cli.js page https://example.com
```

## Prerequisites (Local, Windows)

This CLI is a thin wrapper around the `browser-use` command-line tool.

### 1) Install Node.js (>= 18) + npm

Node.js installation includes `npm`.

PowerShell:

```powershell
node -v
npm -v
```

If you don't have Node.js yet (example via Winget):

```powershell
winget install OpenJS.NodeJS.LTS
```

### 2) Install Python (>= 3.10) + pip

PowerShell:

```powershell
py --version
python --version
python -m pip --version
```

If you don't have Python yet (example via Winget):

```powershell
winget install Python.Python.3.11
```

### 3) Install `browser-use`

PowerShell:

```powershell
py -m pip install -U browser-use
```

Verify the CLI is available:

```powershell
browser-use --help
```

If you see Playwright-related errors, install the browser dependencies (only if needed):

```powershell
python -m playwright install
```

### 4) (Optional) Install npm packages

At the moment, `adaptive-eye-cli` only relies on Node.js built-ins, so no extra `npm install` is required to run the CLI scripts.
If the project later adds JS dependencies, run `npm install` from this folder.

Options:

```bash
node src/cli.js page https://example.com --report markdown --out-dir reports
node src/cli.js page https://example.com --report json
node src/cli.js page https://example.com --no-open
node src/cli.js page https://example.com --no-screenshot
node src/cli.js page https://example.com --script path/to/custom-browser-script.js
node src/cli.js annotate reports/contrast-report-example-com-2026-06-04-120000.json
```

## Output

By default, each run is written to a minute-level folder:

```text
reports/adaptive-eye-{YYYY-MM-DD-HHMM}/
```

Inside that folder:

```text
contrast-report-{domain}-{YYYY-MM-DD-HHMMSS}.json
contrast-report-{domain}-{YYYY-MM-DD-HHMMSS}.md
contrast-report-{domain}-{YYYY-MM-DD-HHMMSS}-annotated.png
```

If the DOM audit needs fallback and screenshot capture is enabled:

```text
contrast-fallback-{domain}-{YYYY-MM-DD-HHMMSS}.png
```

## Skill Integration

A Cursor skill can call this CLI instead of manually running each browser-use step:

```bash
node adaptive-eye-cli/src/cli.js page https://example.com --report both
```

The skill should treat `fallbackRequired: true` in the JSON report as the signal to run a vision-language-model audit against the captured screenshot.

To add severity-colored boxes to a report screenshot, run:

```bash
node adaptive-eye-cli/src/cli.js annotate <report-json>
```

## Current Scope

Implemented:

- Single-page contrast audit
- DOM-first browser-use eval flow
- Markdown and JSON reports
- Screenshot capture signal for visual fallback

Planned:

- Vision model fallback execution
- Site crawler for reachable pages
- Pluggable visual accessibility audits
