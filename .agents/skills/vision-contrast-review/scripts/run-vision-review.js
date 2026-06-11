#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const options = parseArgs(process.argv.slice(2));

if (!options.reportPath) {
  console.error('Usage: node run-vision-review.js <report-json> [--screenshot <png>] [--env .env] [--limit 20] [--batch-size 5] [--ratio 1]');
  process.exit(2);
}

const env = {
  ...process.env,
  ...parseEnvFile(options.envPath || '.env')
};

const report = JSON.parse(readFileSync(options.reportPath, 'utf8'));
const screenshotPath = options.screenshotPath || report.annotatedScreenshotPath || report.screenshotPath || '';
const outputBase = options.reportPath.replace(/\.json$/i, '-vision-review');
const reviewJsonPath = `${outputBase}.json`;
const reviewMdPath = `${outputBase}.md`;
const requiredEnv = [
  'ADAPTIVE_EYE_VISION_API_KEY',
  'ADAPTIVE_EYE_VISION_BASE_URL',
  'ADAPTIVE_EYE_VISION_MODEL'
];
const missingEnv = requiredEnv.filter((name) => !env[name]);

let review;

if (missingEnv.length > 0) {
  review = buildUnavailable(`Missing .env values: ${missingEnv.join(', ')}`);
} else if (!screenshotPath || !existsSync(screenshotPath)) {
  review = buildUnavailable(`Screenshot not found: ${screenshotPath || '(none)'}`);
} else {
  review = await runVisionReview();
}

