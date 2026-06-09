import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { runAnnotation } from './annotator.js';
import { buildDefaultRunDirectory, runPageAudit } from './audit-runner.js';
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
