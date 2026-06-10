# Contrast Theme Batch Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Windows-only `adaptive-eye themes <url>` command that runs the existing page contrast audit across `none`, `aquatic`, `desert`, `dusk`, and `night-sky`, optionally annotates each result, writes per-theme outputs, generates batch index files, and restores the original Windows theme afterward.

**Architecture:** Keep single-page auditing and annotation unchanged as reusable building blocks. Add a thin CLI parsing layer, a Windows contrast-theme adapter for system state and theme application, a batch runner that orchestrates per-theme audits, and report-generator helpers for `index.json` / `index.md`.

**Tech Stack:** Node.js ESM, `node:test`, PowerShell theme application via `.theme` files, Windows registry queries for theme state, existing `adaptive-eye-cli` audit and annotation modules.

---

## File Structure

**Create:**

- `adaptive-eye-cli/src/theme-runner.js`
- `adaptive-eye-cli/src/windows-contrast-theme.js`
- `adaptive-eye-cli/test/theme-runner.test.js`
- `adaptive-eye-cli/test/windows-contrast-theme.test.js`

**Modify:**

- `adaptive-eye-cli/src/cli-options.js`
- `adaptive-eye-cli/src/cli.js`
- `adaptive-eye-cli/src/report-generator.js`
- `adaptive-eye-cli/test/cli-options.test.js`
- `adaptive-eye-cli/test/report-generator.test.js`

**Existing dependencies to reuse:**

- `adaptive-eye-cli/src/audit-runner.js`
- `adaptive-eye-cli/src/annotator.js`

## Task 1: Add `themes` CLI parsing

**Files:**

- Modify: `adaptive-eye-cli/src/cli-options.js`
- Test: `adaptive-eye-cli/test/cli-options.test.js`

- [ ] **Step 1: Write the failing CLI parsing tests**

Add these tests to `adaptive-eye-cli/test/cli-options.test.js`:

```js
test('parses themes command with default theme order', () => {
  const options = parseCliArgs(['themes', 'https://example.com']);

  assert.equal(options.command, 'themes');
  assert.equal(options.url, 'https://example.com');
  assert.deepEqual(options.themes, ['none', 'aquatic', 'desert', 'dusk', 'night-sky']);
  assert.equal(options.report, 'both');
  assert.equal(options.annotate, false);
  assert.equal(options.openBrowser, true);
  assert.equal(options.screenshotOnFallback, true);
});

test('parses explicit themes command options in caller order', () => {
  const options = parseCliArgs([
    'themes',
    'https://example.com',
    '--themes',
    'night-sky,none,dusk',
    '--report',
    'json',
    '--annotate',
    '--out-dir',
    'reports/themes',
    '--script',
    'custom.js',
    '--no-open',
    '--no-screenshot'
  ]);

  assert.deepEqual(options.themes, ['night-sky', 'none', 'dusk']);
  assert.equal(options.report, 'json');
  assert.equal(options.annotate, true);
  assert.equal(options.outDir, 'reports/themes');
  assert.equal(options.scriptPath, 'custom.js');
  assert.equal(options.openBrowser, false);
  assert.equal(options.screenshotOnFallback, false);
});

test('rejects invalid themes command theme names', () => {
  assert.throws(
    () => parseCliArgs(['themes', 'https://example.com', '--themes', 'none,aurora']),
    /Unsupported contrast theme/
  );

  assert.throws(
    () => parseCliArgs(['themes', 'https://example.com', '--themes', '']),
    /Missing value for --themes/
  );
});
```

- [ ] **Step 2: Run the CLI parsing test to confirm failure**

Run:

```bash
node --test "adaptive-eye-cli/test/cli-options.test.js"
```

Expected: FAIL with missing `themes` command support and/or unknown `--annotate` / `--themes` option errors.

- [ ] **Step 3: Implement `themes` parsing and validation**

Update `adaptive-eye-cli/src/cli-options.js` with a shared theme constant list and a new `parseThemesArgs()` path:

