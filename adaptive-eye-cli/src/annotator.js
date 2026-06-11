import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildBrowserUseEnv } from './audit-runner.js';

const SEVERITY_STYLES = {
  critical: { color: '#d32f2f', label: 'Critical' },
  warning: { color: '#f57c00', label: 'Warning' },
  pass: { color: '#388e3c', label: 'Pass' }
};

export async function runAnnotation(options, dependencies = {}) {
  const deps = {
    readTextFile: (filePath) => readFile(filePath, 'utf8'),
    writeTextFile: (filePath, content) => writeFile(filePath, content, 'utf8'),
    ensureDir: (dirPath) => mkdir(dirPath, { recursive: true }),
    runBrowserUse: defaultRunBrowserUse,
    ...dependencies
  };

  const report = JSON.parse(await deps.readTextFile(options.reportPath));
  const reportDir = path.dirname(options.reportPath);
  const outDir = options.outDir || reportDir;
  const baseName = path.basename(options.reportPath, path.extname(options.reportPath));
  const annotatedScreenshotPath = path.join(outDir, `${baseName}-annotated.png`);
  const markdownPath = replaceExtension(options.reportPath, '.md');
  const warnings = Array.isArray(report.warnings) ? [...report.warnings] : [];
  const excludedFindingIndices = await readExcludedFindingIndices(options.visionReviewPath, deps, warnings);

  await deps.ensureDir(outDir);

  if (options.openBrowser && report.pageUrl) {
    await deps.runBrowserUse(['open', report.pageUrl]);
  }

  try {
    await deps.runBrowserUse(['eval', buildOverlayScript(report, { excludedFindingIndices })]);
  } catch (error) {
    warnings.push(`Annotation overlay injection failed: ${error.message || error}`);
  }

  try {
    await deps.runBrowserUse(['screenshot', annotatedScreenshotPath, '--full']);
  } catch (error) {
    warnings.push(`Annotated screenshot capture failed: ${error.message || error}`);
  }

  const updatedReport = {
    ...report,
    annotatedScreenshotPath,
    annotationVisionReviewPath: options.visionReviewPath || '',
    annotationExcludedFindingIndices: excludedFindingIndices,
    warnings
  };
  await deps.writeTextFile(options.reportPath, `${JSON.stringify(updatedReport, null, 2)}\n`);

  try {
    const markdown = await deps.readTextFile(markdownPath);
    const markdownScreenshotPath = toMarkdownRelativePath(markdownPath, annotatedScreenshotPath);
    await deps.writeTextFile(markdownPath, buildAnnotatedMarkdown(markdown, markdownScreenshotPath));
  } catch (error) {
    warnings.push(`Markdown update skipped: ${error.message || error}`);
    await deps.writeTextFile(options.reportPath, `${JSON.stringify({
      ...updatedReport,
      warnings
    }, null, 2)}\n`);
  }

  return {
    reportPath: options.reportPath,
    annotatedScreenshotPath,
    warnings
  };
}

