import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildThemeBatchIndex,
  buildReportFileName,
  generateThemeBatchMarkdownReport,
  generateContrastMarkdownReport,
  normalizeAuditResult
} from '../src/report-generator.js';

test('normalizes DOM contrast audit results into a stable report shape', () => {
  const normalized = normalizeAuditResult({
    status: 'success',
    pageUrl: 'https://example.com/pricing',
    pageTitle: 'Pricing | Example',
    summary: {
      totalElements: 10,
      issuesFound: 2,
      criticalIssues: 1,
      warningIssues: 1,
      passCount: 8
    },
    issues: [
      {
        tag: 'button',
        text: 'Buy | Now',
        color: 'rgb(180,180,180)',
        backgroundColor: 'rgb(255,255,255)',
        fontSize: '14px',
        fontWeight: '400',
        contrastRatio: 2.1,
        wcagAA: false,
        wcagAAA: false,
        severity: 'critical'
      }
    ]
  });

  assert.equal(normalized.auditType, 'contrast');
  assert.equal(normalized.source, 'dom');
  assert.equal(normalized.confidence, 'high');
  assert.equal(normalized.pageUrl, 'https://example.com/pricing');
  assert.equal(normalized.summary.issuesFound, 2);
  assert.equal(normalized.findings[0].text, 'Buy | Now');
});

test('generates markdown report with escaped table content', () => {
  const report = generateContrastMarkdownReport({
    auditType: 'contrast',
    source: 'dom',
    confidence: 'high',
    pageUrl: 'https://example.com/pricing',
    pageTitle: 'Pricing | Example',
    generatedAt: '2026-06-04T08:00:00.000Z',
    summary: {
      totalElements: 10,
      issuesFound: 1,
      criticalIssues: 1,
      warningIssues: 0,
      passCount: 9
    },
    findings: [
      {
        tag: 'button',
        text: 'Buy | Now\nToday',
        color: 'rgb(180,180,180)',
        backgroundColor: 'rgb(255,255,255)',
        fontSize: '14px',
        fontWeight: '400',
        contrastRatio: 2.1,
        wcagAA: false,
        wcagAAA: false,
        severity: 'critical',
        recommendation: 'Darken text or background.'
      }
    ]
  });

  assert.match(report, /# Contrast Audit Report: Pricing \| Example/);
  assert.match(report, /\*\*Source:\*\* dom/);
  assert.match(report, /\| Issues Found \| 1 \|/);
  assert.match(report, /Buy \\| Now Today/);
  assert.match(report, /Darken text or background\./);
});

test('builds deterministic safe report filenames from URL and date', () => {
  const fileName = buildReportFileName(
    'https://www.example.com/pricing?a=1',
    new Date('2026-06-04T08:09:10.000Z')
  );

  assert.equal(fileName, 'contrast-report-www-example-com-2026-06-04-080910.md');
});

test('builds stable JSON summary for theme batch audit', () => {
  const index = buildThemeBatchIndex({
    pageUrl: 'https://example.com',
    generatedAt: '2026-06-05T06:00:00.000Z',
    requestedThemes: ['none', 'dusk'],
    executedThemes: ['none', 'dusk'],
    originalTheme: {
      currentTheme: 'C:\\Users\\admin\\AppData\\Local\\Microsoft\\Windows\\Themes\\Custom.theme'
    },
    restoredOriginalTheme: true,
    results: [
      {
        theme: 'none',
        status: 'success',
        summary: { issuesFound: 1, criticalIssues: 1, warningIssues: 0 },
        reportPaths: {
          json: 'reports/none/audit.json',
          markdown: 'reports/none/audit.md',
          annotatedScreenshot: ''
        },
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
        reportPaths: {
          json: 'reports/none/audit.json',
          markdown: 'reports/none/audit.md',
          annotatedScreenshot: ''
        },
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
