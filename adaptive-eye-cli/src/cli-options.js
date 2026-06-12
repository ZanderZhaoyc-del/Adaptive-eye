const REPORT_FORMATS = new Set(['json', 'markdown', 'both']);
export const SUPPORTED_CONTRAST_THEMES = ['none', 'aquatic', 'desert', 'dusk', 'night-sky'];
const SUPPORTED_CONTRAST_THEME_SET = new Set(SUPPORTED_CONTRAST_THEMES);

export function parseCliArgs(argv) {
  const [command, target, ...rest] = argv;

  if (!command || command === '--help' || command === '-h') {
    return { command: 'help' };
  }

  if (command === 'annotate') {
    return parseAnnotateArgs(target, rest);
  }

  if (command === 'themes') {
    return parseThemesArgs(target, rest);
  }

  if (command !== 'page') {
    throw new Error(`Unsupported command: ${command}`);
  }

  return parsePageArgs(command, target, rest);
}

export function helpText() {
  return [
    'Usage:',
    '  adaptive-eye page <url> [options]',
    '  adaptive-eye themes <url> [options]',
    '  adaptive-eye annotate <report-json> [options]',
    '',
    'Page options:',
    '  --report <json|markdown|both>  Report output format. Default: both',
    '  --out-dir <path>               Output directory. Default: reports/adaptive-eye-YYYY-MM-DD-HHMM',
    '  --screenshot                   Capture a clean full-page screenshot (no overlay) for vision review.',
    '  --script <path>                Browser eval script path.',
    '  --no-open                      Skip browser-use open.',
    '  --no-screenshot                Skip fallback screenshot capture.',
    '',
    'Theme batch options:',
    '  --themes <list>                Comma-separated list: none,aquatic,desert,dusk,night-sky',
    '  --report <json|markdown|both>  Report output format. Default: both',
    '  --out-dir <path>               Output directory. Default: reports/adaptive-eye-YYYY-MM-DD-HHMM',
    '  --screenshot                   Capture a clean per-theme screenshot (recommended; feeds vision-contrast-review).',
    '  --annotate                     Generate annotated screenshot per theme after JSON report creation.',
    '  --reload-between-themes        Reload page between themes (use only when site reads contrast theme at load time).',
    '  --script <path>                Browser eval script path.',
    '  --no-open                      Skip browser-use open.',
    '  --no-screenshot                Skip fallback screenshot capture.',
    '',
    'Annotate options:',
    '  --out-dir <path>               Output directory. Default: report directory',
    '  --vision-review <json>         Exclude findings marked false-positive by vision review',
    '  --no-open                      Skip browser-use open before screenshot.',
    '  -h, --help                     Show help.'
  ].join('\n');
}

function parsePageArgs(command, url, rest) {
  if (!url) {
    throw new Error('Missing required URL for page audit.');
  }

  const options = {
    command,
    url,
    report: 'both',
    outDir: undefined,
    scriptPath: undefined,
    openBrowser: true,
    screenshotOnFallback: true,
    captureCleanScreenshot: false
  };

  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];

    if (flag === '--report') {
      options.report = readFlagValue(rest, index, flag);
      index += 1;
      continue;
    }

    if (flag === '--out-dir') {
      options.outDir = readFlagValue(rest, index, flag);
      index += 1;
      continue;
    }

    if (flag === '--script') {
      options.scriptPath = readFlagValue(rest, index, flag);
      index += 1;
      continue;
    }

    if (flag === '--no-open') {
      options.openBrowser = false;
      continue;
    }

    if (flag === '--no-screenshot') {
      options.screenshotOnFallback = false;
      continue;
    }

    if (flag === '--screenshot') {
      options.captureCleanScreenshot = true;
      continue;
    }

    throw new Error(`Unknown option: ${flag}`);
  }

  if (!REPORT_FORMATS.has(options.report)) {
    throw new Error(`Unsupported report format: ${options.report}`);
  }

  return options;
}

function parseThemesArgs(url, rest) {
  const options = {
    ...parsePageArgs('themes', url, []),
    themes: [...SUPPORTED_CONTRAST_THEMES],
    annotate: false,
    reloadBetweenThemes: false
  };

  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];

    if (flag === '--themes') {
      options.themes = parseThemesList(readFlagValue(rest, index, flag));
      index += 1;
      continue;
    }

    if (flag === '--annotate') {
      options.annotate = true;
      continue;
    }

    if (flag === '--reload-between-themes') {
      options.reloadBetweenThemes = true;
      continue;
    }

    if (flag === '--report') {
      options.report = readFlagValue(rest, index, flag);
      index += 1;
      continue;
    }

    if (flag === '--out-dir') {
      options.outDir = readFlagValue(rest, index, flag);
      index += 1;
      continue;
    }

    if (flag === '--script') {
      options.scriptPath = readFlagValue(rest, index, flag);
      index += 1;
      continue;
    }

    if (flag === '--no-open') {
      options.openBrowser = false;
      continue;
    }

    if (flag === '--no-screenshot') {
      options.screenshotOnFallback = false;
      continue;
    }

    if (flag === '--screenshot') {
      options.captureCleanScreenshot = true;
      continue;
    }

    throw new Error(`Unknown option: ${flag}`);
  }

  if (!REPORT_FORMATS.has(options.report)) {
    throw new Error(`Unsupported report format: ${options.report}`);
  }

  return options;
}

function parseAnnotateArgs(reportPath, rest) {
  if (!reportPath) {
    throw new Error('Missing required JSON report path for annotation.');
  }

  const options = {
    command: 'annotate',
    reportPath,
    outDir: undefined,
    visionReviewPath: undefined,
    openBrowser: true
  };

  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];

    if (flag === '--out-dir') {
      options.outDir = readFlagValue(rest, index, flag);
      index += 1;
      continue;
    }

    if (flag === '--vision-review') {
      options.visionReviewPath = readFlagValue(rest, index, flag);
      index += 1;
      continue;
    }

    if (flag === '--no-open') {
      options.openBrowser = false;
      continue;
    }

    throw new Error(`Unknown option: ${flag}`);
  }

  return options;
}

function readFlagValue(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function parseThemesList(value) {
  const themes = value.split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (themes.length === 0) {
    throw new Error('Unsupported contrast theme list: no themes provided.');
  }

  themes.forEach((theme) => {
    if (!SUPPORTED_CONTRAST_THEME_SET.has(theme)) {
      throw new Error(`Unsupported contrast theme: ${theme}`);
    }
  });

  return themes;
}