```js
const REPORT_FORMATS = new Set(['json', 'markdown', 'both']);
export const SUPPORTED_CONTRAST_THEMES = ['none', 'aquatic', 'desert', 'dusk', 'night-sky'];
const SUPPORTED_CONTRAST_THEME_SET = new Set(SUPPORTED_CONTRAST_THEMES);

export function parseCliArgs(argv) {
  const [command, target, ...rest] = argv;

  if (!command || command === '--help' || command === '-h') {
    return { command: 'help' };
  }

  if (command === 'annotate') {
    return parseAnnotateArgs(target, rest);
  }

  if (command === 'themes') {
    return parseThemesArgs(target, rest);
  }

  if (command !== 'page') {
    throw new Error(`Unsupported command: ${command}`);
  }

  // existing page parsing remains here
}

function parseThemesArgs(url, rest) {
  if (!url) {
    throw new Error('Missing required URL for theme batch audit.');
  }

  const options = {
    command: 'themes',
    url,
    themes: [...SUPPORTED_CONTRAST_THEMES],
    report: 'both',
    outDir: undefined,
    scriptPath: undefined,
    annotate: false,
    openBrowser: true,
    screenshotOnFallback: true
  };

  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];

    if (flag === '--themes') {
      options.themes = parseThemesList(readFlagValue(rest, index, flag));
      index += 1;
      continue;
    }

    if (flag === '--annotate') {
      options.annotate = true;
      continue;
    }

    if (flag === '--report') {
      options.report = readFlagValue(rest, index, flag);
      index += 1;
      continue;
    }

    if (flag === '--out-dir') {
      options.outDir = readFlagValue(rest, index, flag);
      index += 1;
      continue;
    }

    if (flag === '--script') {
      options.scriptPath = readFlagValue(rest, index, flag);
      index += 1;
      continue;
    }

    if (flag === '--no-open') {
      options.openBrowser = false;
      continue;
    }

    if (flag === '--no-screenshot') {
      options.screenshotOnFallback = false;
      continue;
    }

    throw new Error(`Unknown option: ${flag}`);
  }

  if (!REPORT_FORMATS.has(options.report)) {
    throw new Error(`Unsupported report format: ${options.report}`);
  }

  return options;
}

function parseThemesList(value) {
  const themes = value.split(',').map((item) => item.trim()).filter(Boolean);

  if (themes.length === 0) {
    throw new Error('Unsupported contrast theme list: no themes provided.');
  }

  themes.forEach((theme) => {
    if (!SUPPORTED_CONTRAST_THEME_SET.has(theme)) {
      throw new Error(`Unsupported contrast theme: ${theme}`);
    }
  });

  return themes;
}
```

Extend `helpText()` with:

```js
'  adaptive-eye themes <url> [options]',
'',
'Theme batch options:',
'  --themes <list>                Comma-separated list: none,aquatic,desert,dusk,night-sky',
'  --report <json|markdown|both>  Report output format. Default: both',
'  --out-dir <path>               Output directory. Default: reports/adaptive-eye-YYYY-MM-DD-HHMM',
'  --annotate                     Generate annotated screenshot per theme after JSON report creation',
'  --script <path>                Browser eval script path.',
'  --no-open                      Skip browser-use open.',
'  --no-screenshot                Skip fallback screenshot capture.',
```

- [ ] **Step 4: Re-run the CLI parsing test to confirm it passes**

Run:

```bash
node --test "adaptive-eye-cli/test/cli-options.test.js"
```

Expected: PASS for all existing tests plus the new `themes` command tests.

## Task 2: Implement Windows contrast-theme switching

**Files:**

- Create: `adaptive-eye-cli/src/windows-contrast-theme.js`
- Test: `adaptive-eye-cli/test/windows-contrast-theme.test.js`

- [ ] **Step 1: Write failing tests for theme mapping, state capture, and restore**

Create `adaptive-eye-cli/test/windows-contrast-theme.test.js` with:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONTRAST_THEME_FILES,
  DEFAULT_NONE_THEME_PATH,
  buildThemeApplicationCommand,
  resolveNoneThemePath,
  getInitialThemeState
} from '../src/windows-contrast-theme.js';

test('maps logical contrast themes to Windows ease-of-access theme files', () => {
  assert.equal(CONTRAST_THEME_FILES.aquatic, 'C:\\Windows\\resources\\Ease of Access Themes\\hcblack.theme');
  assert.equal(CONTRAST_THEME_FILES.desert, 'C:\\Windows\\resources\\Ease of Access Themes\\hcwhite.theme');
  assert.equal(CONTRAST_THEME_FILES.dusk, 'C:\\Windows\\resources\\Ease of Access Themes\\hc1.theme');
  assert.equal(CONTRAST_THEME_FILES['night-sky'], 'C:\\Windows\\resources\\Ease of Access Themes\\hc2.theme');
});

