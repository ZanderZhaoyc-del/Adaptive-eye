import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildBrowserUseEnv,
  buildDefaultRunDirectory,
  parseBrowserUseJsonOutput,
  runPageAudit
} from '../src/audit-runner.js';

test('extracts JSON object from browser-use output', () => {
  const result = parseBrowserUseJsonOutput(`
Opening page...
{"status":"success","pageUrl":"https://example.com","summary":{"totalElements":1},"issues":[]}
Done.
`);

  assert.equal(result.status, 'success');
  assert.equal(result.pageUrl, 'https://example.com');
});

test('sets Python output encoding for browser-use on Windows terminals', () => {
  const env = buildBrowserUseEnv({ PATH: 'test-path' });

  assert.equal(env.PATH, 'test-path');
  assert.equal(env.PYTHONIOENCODING, 'utf-8');
});

test('builds default report folder name with adaptive-eye prefix and minute timestamp', () => {
  assert.equal(
    buildDefaultRunDirectory(new Date('2026-06-04T08:09:10.000Z')),
    'reports\\adaptive-eye-2026-06-04-0809'
  );
});

test('uses default dated report folder when outDir is omitted', async () => {
  const madeDirs = [];
  const written = new Map();

  const result = await runPageAudit({
    url: 'https://example.com',
    report: 'json',
    openBrowser: false,
    screenshotOnFallback: true,
    now: new Date('2026-06-04T08:09:10.000Z')
  }, {
    readTextFile: async () => 'return {"status":"success"};',
    writeTextFile: async (path, content) => written.set(path, content),
    ensureDir: async (path) => madeDirs.push(path),
    runBrowserUse: async () => ({
      stdout: JSON.stringify({
        status: 'success',
        pageUrl: 'https://example.com',
        pageTitle: 'Example',
        summary: {},
        issues: []
      })
    })
  });

  assert.deepEqual(madeDirs, ['reports\\adaptive-eye-2026-06-04-0809']);
  assert.equal(result.outDir, 'reports\\adaptive-eye-2026-06-04-0809');
  assert.ok([...written.keys()][0].startsWith('reports\\adaptive-eye-2026-06-04-0809'));
});

test('runs page audit and writes markdown and JSON reports', async () => {
  const calls = [];
  const written = new Map();
  const madeDirs = [];

  const result = await runPageAudit({
    url: 'https://example.com',
    outDir: 'reports',
    report: 'both',
    openBrowser: true,
    screenshotOnFallback: true,
    now: new Date('2026-06-04T08:09:10.000Z')
  }, {
    readTextFile: async () => 'return {"status":"success"};',
    writeTextFile: async (path, content) => written.set(path, content),
    ensureDir: async (path) => madeDirs.push(path),
    runBrowserUse: async (args) => {
      calls.push(args);
      if (args[0] === 'eval') {
        assert.match(args[1], /^JSON\.stringify\(/);
      }
      if (args[0] === 'eval') {
        return {
          stdout: JSON.stringify({
            status: 'success',
            pageUrl: 'https://example.com',
            pageTitle: 'Example',
            summary: {
              totalElements: 1,
              issuesFound: 0,
              criticalIssues: 0,
              warningIssues: 0,
              passCount: 1
            },
            issues: []
          })
        };
      }
      return { stdout: '' };
    }
  });

  assert.deepEqual(calls[0], ['open', 'https://example.com']);
  assert.equal(calls[1][0], 'eval');
  assert.deepEqual(madeDirs, ['reports']);
  assert.equal(result.normalized.status, 'success');
  assert.equal(result.fallbackRequired, false);
  assert.equal(written.size, 2);
  assert.ok([...written.keys()].some((path) => path.endsWith('.json')));
  assert.ok([...written.keys()].some((path) => path.endsWith('.md')));
});

test('captures screenshot when DOM audit needs fallback', async () => {
  const calls = [];

  const result = await runPageAudit({
    url: 'https://example.com',
    outDir: 'reports',
    report: 'json',
    openBrowser: false,
    screenshotOnFallback: true,
    now: new Date('2026-06-04T08:09:10.000Z')
  }, {
    readTextFile: async () => 'return {"status":"empty"};',
    writeTextFile: async () => {},
    ensureDir: async () => {},
    runBrowserUse: async (args) => {
      calls.push(args);
      if (args[0] === 'eval') {
        assert.match(args[1], /^JSON\.stringify\(/);
      }
      if (args[0] === 'eval') {
        return {
          stdout: JSON.stringify({
            status: 'empty',
            pageUrl: 'https://example.com',
            pageTitle: 'Example',
            summary: {},
            issues: []
          })
        };
      }
      return { stdout: '' };
    }
  });

  assert.equal(result.fallbackRequired, true);
  assert.equal(calls[0][0], 'eval');
  assert.deepEqual(calls[1], [
    'screenshot',
    'reports\\contrast-fallback-example-com-2026-06-04-080910.png',
    '--full'
  ]);
});

test('continues writing reports when fallback screenshot capture fails', async () => {
  const written = new Map();

  const result = await runPageAudit({
    url: 'https://example.com',
    outDir: 'reports',
    report: 'json',
    openBrowser: false,
    screenshotOnFallback: true,
    now: new Date('2026-06-04T08:09:10.000Z')
  }, {
    readTextFile: async () => 'return {"status":"empty"};',
    writeTextFile: async (filePath, content) => written.set(filePath, content),
    ensureDir: async () => {},
    runBrowserUse: async (args) => {
      if (args[0] === 'eval') {
        return {
          stdout: JSON.stringify({
            status: 'empty',
            pageUrl: 'https://example.com',
            pageTitle: 'Example',
            summary: {},
            issues: []
          })
        };
      }

      throw new Error('Cannot take screenshot with 0 width.');
    }
  });

  assert.equal(result.fallbackRequired, true);
  assert.equal(result.screenshotPath, '');
  assert.match(result.warnings[0], /Screenshot capture failed/);
  assert.equal(written.size, 1);
  assert.match([...written.values()][0], /Cannot take screenshot with 0 width/);
});
