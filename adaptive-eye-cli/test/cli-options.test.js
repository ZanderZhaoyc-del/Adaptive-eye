import assert from 'node:assert/strict';
import test from 'node:test';

import { parseCliArgs } from '../src/cli-options.js';

test('parses page audit command with defaults', () => {
  const options = parseCliArgs(['page', 'https://example.com']);

  assert.equal(options.command, 'page');
  assert.equal(options.url, 'https://example.com');
  assert.equal(options.report, 'both');
  assert.equal(options.outDir, undefined);
  assert.equal(options.openBrowser, true);
  assert.equal(options.screenshotOnFallback, true);
  assert.equal(options.captureCleanScreenshot, false);
});

test('parses --screenshot flag for page command', () => {
  const options = parseCliArgs(['page', 'https://example.com', '--screenshot']);

  assert.equal(options.captureCleanScreenshot, true);
});

test('parses optional CLI flags', () => {
  const options = parseCliArgs([
    'page',
    'https://example.com',
    '--report',
    'markdown',
    '--out-dir',
    'tmp/audits',
    '--script',
    'custom.js',
    '--no-open',
    '--no-screenshot'
  ]);

  assert.equal(options.report, 'markdown');
  assert.equal(options.outDir, 'tmp/audits');
  assert.equal(options.scriptPath, 'custom.js');
  assert.equal(options.openBrowser, false);
  assert.equal(options.screenshotOnFallback, false);
});

test('rejects unsupported command and report formats', () => {
  assert.throws(
    () => parseCliArgs(['site', 'https://example.com']),
    /Unsupported command/
  );

  assert.throws(
    () => parseCliArgs(['page', 'https://example.com', '--report', 'html']),
    /Unsupported report format/
  );
});

test('parses annotate command with defaults', () => {
  const options = parseCliArgs(['annotate', 'reports/audit.json']);

  assert.equal(options.command, 'annotate');
  assert.equal(options.reportPath, 'reports/audit.json');
  assert.equal(options.openBrowser, true);
  assert.equal(options.outDir, undefined);
});

test('parses annotate command options', () => {
  const options = parseCliArgs([
    'annotate',
    'reports/audit.json',
    '--out-dir',
    'reports/annotated',
    '--vision-review',
    'reports/audit-vision-review.json',
    '--no-open'
  ]);

  assert.equal(options.command, 'annotate');
  assert.equal(options.reportPath, 'reports/audit.json');
  assert.equal(options.outDir, 'reports/annotated');
  assert.equal(options.visionReviewPath, 'reports/audit-vision-review.json');
  assert.equal(options.openBrowser, false);
});

test('parses themes command with default theme order', () => {
  const options = parseCliArgs(['themes', 'https://example.com']);

  assert.equal(options.command, 'themes');
  assert.equal(options.url, 'https://example.com');
  assert.deepEqual(options.themes, ['none', 'aquatic', 'desert', 'dusk', 'night-sky']);
  assert.equal(options.report, 'both');
  assert.equal(options.annotate, false);
  assert.equal(options.openBrowser, true);
  assert.equal(options.screenshotOnFallback, true);
  assert.equal(options.captureCleanScreenshot, false);
});

test('parses --screenshot flag for themes command', () => {
  const options = parseCliArgs(['themes', 'https://example.com', '--screenshot']);

  assert.equal(options.captureCleanScreenshot, true);
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
