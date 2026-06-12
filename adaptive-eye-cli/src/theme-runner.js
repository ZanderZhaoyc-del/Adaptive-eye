import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { runAnnotation } from './annotator.js';
import {
  buildDefaultRunDirectory,
  openBrowserSession,
  reloadCurrentSession,
  runPageAudit
} from './audit-runner.js';
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
    openBrowserSession,
    reloadCurrentSession,
    sleep: defaultSleep,
    ...dependencies
  };

  const now = options.now || new Date();
  const outDir = options.outDir || buildDefaultRunDirectory(now);
  const originalTheme = await deps.getInitialThemeState();
  const results = [];
  let restoredOriginalTheme = false;
  let restoreError = '';
  const wantSession = Boolean(options.openBrowser);
  let sessionOpened = false;
  let sessionOpenError = '';

  await deps.ensureDir(outDir);

  if (wantSession) {
    try {
      await deps.openBrowserSession(options.url);
      sessionOpened = true;
    } catch (error) {
      sessionOpenError = error.message || String(error);
      sessionOpened = false;
    }
  }

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
          reportPaths: { json: '', markdown: '', cleanScreenshot: '', annotatedScreenshot: '' },
          warnings: [],
          errorMessage: error.message || String(error)
        });
        continue;
      }

      if (sessionOpened && options.reloadBetweenThemes) {
        try {
          await deps.reloadCurrentSession();
          await deps.sleep(800);
        } catch {
          // reload best-effort; downstream eval will surface real issues
        }
      }

      const auditOptions = {
        ...options,
        command: 'page',
        outDir: themeDir,
        openBrowser: sessionOpened ? false : Boolean(options.openBrowser)
      };

      let auditResult;
      const extraWarnings = [];
      try {
        auditResult = await deps.runPageAudit(auditOptions);
      } catch (error) {
        if (sessionOpened) {
          try {
            await deps.reloadCurrentSession();
            await deps.sleep(1500);
            auditResult = await deps.runPageAudit(auditOptions);
            extraWarnings.push(`Audit retried after reload: ${error.message || error}`);
          } catch (retryError) {
            results.push({
              theme,
              status: 'audit_failed',
              summary: { issuesFound: 0, criticalIssues: 0, warningIssues: 0 },
              reportPaths: { json: '', markdown: '', cleanScreenshot: '', annotatedScreenshot: '' },
              warnings: [`Initial audit error: ${error.message || error}`],
              errorMessage: retryError.message || String(retryError)
            });
            continue;
          }
        } else {
          results.push({
            theme,
            status: 'audit_failed',
            summary: { issuesFound: 0, criticalIssues: 0, warningIssues: 0 },
            reportPaths: { json: '', markdown: '', cleanScreenshot: '', annotatedScreenshot: '' },
            warnings: [],
            errorMessage: error.message || String(error)
          });
          continue;
        }
      }

      const jsonPath = auditResult.writtenFiles.find((filePath) => filePath.endsWith('.json')) || '';
      const markdownPath = auditResult.writtenFiles.find((filePath) => filePath.endsWith('.md')) || '';
      const cleanScreenshotPath = auditResult.cleanScreenshotPath || '';
      let annotatedScreenshotPath = '';
      const warnings = [...extraWarnings, ...auditResult.warnings];
      let status = 'success';

      if (options.annotate && jsonPath) {
        try {
          const annotationResult = await deps.runAnnotation({
            command: 'annotate',
            reportPath: jsonPath,
            outDir: themeDir,
            openBrowser: sessionOpened ? false : Boolean(options.openBrowser)
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
          cleanScreenshot: cleanScreenshotPath,
          annotatedScreenshot: annotatedScreenshotPath
        },
        warnings,
        errorMessage: ''
      });
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
    sessionMode: sessionOpened ? 'single-session' : 'per-theme',
    sessionOpenError,
    results
  };
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
