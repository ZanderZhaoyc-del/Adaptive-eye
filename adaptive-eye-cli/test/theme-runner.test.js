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