test('prefers pre-high-contrast scheme for explicit none theme', () => {
  const state = {
    currentTheme: 'C:\\Users\\admin\\AppData\\Local\\Microsoft\\Windows\\Themes\\Custom.theme',
    preHighContrastTheme: 'C:\\Users\\admin\\AppData\\Local\\Microsoft\\Windows\\Themes\\Saved.theme'
  };

  assert.equal(resolveNoneThemePath(state), 'C:\\Users\\admin\\AppData\\Local\\Microsoft\\Windows\\Themes\\Saved.theme');
});

test('falls back to current theme and then aero for explicit none theme', () => {
  assert.equal(
    resolveNoneThemePath({ currentTheme: 'C:\\Users\\admin\\AppData\\Local\\Microsoft\\Windows\\Themes\\Custom.theme' }),
    'C:\\Users\\admin\\AppData\\Local\\Microsoft\\Windows\\Themes\\Custom.theme'
  );

  assert.equal(resolveNoneThemePath({}), DEFAULT_NONE_THEME_PATH);
});

test('captures original state from registry values', async () => {
  const state = await getInitialThemeState({
    readRegistryValues: async () => ({
      currentTheme: 'C:\\Users\\admin\\AppData\\Local\\Microsoft\\Windows\\Themes\\Custom.theme',
      lastHighContrastTheme: 'C:\\Windows\\resources\\Ease of Access Themes\\hcwhite.theme',
      preHighContrastTheme: 'C:\\Users\\admin\\AppData\\Local\\Microsoft\\Windows\\Themes\\Saved.theme'
    })
  });

  assert.equal(state.currentTheme, 'C:\\Users\\admin\\AppData\\Local\\Microsoft\\Windows\\Themes\\Custom.theme');
  assert.equal(state.lastHighContrastTheme, 'C:\\Windows\\resources\\Ease of Access Themes\\hcwhite.theme');
  assert.equal(state.preHighContrastTheme, 'C:\\Users\\admin\\AppData\\Local\\Microsoft\\Windows\\Themes\\Saved.theme');
});

test('builds theme application command with settings cleanup', () => {
  assert.equal(
    buildThemeApplicationCommand('C:\\Windows\\resources\\Ease of Access Themes\\hc1.theme'),
    'Start-Process -FilePath "C:\\Windows\\resources\\Ease of Access Themes\\hc1.theme"; Start-Sleep -Seconds 2; Stop-Process -Name systemsettings -ErrorAction SilentlyContinue'
  );
});
```

- [ ] **Step 2: Run the Windows theme test to confirm failure**

Run:

```bash
node --test "adaptive-eye-cli/test/windows-contrast-theme.test.js"
```

Expected: FAIL because the module does not exist yet.

- [ ] **Step 3: Implement the Windows theme adapter**

Create `adaptive-eye-cli/src/windows-contrast-theme.js`:

```js
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const DEFAULT_NONE_THEME_PATH = 'C:\\Windows\\Resources\\Themes\\aero.theme';

export const CONTRAST_THEME_FILES = {
  aquatic: 'C:\\Windows\\resources\\Ease of Access Themes\\hcblack.theme',
  desert: 'C:\\Windows\\resources\\Ease of Access Themes\\hcwhite.theme',
  dusk: 'C:\\Windows\\resources\\Ease of Access Themes\\hc1.theme',
  'night-sky': 'C:\\Windows\\resources\\Ease of Access Themes\\hc2.theme'
};

export async function getInitialThemeState(deps = {}) {
  const readRegistryValues = deps.readRegistryValues || defaultReadRegistryValues;
  return readRegistryValues();
}

export function resolveNoneThemePath(state = {}) {
  return state.preHighContrastTheme || state.currentTheme || DEFAULT_NONE_THEME_PATH;
}

export function buildThemeApplicationCommand(themePath) {
  return `Start-Process -FilePath "${themePath}"; Start-Sleep -Seconds 2; Stop-Process -Name systemsettings -ErrorAction SilentlyContinue`;
}

export async function applyContrastTheme(theme, state, deps = {}) {
  const runPowerShell = deps.runPowerShell || defaultRunPowerShell;
  const sleep = deps.sleep || defaultSleep;
  const themePath = theme === 'none' ? resolveNoneThemePath(state) : CONTRAST_THEME_FILES[theme];

  if (!themePath) {
    throw new Error(`No Windows theme path configured for ${theme}.`);
  }

  await runPowerShell(buildThemeApplicationCommand(themePath));
  await sleep(1500);

  return {
    theme,
    themePath
  };
}