export function buildOverlayScript(report, options = {}) {
  const findings = Array.isArray(report.findings) ? report.findings : [];
  const excludedFindingIndices = new Set(options.excludedFindingIndices || []);
  const overlays = findings
    .map((finding, index) => ({ finding, reportIndex: index + 1 }))
    .filter(({ finding, reportIndex }) => hasBoundingBox(finding) && !excludedFindingIndices.has(reportIndex))
    .map((finding, index) => ({
      index: finding.reportIndex,
      severity: finding.finding.severity || 'warning',
      text: finding.finding.text || '',
      contrastRatio: finding.finding.contrastRatio,
      boundingBox: finding.finding.boundingBox
    }));

  return `(() => {
  const existing = document.getElementById('adaptive-eye-annotation-layer');
  if (existing) existing.remove();

  const severityStyles = ${JSON.stringify(SEVERITY_STYLES)};
  const findings = ${JSON.stringify(overlays)};
  const layer = document.createElement('div');
  layer.id = 'adaptive-eye-annotation-layer';
  layer.style.position = 'absolute';
  layer.style.left = '0';
  layer.style.top = '0';
  layer.style.width = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0, window.innerWidth) + 'px';
  layer.style.height = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0, window.innerHeight) + 'px';
  layer.style.pointerEvents = 'none';
  layer.style.zIndex = '2147483647';

  for (const finding of findings) {
    const box = finding.boundingBox;
    const style = severityStyles[finding.severity] || severityStyles.warning;
    const frame = document.createElement('div');
    frame.style.position = 'absolute';
    frame.style.left = box.x + 'px';
    frame.style.top = box.y + 'px';
    frame.style.width = box.width + 'px';
    frame.style.height = box.height + 'px';
    frame.style.border = '4px solid ' + style.color;
    frame.style.boxSizing = 'border-box';
    frame.style.background = 'transparent';
    frame.style.borderRadius = '3px';

    const label = document.createElement('div');
    label.textContent = finding.index + '. ' + style.label + (finding.contrastRatio ? ' (' + finding.contrastRatio + ':1)' : '');
    label.title = finding.text;
    label.style.position = 'absolute';
    label.style.left = box.x + 'px';
    label.style.top = Math.max(0, box.y - 22) + 'px';
    label.style.padding = '2px 6px';
    label.style.color = '#fff';
    label.style.background = style.color;
    label.style.font = '12px Arial, sans-serif';
    label.style.lineHeight = '16px';
    label.style.borderRadius = '3px';
    label.style.whiteSpace = 'nowrap';

    layer.appendChild(frame);
    layer.appendChild(label);
  }

  document.documentElement.appendChild(layer);
  return { status: 'annotated', boxes: findings.length };
})()`;
}

async function readExcludedFindingIndices(visionReviewPath, deps, warnings) {
  if (!visionReviewPath) {
    return [];
  }

  try {
    const review = JSON.parse(await deps.readTextFile(visionReviewPath));
    return (Array.isArray(review.findings) ? review.findings : [])
      .filter((finding) => String(finding.visionVerdict || '').toLowerCase() === 'false-positive')
      .map((finding) => Number(finding.index))
      .filter((index) => Number.isInteger(index) && index > 0);
  } catch (error) {
    warnings.push(`Vision review exclusion skipped: ${error.message || error}`);
    return [];
  }
}

export function buildAnnotatedMarkdown(markdown, annotatedScreenshotPath) {
  const section = [
    '## Annotated Screenshot',
    '',
    `![Annotated contrast issues](${annotatedScreenshotPath})`,
    '',
    'Red boxes indicate critical contrast issues. Orange boxes indicate warning-level contrast issues.',
    ''
  ].join('\n');

  const withoutExistingSection = markdown.replace(
    /\n## Annotated Screenshot\n[\s\S]*?(?=\n## |\n---|\s*$)/,
    '\n'
  ).trimEnd();

  const summaryIndex = withoutExistingSection.indexOf('\n## Summary');
  if (summaryIndex === -1) {
    return `${withoutExistingSection}\n\n${section}`;
  }

  return `${withoutExistingSection.slice(0, summaryIndex)}\n\n${section}${withoutExistingSection.slice(summaryIndex)}`;
}

function hasBoundingBox(finding) {
  const box = finding?.boundingBox;
  return box &&
    Number.isFinite(box.x) &&
    Number.isFinite(box.y) &&
    Number.isFinite(box.width) &&
    Number.isFinite(box.height) &&
    box.width > 0 &&
    box.height > 0;
}

async function defaultRunBrowserUse(args) {
  const { execFile } = await import('node:child_process');

  return new Promise((resolve, reject) => {
    execFile('browser-use', args, {
      env: buildBrowserUseEnv(),
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 20
    }, (error, stdout, stderr) => {
      if (error) {
        error.message = `${error.message}\n${stderr || ''}`.trim();
        reject(error);
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

function replaceExtension(filePath, extension) {
  return filePath.slice(0, filePath.length - path.extname(filePath).length) + extension;
}

function toMarkdownRelativePath(markdownPath, targetPath) {
  return toRelativeAssetPath(markdownPath, targetPath);
}

function toRelativeAssetPath(sourcePath, targetPath) {
  const relativePath = path.relative(path.dirname(sourcePath), targetPath) || path.basename(targetPath);
  return relativePath.replaceAll(path.sep, '/');
}
