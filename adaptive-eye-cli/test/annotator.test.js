import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAnnotatedMarkdown,
  buildOverlayScript,
  runAnnotation
} from '../src/annotator.js';

test('generates browser overlay script for issue bounding boxes by severity', () => {
  const script = buildOverlayScript({
    findings: [
      {
        severity: 'critical',
        text: 'Low contrast button',
        contrastRatio: 2.1,
        boundingBox: { x: 10, y: 20, width: 100, height: 40 }
      },
      {
        severity: 'warning',
        text: 'Muted link',
        contrastRatio: 3.8,
        boundingBox: { x: 50, y: 90, width: 120, height: 24 }
      }
    ]
  });

  assert.match(script, /adaptive-eye-annotation-layer/);
  assert.match(script, /#d32f2f/);
  assert.match(script, /#f57c00/);
  assert.match(script, /Low contrast button/);
});

test('excludes false-positive finding indices from browser overlay script', () => {
  const script = buildOverlayScript({
    findings: [
      {
        severity: 'critical',
        text: 'False positive button',
        contrastRatio: 1,
        boundingBox: { x: 10, y: 20, width: 100, height: 40 }
      },
      {
        severity: 'warning',
        text: 'Real issue link',
        contrastRatio: 3.8,
        boundingBox: { x: 50, y: 90, width: 120, height: 24 }
      }
    ]
  }, {
    excludedFindingIndices: [1]
  });

  assert.doesNotMatch(script, /False positive button/);
  assert.match(script, /Real issue link/);
  assert.match(script, /"index":2/);
});

test('inserts annotated screenshot section into markdown report', () => {
  const markdown = [
    '# Contrast Audit Report: Example',
    '',
    '**URL:** https://example.com',
    '',
    '## Summary',
    '',
    '| Metric | Count |'
  ].join('\n');

  const updated = buildAnnotatedMarkdown(markdown, 'audit-annotated.png');

  assert.match(updated, /## Annotated Screenshot/);
  assert.match(updated, /!\[Annotated contrast issues\]\(audit-annotated.png\)/);
  assert.match(updated, /## Summary/);
});

test('runs annotation workflow and updates report artifacts', async () => {
  const reportPath = 'reports/audit.json';
  const files = new Map([
    [reportPath, JSON.stringify({
      pageUrl: 'https://example.com',
      pageTitle: 'Example',
      pageDimensions: { width: 800, height: 600 },
      findings: [
        {
          severity: 'critical',
          text: 'Low contrast button',
          contrastRatio: 2.1,
          boundingBox: { x: 10, y: 20, width: 100, height: 40 }
        }
      ]
    })],
    ['reports/audit.md', '# Contrast Audit Report: Example\n\n## Summary\n']
  ]);
  const calls = [];

  const result = await runAnnotation({
    command: 'annotate',
    reportPath,
    openBrowser: true
  }, {
    readTextFile: async (filePath) => files.get(filePath),
    writeTextFile: async (filePath, content) => files.set(filePath, content),
    ensureDir: async () => {},
    runBrowserUse: async (args) => {
      calls.push(args);
      return { stdout: '' };
    }
  });

  assert.deepEqual(calls[0], ['open', 'https://example.com']);
  assert.equal(calls[1][0], 'eval');
  assert.match(calls[1][1], /adaptive-eye-annotation-layer/);
  assert.deepEqual(calls[2], ['screenshot', 'reports\\audit-annotated.png', '--full']);
  assert.equal(result.annotatedScreenshotPath, 'reports\\audit-annotated.png');
  assert.match(files.get(reportPath), /annotatedScreenshotPath/);
  assert.match(files.get('reports/audit.md'), /Annotated Screenshot/);
  assert.match(files.get('reports/audit.md'), /!\[Annotated contrast issues\]\(audit-annotated\.png\)/);
});

test('runs annotation workflow excluding false positives from vision review', async () => {
  const reportPath = 'reports/audit.json';
  const visionReviewPath = 'reports/audit-vision-review.json';
  const files = new Map([
    [reportPath, JSON.stringify({
      pageUrl: 'https://example.com',
      pageTitle: 'Example',
      pageDimensions: { width: 800, height: 600 },
      findings: [
        {
          severity: 'critical',
          text: 'False positive button',
          contrastRatio: 1,
          boundingBox: { x: 10, y: 20, width: 100, height: 40 }
        },
        {
          severity: 'warning',
          text: 'Real issue link',
          contrastRatio: 3.8,
          boundingBox: { x: 50, y: 90, width: 120, height: 24 }
        }
      ]
    })],
    [visionReviewPath, JSON.stringify({
      findings: [
        { index: 1, visionVerdict: 'false-positive' }
      ]
    })],
    ['reports/audit.md', '# Contrast Audit Report: Example\n\n## Summary\n']
  ]);
  const calls = [];

  await runAnnotation({
    command: 'annotate',
    reportPath,
    visionReviewPath,
    openBrowser: false
  }, {
    readTextFile: async (filePath) => files.get(filePath),
    writeTextFile: async (filePath, content) => files.set(filePath, content),
    ensureDir: async () => {},
    runBrowserUse: async (args) => {
      calls.push(args);
      return { stdout: '' };
    }
  });

  assert.equal(calls[0][0], 'eval');
  assert.doesNotMatch(calls[0][1], /False positive button/);
  assert.match(calls[0][1], /Real issue link/);
  assert.match(files.get(reportPath), /annotationExcludedFindingIndices/);
});