export async function restoreOriginalTheme(state, deps = {}) {
  const themePath = state.currentTheme || state.preHighContrastTheme || DEFAULT_NONE_THEME_PATH;
  const runPowerShell = deps.runPowerShell || defaultRunPowerShell;
  const sleep = deps.sleep || defaultSleep;

  await runPowerShell(buildThemeApplicationCommand(themePath));
  await sleep(1500);

  return themePath;
}

async function defaultReadRegistryValues() {
  const currentTheme = await readRegistryValue('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes', 'CurrentTheme');
  const lastHighContrastTheme = await readRegistryValue('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes', 'LastHighContrastTheme');
  const preHighContrastTheme = await readRegistryValue('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\HighContrast', 'Pre-High Contrast Scheme');

  return {
    currentTheme,
    lastHighContrastTheme,
    preHighContrastTheme
  };
}

async function readRegistryValue(key, valueName) {
  try {
    const { stdout } = await execFileAsync('reg', ['query', key, '/v', valueName], { windowsHide: true });
    const line = stdout.split(/\r?\n/).find((entry) => entry.includes(` ${valueName}`));
    return line ? line.trim().split(/\s{2,}/).pop() : '';
  } catch {
    return '';
  }
}

async function defaultRunPowerShell(script) {
  await execFileAsync('powershell', ['-NoProfile', '-Command', script], { windowsHide: true });
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

- [ ] **Step 4: Re-run the Windows theme test to confirm it passes**

Run:

```bash
node --test "adaptive-eye-cli/test/windows-contrast-theme.test.js"
```

Expected: PASS with deterministic theme mapping and restore-path behavior.

## Task 3: Add batch report helpers

**Files:**

- Modify: `adaptive-eye-cli/src/report-generator.js`
- Test: `adaptive-eye-cli/test/report-generator.test.js`

- [ ] **Step 1: Write failing tests for batch index output**

Append these tests to `adaptive-eye-cli/test/report-generator.test.js`:

```js
import {
  buildThemeBatchIndex,
  generateThemeBatchMarkdownReport
} from '../src/report-generator.js';

test('builds stable JSON summary for theme batch audit', () => {
  const index = buildThemeBatchIndex({
    pageUrl: 'https://example.com',
    generatedAt: '2026-06-05T06:00:00.000Z',
    requestedThemes: ['none', 'dusk'],
    executedThemes: ['none', 'dusk'],
    originalTheme: { currentTheme: 'C:\\Users\\admin\\AppData\\Local\\Microsoft\\Windows\\Themes\\Custom.theme' },
    restoredOriginalTheme: true,
    results: [
      {
        theme: 'none',
        status: 'success',
        summary: { issuesFound: 1, criticalIssues: 1, warningIssues: 0 },
        reportPaths: { json: 'reports/none/audit.json', markdown: 'reports/none/audit.md', annotatedScreenshot: '' },
        warnings: []
      }
    ]
  });

  assert.equal(index.auditType, 'contrast-theme-batch');
  assert.equal(index.pageUrl, 'https://example.com');
  assert.equal(index.restoredOriginalTheme, true);
  assert.equal(index.results[0].theme, 'none');
});

test('renders markdown batch report with missing annotated screenshots safely', () => {
  const markdown = generateThemeBatchMarkdownReport({
    pageUrl: 'https://example.com',
    generatedAt: '2026-06-05T06:00:00.000Z',
    executedThemes: ['none', 'aquatic'],
    restoredOriginalTheme: false,
    restoreError: 'Could not restore original theme.',
    results: [
      {
        theme: 'none',
        status: 'success',
        summary: { issuesFound: 1, criticalIssues: 1, warningIssues: 0 },
        reportPaths: { json: 'reports/none/audit.json', markdown: 'reports/none/audit.md', annotatedScreenshot: '' },
        warnings: []
      },
      {
        theme: 'aquatic',
        status: 'theme_switch_failed',
        summary: { issuesFound: 0, criticalIssues: 0, warningIssues: 0 },
        reportPaths: { json: '', markdown: '', annotatedScreenshot: '' },
        warnings: ['PowerShell failed']
      }
    ]
  });

  assert.match(markdown, /# Contrast Theme Batch Audit Report/);
  assert.match(markdown, /\| none \| success \| 1 \| 1 \| 0 \|/);
  assert.match(markdown, /\| aquatic \| theme_switch_failed \| 0 \| 0 \| 0 \|/);
  assert.match(markdown, /Could not restore original theme\./);
});
```

- [ ] **Step 2: Run the report generator test to confirm failure**

Run:

```bash
node --test "adaptive-eye-cli/test/report-generator.test.js"
```

Expected: FAIL because the batch helper exports do not exist yet.

- [ ] **Step 3: Implement batch index builders**

Add these exports to `adaptive-eye-cli/src/report-generator.js`:

```js
export function buildThemeBatchIndex({
  pageUrl,
  generatedAt,
  requestedThemes,
  executedThemes,
  originalTheme,
  restoredOriginalTheme,
  restoreError = '',
  results
}) {
  return {
    auditType: 'contrast-theme-batch',
    pageUrl,
    generatedAt,
    platform: process.platform,
    requestedThemes,
    executedThemes,
    restoredOriginalTheme,
    originalTheme,
    restoreError,
    results
  };
}

export function generateThemeBatchMarkdownReport(batch) {
  const rows = [
    '| Theme | Result | Issues Found | Critical | Warning | JSON Report | Markdown Report | Annotated Screenshot |',
    '|-------|--------|--------------|----------|---------|-------------|-----------------|----------------------|'
  ];

  batch.results.forEach((result) => {
    rows.push([
      result.theme,
      result.status,
      result.summary?.issuesFound ?? 0,
      result.summary?.criticalIssues ?? 0,
      result.summary?.warningIssues ?? 0,
      formatOptionalPath(result.reportPaths?.json),
      formatOptionalPath(result.reportPaths?.markdown),
      formatOptionalPath(result.reportPaths?.annotatedScreenshot)
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  });

  const warningLines = batch.results.flatMap((result) => (
    (result.warnings || []).map((warning) => `- \`${result.theme}\`: ${warning}`)
  ));

  return [
    '# Contrast Theme Batch Audit Report',
    '',
    `**URL:** ${batch.pageUrl}`,
    `**Date:** ${batch.generatedAt}`,
    `**Themes:** ${(batch.executedThemes || []).join(', ')}`,
    `**Original Theme Restored:** ${batch.restoredOriginalTheme ? 'Yes' : 'No'}`,
    batch.restoreError ? `**Restore Error:** ${batch.restoreError}` : '',
    '',
    '## Results',
    '',
    rows.join('\n'),
    '',
    '## Warnings',
    '',
    warningLines.length > 0 ? warningLines.join('\n') : 'No warnings.',
    ''
  ].filter(Boolean).join('\n');
}

