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

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
