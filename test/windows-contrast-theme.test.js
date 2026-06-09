import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONTRAST_THEME_FILES,
  DEFAULT_NONE_THEME_PATH,
  buildThemeApplicationCommand,
  getInitialThemeState,
  resolveNoneThemePath
} from '../src/windows-contrast-theme.js';

test('maps logical contrast themes to Windows ease-of-access theme files', () => {
  assert.equal(CONTRAST_THEME_FILES.aquatic, 'C:\\Windows\\resources\\Ease of Access Themes\\hcblack.theme');
  assert.equal(CONTRAST_THEME_FILES.desert, 'C:\\Windows\\resources\\Ease of Access Themes\\hcwhite.theme');
  assert.equal(CONTRAST_THEME_FILES.dusk, 'C:\\Windows\\resources\\Ease of Access Themes\\hc1.theme');
  assert.equal(CONTRAST_THEME_FILES['night-sky'], 'C:\\Windows\\resources\\Ease of Access Themes\\hc2.theme');
});

test('prefers pre-high-contrast scheme for explicit none theme', () => {
  const state = {
    currentTheme: 'C:\\Users\\admin\\AppData\\Local\\Microsoft\\Windows\\Themes\\Custom.theme',
    preHighContrastTheme: 'C:\\Users\\admin\\AppData\\Local\\Microsoft\\Windows\\Themes\\Saved.theme'
  };

  assert.equal(resolveNoneThemePath(state), 'C:\\Users\\admin\\AppData\\Local\\Microsoft\\Windows\\Themes\\Saved.theme');
});

test('falls back to current theme and then aero for explicit none theme', () => {
  assert.equal(
    resolveNoneThemePath({ currentTheme: 'C:\\Users\\admin\\AppData\\Local\\Microsoft\\Windows\\Themes\\Custom.theme' }),
    'C:\\Users\\admin\\AppData\\Local\\Microsoft\\Windows\\Themes\\Custom.theme'
  );

  assert.equal(resolveNoneThemePath({}), DEFAULT_NONE_THEME_PATH);
});

test('captures original state from registry values', async () => {
  const state = await getInitialThemeState({
    readRegistryValues: async () => ({
      currentTheme: 'C:\\Users\\admin\\AppData\\Local\\Microsoft\\Windows\\Themes\\Custom.theme',
      lastHighContrastTheme: 'C:\\Windows\\resources\\Ease of Access Themes\\hcwhite.theme',
      preHighContrastTheme: 'C:\\Users\\admin\\AppData\\Local\\Microsoft\\Windows\\Themes\\Saved.theme'
    })
  });

  assert.equal(state.currentTheme, 'C:\\Users\\admin\\AppData\\Local\\Microsoft\\Windows\\Themes\\Custom.theme');
  assert.equal(state.lastHighContrastTheme, 'C:\\Windows\\resources\\Ease of Access Themes\\hcwhite.theme');
  assert.equal(state.preHighContrastTheme, 'C:\\Users\\admin\\AppData\\Local\\Microsoft\\Windows\\Themes\\Saved.theme');
});

test('builds theme application command with settings cleanup', () => {
  assert.equal(
    buildThemeApplicationCommand('C:\\Windows\\resources\\Ease of Access Themes\\hc1.theme'),
    'Start-Process -FilePath "C:\\Windows\\resources\\Ease of Access Themes\\hc1.theme"; Start-Sleep -Seconds 2; Stop-Process -Name systemsettings -ErrorAction SilentlyContinue'
  );
});