function formatOptionalPath(value) {
  return value ? `\`${value}\`` : '-';
}
```

- [ ] **Step 4: Re-run the report generator test to confirm it passes**

Run:

```bash
node --test "adaptive-eye-cli/test/report-generator.test.js"
```

Expected: PASS for both the original single-page report tests and the new batch-report tests.

## Task 4: Build the theme batch runner

**Files:**

- Create: `adaptive-eye-cli/src/theme-runner.js`
- Modify: `adaptive-eye-cli/src/report-generator.js`
- Test: `adaptive-eye-cli/test/theme-runner.test.js`

- [ ] **Step 1: Write failing tests for orchestration, annotate integration, and restore-on-finally**

Create `adaptive-eye-cli/test/theme-runner.test.js`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { runThemeAuditBatch } from '../src/theme-runner.js';

test('runs default themes in order and writes batch index files', async () => {
  const writes = new Map();
  const mkdirs = [];
  const appliedThemes = [];

  const result = await runThemeAuditBatch({
    url: 'https://example.com',
    themes: ['none', 'aquatic'],
    report: 'both',
    annotate: false,
    outDir: 'reports/run',
    now: new Date('2026-06-05T06:00:00.000Z')
  }, {
    ensureDir: async (dirPath) => mkdirs.push(dirPath),
    writeTextFile: async (filePath, content) => writes.set(filePath, content),
    getInitialThemeState: async () => ({ currentTheme: 'C:\\Users\\admin\\AppData\\Local\\Microsoft\\Windows\\Themes\\Custom.theme' }),
    applyContrastTheme: async (theme) => { appliedThemes.push(theme); },
    restoreOriginalTheme: async () => {},
    runPageAudit: async ({ outDir }) => ({
      normalized: {
        pageUrl: 'https://example.com',
        summary: { issuesFound: 1, criticalIssues: 1, warningIssues: 0 }
      },
      writtenFiles: [`${outDir}\\audit.json`, `${outDir}\\audit.md`],
      warnings: []
    }),
    runAnnotation: async () => {
      throw new Error('annotation should not run');
    }
  });

  assert.deepEqual(appliedThemes, ['none', 'aquatic']);
  assert.equal(result.results.length, 2);
  assert.ok(writes.has('reports/run\\index.json'));
  assert.ok(writes.has('reports/run\\index.md'));
  assert.ok(mkdirs.includes('reports/run\\none'));
  assert.ok(mkdirs.includes('reports/run\\aquatic'));
});

test('runs annotation when requested and JSON output exists', async () => {
  const annotateCalls = [];

  const result = await runThemeAuditBatch({
    url: 'https://example.com',
    themes: ['none'],
    report: 'json',
    annotate: true,
    outDir: 'reports/run'
  }, {
    ensureDir: async () => {},
    writeTextFile: async () => {},
    getInitialThemeState: async () => ({ currentTheme: 'C:\\Users\\admin\\AppData\\Local\\Microsoft\\Windows\\Themes\\Custom.theme' }),
    applyContrastTheme: async () => {},
    restoreOriginalTheme: async () => {},
    runPageAudit: async ({ outDir }) => ({
      normalized: {
        pageUrl: 'https://example.com',
        summary: { issuesFound: 1, criticalIssues: 1, warningIssues: 0 }
      },
      writtenFiles: [`${outDir}\\audit.json`],
      warnings: []
    }),
    runAnnotation: async (options) => {
      annotateCalls.push(options.reportPath);
      return { annotatedScreenshotPath: 'reports/run/none/audit-annotated.png', warnings: [] };
    }
  });

  assert.deepEqual(annotateCalls, ['reports/run\\none\\audit.json']);
  assert.equal(result.results[0].reportPaths.annotatedScreenshot, 'reports/run/none/audit-annotated.png');
});

test('continues after a theme switch failure and always attempts restore', async () => {
  const appliedThemes = [];
  let restored = false;

  const result = await runThemeAuditBatch({
    url: 'https://example.com',
    themes: ['none', 'dusk'],
    report: 'json',
    annotate: false,
    outDir: 'reports/run'
  }, {
    ensureDir: async () => {},
    writeTextFile: async () => {},
    getInitialThemeState: async () => ({ currentTheme: 'C:\\Users\\admin\\AppData\\Local\\Microsoft\\Windows\\Themes\\Custom.theme' }),
    applyContrastTheme: async (theme) => {
      appliedThemes.push(theme);
      if (theme === 'none') {
        throw new Error('Could not disable high contrast.');
      }
    },
    restoreOriginalTheme: async () => { restored = true; },
    runPageAudit: async () => ({
      normalized: {
        pageUrl: 'https://example.com',
        summary: { issuesFound: 0, criticalIssues: 0, warningIssues: 0 }
      },
      writtenFiles: [],
      warnings: []
    }),
    runAnnotation: async () => ({ annotatedScreenshotPath: '', warnings: [] })
  });

  assert.deepEqual(appliedThemes, ['none', 'dusk']);
  assert.equal(result.results[0].status, 'theme_switch_failed');
  assert.equal(result.results[1].status, 'success');
  assert.equal(restored, true);
});
```

