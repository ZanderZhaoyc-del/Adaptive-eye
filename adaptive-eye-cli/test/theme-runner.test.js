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
    getInitialThemeState: async () => ({
      currentTheme: 'C:\\Users\\admin\\AppData\\Local\\Microsoft\\Windows\\Themes\\Custom.theme'
    }),
    applyContrastTheme: async (theme) => {
      appliedThemes.push(theme);
    },
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
  assert.ok(writes.has('reports\\run\\index.json'));
  assert.ok(writes.has('reports\\run\\index.md'));
  assert.ok(mkdirs.includes('reports\\run\\none'));
  assert.ok(mkdirs.includes('reports\\run\\aquatic'));
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
    getInitialThemeState: async () => ({
      currentTheme: 'C:\\Users\\admin\\AppData\\Local\\Microsoft\\Windows\\Themes\\Custom.theme'
    }),
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

  assert.deepEqual(annotateCalls, ['reports\\run\\none\\audit.json']);
  assert.equal(result.results[0].reportPaths.annotatedScreenshot, 'reports/run/none/audit-annotated.png');
});

test('forwards captureCleanScreenshot to per-theme audits and exposes cleanScreenshot path', async () => {
  const auditCalls = [];

  const result = await runThemeAuditBatch({
    url: 'https://example.com',
    themes: ['none'],
    report: 'json',
    annotate: false,
    captureCleanScreenshot: true,
    outDir: 'reports/run'
  }, {
    ensureDir: async () => {},
    writeTextFile: async () => {},
    getInitialThemeState: async () => ({ currentTheme: 'X.theme' }),
    applyContrastTheme: async () => {},
    restoreOriginalTheme: async () => {},
    runPageAudit: async (options) => {
      auditCalls.push(options);
      return {
        normalized: {
          pageUrl: 'https://example.com',
          summary: { issuesFound: 1, criticalIssues: 1, warningIssues: 0 }
        },
        writtenFiles: [`${options.outDir}\\audit.json`],
        cleanScreenshotPath: `${options.outDir}\\audit-clean.png`,
        warnings: []
      };
    },
    runAnnotation: async () => ({ annotatedScreenshotPath: '', warnings: [] })
  });

  assert.equal(auditCalls[0].captureCleanScreenshot, true);
  assert.equal(result.results[0].reportPaths.cleanScreenshot, 'reports\\run\\none\\audit-clean.png');
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
    getInitialThemeState: async () => ({
      currentTheme: 'C:\\Users\\admin\\AppData\\Local\\Microsoft\\Windows\\Themes\\Custom.theme'
    }),
    applyContrastTheme: async (theme) => {
      appliedThemes.push(theme);
      if (theme === 'none') {
        throw new Error('Could not disable high contrast.');
      }
    },
    restoreOriginalTheme: async () => {
      restored = true;
    },
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

test('opens browser session once and skips per-theme open in single-session mode', async () => {
  const openCalls = [];
  const auditCalls = [];
  const annotateCalls = [];

  const result = await runThemeAuditBatch({
    url: 'https://example.com',
    themes: ['none', 'aquatic', 'dusk'],
    report: 'json',
    annotate: true,
    openBrowser: true,
    outDir: 'reports/run'
  }, {
    ensureDir: async () => {},
    writeTextFile: async () => {},
    getInitialThemeState: async () => ({ currentTheme: 'C:\\theme.theme' }),
    applyContrastTheme: async () => {},
    restoreOriginalTheme: async () => {},
    openBrowserSession: async (url) => { openCalls.push(url); },
    reloadCurrentSession: async () => {},
    runPageAudit: async (auditOptions) => {
      auditCalls.push(auditOptions.openBrowser);
      return {
        normalized: {
          pageUrl: 'https://example.com',
          summary: { issuesFound: 0, criticalIssues: 0, warningIssues: 0 }
        },
        writtenFiles: [`${auditOptions.outDir}\\audit.json`],
        warnings: []
      };
    },
    runAnnotation: async (annotationOptions) => {
      annotateCalls.push(annotationOptions.openBrowser);
      return { annotatedScreenshotPath: 'x.png', warnings: [] };
    }
  });

  assert.deepEqual(openCalls, ['https://example.com']);
  assert.deepEqual(auditCalls, [false, false, false]);
  assert.deepEqual(annotateCalls, [false, false, false]);
  assert.equal(result.sessionMode, 'single-session');
});

test('retries audit once after reload when single-session eval fails', async () => {
  const reloadCalls = [];
  let auditAttempts = 0;

  const result = await runThemeAuditBatch({
    url: 'https://example.com',
    themes: ['none'],
    report: 'json',
    annotate: false,
    openBrowser: true,
    outDir: 'reports/run'
  }, {
    ensureDir: async () => {},
    writeTextFile: async () => {},
    getInitialThemeState: async () => ({ currentTheme: 'C:\\theme.theme' }),
    applyContrastTheme: async () => {},
    restoreOriginalTheme: async () => {},
    openBrowserSession: async () => {},
    reloadCurrentSession: async () => { reloadCalls.push('reload'); },
    sleep: async () => {},
    runPageAudit: async ({ outDir }) => {
      auditAttempts += 1;
      if (auditAttempts === 1) {
        throw new Error('eval transient failure');
      }
      return {
        normalized: {
          pageUrl: 'https://example.com',
          summary: { issuesFound: 0, criticalIssues: 0, warningIssues: 0 }
        },
        writtenFiles: [`${outDir}\\audit.json`],
        warnings: []
      };
    },
    runAnnotation: async () => ({ annotatedScreenshotPath: '', warnings: [] })
  });

  assert.equal(auditAttempts, 2);
  assert.deepEqual(reloadCalls, ['reload']);
  assert.equal(result.results[0].status, 'success');
  assert.match(result.results[0].warnings[0], /Audit retried after reload/);
});

test('falls back to per-theme open when initial session open fails', async () => {
  const openCalls = [];
  const auditCalls = [];

  const result = await runThemeAuditBatch({
    url: 'https://example.com',
    themes: ['none', 'dusk'],
    report: 'json',
    annotate: false,
    openBrowser: true,
    outDir: 'reports/run'
  }, {
    ensureDir: async () => {},
    writeTextFile: async () => {},
    getInitialThemeState: async () => ({ currentTheme: 'C:\\theme.theme' }),
    applyContrastTheme: async () => {},
    restoreOriginalTheme: async () => {},
    openBrowserSession: async (url) => { openCalls.push(url); throw new Error('socket timeout'); },
    reloadCurrentSession: async () => {},
    runPageAudit: async (auditOptions) => {
      auditCalls.push(auditOptions.openBrowser);
      return {
        normalized: {
          pageUrl: 'https://example.com',
          summary: { issuesFound: 0, criticalIssues: 0, warningIssues: 0 }
        },
        writtenFiles: [`${auditOptions.outDir}\\audit.json`],
        warnings: []
      };
    },
    runAnnotation: async () => ({ annotatedScreenshotPath: '', warnings: [] })
  });

  assert.deepEqual(openCalls, ['https://example.com']);
  assert.deepEqual(auditCalls, [true, true]);
  assert.equal(result.sessionMode, 'per-theme');
  assert.match(result.sessionOpenError, /socket timeout/);
});