writeFileSync(reviewJsonPath, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
writeFileSync(reviewMdPath, renderMarkdown(review), 'utf8');

console.log(JSON.stringify({
  status: review.status,
  summary: review.summary,
  warnings: review.warnings,
  reviewJsonPath,
  reviewMdPath
}, null, 2));

async function runVisionReview() {
  const allFindings = (report.findings || []).map((finding, index) => ({
    index: index + 1,
    tag: finding.tag,
    text: finding.text,
    color: finding.color,
    backgroundColor: finding.backgroundColor,
    fontSize: finding.fontSize,
    fontWeight: finding.fontWeight,
    contrastRatio: finding.contrastRatio,
    severity: finding.severity,
    boundingBox: finding.boundingBox
  }));
  const eligibleFindings = allFindings.filter((finding) => Number(finding.contrastRatio) === options.ratio);
  const findings = eligibleFindings.slice(0, options.limit);

  if (findings.length === 0) {
    return {
      auditType: 'contrast-vision-review',
      sourceReportPath: options.reportPath,
      pageUrl: report.pageUrl || '',
      generatedAt: new Date().toISOString(),
      model: env.ADAPTIVE_EYE_VISION_MODEL,
      screenshotPath,
      status: 'success',
      summary: {
        totalFindings: allFindings.length,
        eligibleFindings: eligibleFindings.length,
        reviewedFindings: 0,
        confirmed: 0,
        likely: 0,
        falsePositive: 0,
        inconclusive: 0
      },
      findings: [],
      warnings: [`No findings with DOM contrast ratio ${options.ratio}.`]
    };
  }

  const batchSize = Math.max(1, Math.min(options.batchSize, findings.length || 1));
  const combined = {
    status: 'success',
    findings: [],
    warnings: [],
    totalFindings: allFindings.length,
    eligibleFindings: eligibleFindings.length
  };

  for (let index = 0; index < findings.length; index += batchSize) {
    const batchFindings = findings.slice(index, index + batchSize);
    const batchReview = await requestVisionReview(batchFindings);

    if (batchReview.status === 'vision_review_unavailable') {
      return batchReview;
    }

    if (Array.isArray(batchReview.findings)) {
      combined.findings.push(...batchReview.findings);
    }

    if (Array.isArray(batchReview.warnings)) {
      combined.warnings.push(...batchReview.warnings);
    }
  }

  return normalizeReview(combined, findings.length);
}

async function requestVisionReview(findings) {
  const prompt = buildPrompt(findings);
  const endpoint = `${env.ADAPTIVE_EYE_VISION_BASE_URL.replace(/\/$/, '')}/chat/completions`;
  const imageBase64 = readFileSync(screenshotPath).toString('base64');
  const mimeType = mimeTypeForPath(screenshotPath);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.ADAPTIVE_EYE_VISION_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: env.ADAPTIVE_EYE_VISION_MODEL,
        messages: [
          { role: 'system', content: 'You are Kimi, reviewing visual evidence for WCAG contrast findings.' },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${imageBase64}`
                }
              },
              {
                type: 'text',
                text: prompt
              }
            ]
          }
        ],
        temperature: 1
      })
    });

    const responseText = await response.text();

    if (!response.ok) {
      return buildUnavailable(`Vision API returned HTTP ${response.status}: ${trimForReport(responseText)}`);
    }

    const apiResult = JSON.parse(responseText);
    const content = apiResult?.choices?.[0]?.message?.content || '';
    return parseJsonFromText(content);
  } catch (error) {
    return buildUnavailable(error.message || String(error));
  }
}

function buildPrompt(findings) {
  const promptPath = path.join('.agents', 'skills', 'vision-contrast-review', 'references', 'vision-review-prompt.md');
  const promptMarkdown = readFileSync(promptPath, 'utf8');
  const promptTemplate = extractPrompt(promptMarkdown);

  return promptTemplate
    .replaceAll('{{pageUrl}}', report.pageUrl || '')
    .replaceAll('{{pageTitle}}', report.pageTitle || '')
    .replaceAll('{{screenshotType}}', report.annotatedScreenshotPath ? 'annotatedScreenshotPath' : 'screenshotPath')
    .replaceAll('{{screenshotPath}}', screenshotPath)
    .replaceAll('{{findingsJson}}', JSON.stringify(findings, null, 2));
}

function parseArgs(args) {
  const parsed = {
    reportPath: '',
    screenshotPath: '',
    envPath: '.env',
    limit: 20,
    batchSize: 5,
    ratio: 1
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--screenshot') {
      parsed.screenshotPath = args[index + 1] || '';
      index += 1;
    } else if (arg === '--env') {
      parsed.envPath = args[index + 1] || '.env';
      index += 1;
    } else if (arg === '--limit') {
      parsed.limit = Number(args[index + 1] || 20);
      index += 1;
    } else if (arg === '--batch-size') {
      parsed.batchSize = Number(args[index + 1] || 5);
      index += 1;
    } else if (arg === '--ratio') {
      parsed.ratio = Number(args[index + 1] || 1);
      index += 1;
    } else if (!parsed.reportPath) {
      parsed.reportPath = arg;
    }
  }

  if (!Number.isFinite(parsed.limit) || parsed.limit < 1) {
    parsed.limit = 20;
  }

  if (!Number.isFinite(parsed.batchSize) || parsed.batchSize < 1) {
    parsed.batchSize = 5;
  }

  if (!Number.isFinite(parsed.ratio) || parsed.ratio < 0) {
    parsed.ratio = 1;
  }

  return parsed;
}

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const envValues = {};

  for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separator = line.indexOf('=');
    if (separator < 1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    envValues[key] = value;
  }

  return envValues;
}

function extractPrompt(markdown) {
  const match = markdown.match(/```text\n([\s\S]*?)\n```/);
  return match ? match[1] : markdown;
}

function parseJsonFromText(text) {
  const trimmed = String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');

    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }

    throw new Error('Vision model response was not parseable JSON.');
  }
}

function buildUnavailable(message) {
  const totalFindings = Array.isArray(report.findings) ? report.findings.length : 0;
  const eligibleFindings = Array.isArray(report.findings)
    ? report.findings.filter((finding) => Number(finding.contrastRatio) === options.ratio).length
    : 0;

  return {
    auditType: 'contrast-vision-review',
    sourceReportPath: options.reportPath,
    pageUrl: report.pageUrl || '',
    generatedAt: new Date().toISOString(),
    model: env.ADAPTIVE_EYE_VISION_MODEL || '',
    screenshotPath,
    status: 'vision_review_unavailable',
    summary: {
      totalFindings,
      eligibleFindings,
      reviewedFindings: 0,
      confirmed: 0,
      likely: 0,
      falsePositive: 0,
      inconclusive: 0
    },
    findings: [],
    warnings: [message]
  };
}

function normalizeReview(modelReview, expectedCount) {
  const modelFindings = Array.isArray(modelReview.findings) ? modelReview.findings : [];
  const findings = modelFindings
    .map((finding) => {
      const index = Number(finding.index);
      const domFinding = (report.findings || [])[index - 1] || {};

      return {
        index,
        element: {
          tag: domFinding.tag || '',
          text: domFinding.text || '',
          color: domFinding.color || '',
          backgroundColor: domFinding.backgroundColor || '',
          fontSize: domFinding.fontSize || '',
          fontWeight: domFinding.fontWeight || '',
          boundingBox: domFinding.boundingBox
        },
        domSeverity: domFinding.severity || '',
        domContrastRatio: domFinding.contrastRatio || '',
        visionVerdict: normalizeVerdict(finding.visionVerdict),
        confidence: ['high', 'medium', 'low'].includes(finding.confidence) ? finding.confidence : 'low',
        visualEvidence: finding.visualEvidence || '',
        reason: finding.reason || '',
        recommendedAction: finding.recommendedAction || ''
      };
    })
    .filter((finding) => Number.isFinite(finding.index));

  const summary = {
    totalFindings: modelReview.totalFindings ?? (Array.isArray(report.findings) ? report.findings.length : 0),
    eligibleFindings: modelReview.eligibleFindings ?? expectedCount,
    reviewedFindings: findings.length,
    confirmed: findings.filter((finding) => finding.visionVerdict === 'confirmed').length,
    likely: findings.filter((finding) => finding.visionVerdict === 'likely').length,
    falsePositive: findings.filter((finding) => finding.visionVerdict === 'false-positive').length,
    inconclusive: findings.filter((finding) => finding.visionVerdict === 'inconclusive').length
  };

  const warnings = Array.isArray(modelReview.warnings) ? modelReview.warnings : [];
  if (findings.length !== expectedCount) {
    warnings.push(`Expected ${expectedCount} reviewed findings, received ${findings.length}.`);
  }

  return {
    auditType: 'contrast-vision-review',
    sourceReportPath: options.reportPath,
    pageUrl: report.pageUrl || '',
    generatedAt: new Date().toISOString(),
    model: env.ADAPTIVE_EYE_VISION_MODEL,
    screenshotPath,
    status: modelReview.status || 'success',
    summary,
    findings,
    warnings
  };
}

function normalizeVerdict(value) {
  const verdict = String(value || '').trim().toLowerCase();
  return ['confirmed', 'likely', 'false-positive', 'inconclusive'].includes(verdict)
    ? verdict
    : 'inconclusive';
}

function renderMarkdown(review) {
  const lines = [
    '# Vision Contrast Review',
    '',
    `**URL:** ${review.pageUrl}`,
    `**Date:** ${review.generatedAt}`,
    `**Model:** ${review.model || 'unknown'}`,
    `**Status:** ${review.status}`,
    `**Source Report:** ${review.sourceReportPath}`,
    `**Screenshot:** ${review.screenshotPath}`,
    '',
    '## Summary',
    '',
    '| Metric | Count |',
    '|--------|-------|',
    `| DOM Findings | ${review.summary.totalFindings ?? '-'} |`,
    `| Eligible DOM Ratio 1 Findings | ${review.summary.eligibleFindings ?? '-'} |`,
    `| Reviewed Findings | ${review.summary.reviewedFindings} |`,
    `| Confirmed | ${review.summary.confirmed} |`,
    `| Likely | ${review.summary.likely} |`,
    `| False Positive | ${review.summary.falsePositive} |`,
    `| Inconclusive | ${review.summary.inconclusive} |`,
    '',
    '## Findings',
    '',
    '| # | DOM Severity | DOM Ratio | Vision Verdict | Confidence | Element | Reason | Recommendation |',
    '|---|--------------|-----------|----------------|------------|---------|--------|----------------|'
  ];

  if (review.findings.length === 0) {
    lines.push('| - | - | - | - | - | No model-reviewed findings. | - |');
  } else {
    for (const finding of review.findings) {
      lines.push(`| ${finding.index} | ${escapeCell(finding.domSeverity)} | ${escapeCell(finding.domContrastRatio)} | ${escapeCell(finding.visionVerdict)} | ${escapeCell(finding.confidence)} | ${escapeCell(formatElement(finding.element))} | ${escapeCell(finding.reason)} | ${escapeCell(finding.recommendedAction)} |`);
    }
  }

  lines.push(
    '',
    '## Warnings',
    '',
    review.warnings.length ? review.warnings.map((warning) => `- ${warning}`).join('\n') : 'No warnings.',
    ''
  );

  return lines.join('\n');
}

function escapeCell(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .replaceAll('|', '\\|')
    .trim();
}

function formatElement(element = {}) {
  const parts = [
    element.tag ? `<${element.tag}>` : '',
    element.text ? `"${element.text}"` : '',
    element.color && element.backgroundColor ? `${element.color} on ${element.backgroundColor}` : ''
  ].filter(Boolean);

  return parts.join(' ');
}

function mimeTypeForPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.jpg' || ext === '.jpeg') {
    return 'image/jpeg';
  }

  if (ext === '.webp') {
    return 'image/webp';
  }

  return 'image/png';
}

function trimForReport(value) {
  return String(value || '').replace(/\s+/g, ' ').slice(0, 500);
}