- [ ] **Step 2: Run the batch runner test to confirm failure**

Run:

```bash
node --test "adaptive-eye-cli/test/theme-runner.test.js"
```

Expected: FAIL because `theme-runner.js` does not exist yet.

- [ ] **Step 3: Implement the batch runner**

Create `adaptive-eye-cli/src/theme-runner.js`:

```js
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

import { runPageAudit, buildDefaultRunDirectory } from './audit-runner.js';
import { runAnnotation } from './annotator.js';
import {
  buildThemeBatchIndex,
  generateThemeBatchMarkdownReport
} from './report-generator.js';
import {
  applyContrastTheme,
  getInitialThemeState,
  restoreOriginalTheme
} from './windows-contrast-theme.js';

export async function runThemeAuditBatch(options, dependencies = {}) {
  if (process.platform !== 'win32') {
    throw new Error('Contrast theme batch audit is only supported on Windows.');
  }

  const deps = {
    ensureDir: (dirPath) => mkdir(dirPath, { recursive: true }),
    writeTextFile: (filePath, content) => writeFile(filePath, content, 'utf8'),
    runPageAudit,
    runAnnotation,
    getInitialThemeState,
    applyContrastTheme,
    restoreOriginalTheme,
    ...dependencies
  };

  const now = options.now || new Date();
  const outDir = options.outDir || buildDefaultRunDirectory(now);
  const originalTheme = await deps.getInitialThemeState();
  const results = [];
  let restoredOriginalTheme = false;
  let restoreError = '';

  await deps.ensureDir(outDir);

  try {
    for (const theme of options.themes) {
      const themeDir = path.join(outDir, theme);
      await deps.ensureDir(themeDir);

      try {
        await deps.applyContrastTheme(theme, originalTheme);
      } catch (error) {
        results.push({
          theme,
          status: 'theme_switch_failed',
          summary: { issuesFound: 0, criticalIssues: 0, warningIssues: 0 },
          reportPaths: { json: '', markdown: '', annotatedScreenshot: '' },
          warnings: [],
          errorMessage: error.message || String(error)
        });
        continue;
      }

      try {
        const auditResult = await deps.runPageAudit({
          ...options,
          command: 'page',
          outDir: themeDir
        });

        const jsonPath = auditResult.writtenFiles.find((filePath) => filePath.endsWith('.json')) || '';
        const markdownPath = auditResult.writtenFiles.find((filePath) => filePath.endsWith('.md')) || '';
        let annotatedScreenshotPath = '';
        const warnings = [...auditResult.warnings];
        let status = 'success';

        if (options.annotate && jsonPath) {
          try {
            const annotationResult = await deps.runAnnotation({
              command: 'annotate',
              reportPath: jsonPath,
              outDir: themeDir,
              openBrowser: options.openBrowser
            });
            annotatedScreenshotPath = annotationResult.annotatedScreenshotPath;
            warnings.push(...annotationResult.warnings);
          } catch (error) {
            status = 'annotation_failed';
            warnings.push(`Annotation failed: ${error.message || error}`);
          }
        }

        results.push({
          theme,
          status,
          summary: auditResult.normalized.summary,
          reportPaths: {
            json: jsonPath,
            markdown: markdownPath,
            annotatedScreenshot: annotatedScreenshotPath
          },
          warnings,
          errorMessage: ''
        });
      } catch (error) {
        results.push({
          theme,
          status: 'audit_failed',
          summary: { issuesFound: 0, criticalIssues: 0, warningIssues: 0 },
          reportPaths: { json: '', markdown: '', annotatedScreenshot: '' },
          warnings: [],
          errorMessage: error.message || String(error)
        });
      }
    }
  } finally {
    try {
      await deps.restoreOriginalTheme(originalTheme);
      restoredOriginalTheme = true;
    } catch (error) {
      restoreError = error.message || String(error);
    }
  }

  const batchIndex = buildThemeBatchIndex({
    pageUrl: options.url,
    generatedAt: now.toISOString(),
    requestedThemes: options.themes,
    executedThemes: results.map((result) => result.theme),
    originalTheme,
    restoredOriginalTheme,
    restoreError,
    results
  });

  const jsonIndexPath = path.join(outDir, 'index.json');
  const markdownIndexPath = path.join(outDir, 'index.md');

  await deps.writeTextFile(jsonIndexPath, `${JSON.stringify(batchIndex, null, 2)}\n`);
  await deps.writeTextFile(markdownIndexPath, `${generateThemeBatchMarkdownReport(batchIndex)}\n`);

  return {
    outDir,
    indexJsonPath: jsonIndexPath,
    indexMarkdownPath: markdownIndexPath,
    restoredOriginalTheme,
    restoreError,
    results
  };
}
```

