import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildReportFileName,
  generateContrastMarkdownReport,
  normalizeAuditResult
} from './report-generator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SCRIPT_PATH = path.resolve(__dirname, '..', 'browser-scripts', 'analyze-contrast.js');

export async function runPageAudit(options, dependencies = {}) {
  const deps = {
    readTextFile: (filePath) => readFile(filePath, 'utf8'),
    writeTextFile: (filePath, content) => writeFile(filePath, content, 'utf8'),
    ensureDir: (dirPath) => mkdir(dirPath, { recursive: true }),
    runBrowserUse: defaultRunBrowserUse,
    ...dependencies
  };

  const now = options.now || new Date();
  const outDir = options.outDir || buildDefaultRunDirectory(now);

  await deps.ensureDir(outDir);

  if (options.openBrowser) {
    await deps.runBrowserUse(['open', options.url]);
  }

  const scriptPath = options.scriptPath || DEFAULT_SCRIPT_PATH;
  const script = await deps.readTextFile(scriptPath);
  const evalResult = await deps.runBrowserUse(['eval', buildJsonEvalScript(script)]);
  const rawResult = parseBrowserUseJsonOutput(evalResult.stdout);
  const fallbackRequired = rawResult.status === 'empty' || rawResult.status === 'error';
  let screenshotPath = '';
  const warnings = [];

  if (fallbackRequired && options.screenshotOnFallback) {
    const requestedScreenshotPath = path.join(outDir, buildFallbackScreenshotName(rawResult.pageUrl || options.url, now));
    try {
      await deps.runBrowserUse(['screenshot', requestedScreenshotPath, '--full']);
      screenshotPath = requestedScreenshotPath;
    } catch (error) {
      warnings.push(`Screenshot capture failed: ${error.message || error}`);
    }
  }

  const normalized = normalizeAuditResult(rawResult, {
    pageUrl: options.url,
    generatedAt: now.toISOString()
  });

  const reportBaseName = buildReportFileName(normalized.pageUrl || options.url, now).replace(/\.md$/, '');
  const writtenFiles = [];

  if (options.report === 'json' || options.report === 'both') {
    const jsonPath = path.join(outDir, `${reportBaseName}.json`);
    await deps.writeTextFile(jsonPath, `${JSON.stringify({
      ...normalized,
      fallbackRequired,
      screenshotPath,
      warnings
    }, null, 2)}\n`);
    writtenFiles.push(jsonPath);
  }

  if (options.report === 'markdown' || options.report === 'both') {
    const markdownPath = path.join(outDir, `${reportBaseName}.md`);
    await deps.writeTextFile(markdownPath, generateContrastMarkdownReport(normalized));
    writtenFiles.push(markdownPath);
  }

  return {
    normalized,
    outDir,
    fallbackRequired,
    screenshotPath,
    warnings,
    writtenFiles
  };
}

export function parseBrowserUseJsonOutput(output) {
  const text = String(output || '').trim();

  try {
    return JSON.parse(text);
  } catch {
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');

    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      throw new Error('Could not find JSON object in browser-use output.');
    }

    return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  }
}

export function buildJsonEvalScript(script) {
  return `JSON.stringify(eval(${JSON.stringify(script)}))`;
}

export function buildBrowserUseEnv(baseEnv = process.env) {
  return {
    ...baseEnv,
    PYTHONIOENCODING: 'utf-8'
  };
}

export function buildDefaultRunDirectory(date = new Date()) {
  return path.join('reports', `adaptive-eye-${formatMinuteTimestamp(date)}`);
}

function buildFallbackScreenshotName(pageUrl, date) {
  return buildReportFileName(pageUrl, date)
    .replace(/^contrast-report-/, 'contrast-fallback-')
    .replace(/\.md$/, '.png');
}

function formatMinuteTimestamp(date) {
  return date.toISOString()
    .slice(0, 16)
    .replace('T', '-')
    .replace(':', '');
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
