import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const DEFAULT_NONE_THEME_PATH = 'C:\\Windows\\Resources\\Themes\\aero.theme';

export const CONTRAST_THEME_FILES = {
  aquatic: 'C:\\Windows\\resources\\Ease of Access Themes\\hcblack.theme',
  desert: 'C:\\Windows\\resources\\Ease of Access Themes\\hcwhite.theme',
  dusk: 'C:\\Windows\\resources\\Ease of Access Themes\\hc1.theme',
  'night-sky': 'C:\\Windows\\resources\\Ease of Access Themes\\hc2.theme'
};

export async function getInitialThemeState(deps = {}) {
  const readRegistryValues = deps.readRegistryValues || defaultReadRegistryValues;
  return readRegistryValues();
}

export function resolveNoneThemePath(state = {}) {
  return state.preHighContrastTheme || state.currentTheme || DEFAULT_NONE_THEME_PATH;
}

export function buildThemeApplicationCommand(themePath) {
  return `Start-Process -FilePath "${themePath}"; Start-Sleep -Seconds 2; Stop-Process -Name systemsettings -ErrorAction SilentlyContinue`;
}

export async function applyContrastTheme(theme, state, deps = {}) {
  const runPowerShell = deps.runPowerShell || defaultRunPowerShell;
  const sleep = deps.sleep || defaultSleep;
  const themePath = theme === 'none'
    ? resolveNoneThemePath(state)
    : CONTRAST_THEME_FILES[theme];

  if (!themePath) {
    throw new Error(`No Windows theme path configured for ${theme}.`);
  }

  await runPowerShell(buildThemeApplicationCommand(themePath));
  await sleep(1500);

  return {
    theme,
    themePath
  };
}

export async function restoreOriginalTheme(state, deps = {}) {
  const runPowerShell = deps.runPowerShell || defaultRunPowerShell;
  const sleep = deps.sleep || defaultSleep;
  const themePath = state.currentTheme || state.preHighContrastTheme || DEFAULT_NONE_THEME_PATH;

  await runPowerShell(buildThemeApplicationCommand(themePath));
  await sleep(1500);

  return themePath;
}

async function defaultReadRegistryValues() {
  const currentTheme = await readRegistryValue(
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes',
    'CurrentTheme'
  );
  const lastHighContrastTheme = await readRegistryValue(
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes',
    'LastHighContrastTheme'
  );
  const preHighContrastTheme = await readRegistryValue(
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\HighContrast',
    'Pre-High Contrast Scheme'
  );

  return {
    currentTheme,
    lastHighContrastTheme,
    preHighContrastTheme
  };
}

async function readRegistryValue(key, valueName) {
  try {
    const { stdout } = await execFileAsync(
      'reg',
      ['query', key, '/v', valueName],
      { windowsHide: true }
    );
    const line = stdout
      .split(/\r?\n/)
      .find((entry) => entry.includes(` ${valueName}`));

    return line ? line.trim().split(/\s{2,}/).pop() : '';
  } catch {
    return '';
  }
}

async function defaultRunPowerShell(script) {
  await execFileAsync(
    'powershell',
    ['-NoProfile', '-Command', script],
    { windowsHide: true }
  );
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