- [ ] **Step 4: Re-run the batch runner test to confirm it passes**

Run:

```bash
node --test "adaptive-eye-cli/test/theme-runner.test.js"
```

Expected: PASS for default ordering, annotate integration, failure continuation, and restore behavior.

## Task 5: Wire the CLI entrypoint and run focused verification

**Files:**

- Modify: `adaptive-eye-cli/src/cli.js`
- Modify: `adaptive-eye-cli/src/cli-options.js`
- Test: `adaptive-eye-cli/test/cli-options.test.js`

- [ ] **Step 1: Add a failing integration test for CLI help text if needed**

If `adaptive-eye-cli/test/cli-options.test.js` does not already assert help text content, add:

```js
import { helpText } from '../src/cli-options.js';

test('includes themes command in help text', () => {
  const help = helpText();

  assert.match(help, /adaptive-eye themes <url> \[options\]/);
  assert.match(help, /--themes <list>/);
  assert.match(help, /--annotate/);
});
```

- [ ] **Step 2: Run the CLI options test to confirm any new help assertion fails before `cli.js` wiring**

Run:

```bash
node --test "adaptive-eye-cli/test/cli-options.test.js"
```

Expected: PASS if only help text changed in Task 1, or FAIL if this new assertion was just added and help text is still incomplete.

- [ ] **Step 3: Wire the `themes` command in `cli.js`**

Update `adaptive-eye-cli/src/cli.js`:

```js
#!/usr/bin/env node
import { parseCliArgs, helpText } from './cli-options.js';
import { runPageAudit } from './audit-runner.js';
import { runAnnotation } from './annotator.js';
import { runThemeAuditBatch } from './theme-runner.js';

async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);

  if (options.command === 'help') {
    console.log(helpText());
    return;
  }

  if (options.command === 'annotate') {
    const result = await runAnnotation(options);
    console.log(`Annotation complete: ${result.reportPath}`);
    console.log(`Annotated screenshot written: ${result.annotatedScreenshotPath}`);
    result.warnings.forEach((warning) => {
      console.log(`Warning: ${warning}`);
    });
    return;
  }

  if (options.command === 'themes') {
    const result = await runThemeAuditBatch(options);
    console.log(`Theme batch complete: ${result.outDir}`);
    console.log(`Batch JSON index: ${result.indexJsonPath}`);
    console.log(`Batch Markdown index: ${result.indexMarkdownPath}`);
    result.results.forEach((themeResult) => {
      console.log([
        `Theme: ${themeResult.theme}`,
        `Status: ${themeResult.status}`,
        `Issues: ${themeResult.summary?.issuesFound ?? 0}`
      ].join(' | '));
    });
    if (!result.restoredOriginalTheme) {
      console.log(`Warning: could not restore original Windows theme: ${result.restoreError}`);
    }
    return;
  }

  const result = await runPageAudit(options);
  console.log(`Audit complete: ${result.normalized.pageUrl}`);
  console.log(`Status: ${result.normalized.status}`);
  console.log(`Issues found: ${result.normalized.summary.issuesFound}`);
  if (result.fallbackRequired) {
    console.log('Fallback required: DOM audit returned empty/error.');
    if (result.screenshotPath) {
      console.log(`Screenshot captured: ${result.screenshotPath}`);
    }
  }
  result.writtenFiles.forEach((filePath) => {
    console.log(`Report written: ${filePath}`);
  });
}
```

- [ ] **Step 4: Run focused tests for the changed surface**

Run:

```bash
node --test "adaptive-eye-cli/test/cli-options.test.js" "adaptive-eye-cli/test/report-generator.test.js" "adaptive-eye-cli/test/windows-contrast-theme.test.js" "adaptive-eye-cli/test/theme-runner.test.js"
```

Expected: PASS across all four focused test files.

- [ ] **Step 5: Run the full test suite**

Run:

```bash
node --test "adaptive-eye-cli/test/*.test.js"
```

Expected: PASS for the existing audit, annotator, CLI, and report tests plus the new theme batch tests.

- [ ] **Step 6: Perform a Windows smoke check without annotation**

Run:

```bash
node "adaptive-eye-cli/src/cli.js" themes https://www.baidu.com --themes none,dusk --report json --out-dir reports/theme-batch-smoke
```

Expected:

- `reports/theme-batch-smoke/index.json` and `reports/theme-batch-smoke/index.md` exist.
- `reports/theme-batch-smoke/none/` and `reports/theme-batch-smoke/dusk/` each contain a JSON report.
- CLI output shows per-theme status lines.
- Windows theme is restored when the command exits.

- [ ] **Step 7: Perform an annotation smoke check**

Run:

```bash
node "adaptive-eye-cli/src/cli.js" themes https://www.baidu.com --themes none --report both --annotate --out-dir reports/theme-batch-annotate-smoke
```

Expected:

- `reports/theme-batch-annotate-smoke/none/` contains JSON, Markdown, and `-annotated.png`.
- The root `index.md` references the annotated screenshot path.
- CLI exits successfully and the original Windows theme is restored.

## Self-Review Checklist

- [ ] Confirm `none` uses `Pre-High Contrast Scheme`, then `CurrentTheme`, then `C:\Windows\Resources\Themes\aero.theme`.
- [ ] Confirm mapping matches Windows built-in contrast themes:
  - `aquatic` -> `hcblack.theme`
  - `desert` -> `hcwhite.theme`
  - `dusk` -> `hc1.theme`
  - `night-sky` -> `hc2.theme`
- [ ] Confirm `runPageAudit()` and `runAnnotation()` remain reusable single-run units with no theme-switch side effects.
- [ ] Confirm `runThemeAuditBatch()` restores the original Windows theme in `finally`.
- [ ] Confirm `index.json` and `index.md` are written after the loop using accumulated per-theme results.
