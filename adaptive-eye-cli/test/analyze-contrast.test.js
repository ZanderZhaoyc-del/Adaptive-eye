import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

test('scans leaf text elements without counting parent containers', async () => {
  const script = await readFile(new URL('../browser-scripts/analyze-contrast.js', import.meta.url), 'utf8');
  const span = createElement('span', {
    textContent: 'Child text',
    rect: { left: 10, top: 10, width: 80, height: 20 },
    computedStyle: {
      color: 'rgb(0, 0, 0)',
      backgroundColor: 'rgba(0, 0, 0, 0)',
      fontSize: '16px',
      fontWeight: '400'
    }
  });
  const button = createElement('button', {
    textContent: 'Submit',
    rect: { left: 10, top: 40, width: 90, height: 30 },
    computedStyle: {
      color: 'rgb(255, 255, 255)',
      backgroundColor: 'rgb(0, 0, 120)',
      fontSize: '16px',
      fontWeight: '400'
    }
  });
  const container = createElement('div', {
    textContent: 'Child text Submit',
    children: [span, button],
    rect: { left: 0, top: 0, width: 400, height: 200 },
    computedStyle: {
      color: 'rgb(0, 0, 0)',
      backgroundColor: 'rgb(255, 255, 255)',
      fontSize: '16px',
      fontWeight: '400'
    }
  });
  const elements = [container, span, button];

  const result = vm.runInNewContext(script, {
    document: createDocument(elements),
    window: createWindow(),
    Math,
    URL
  });

  assert.equal(result.status, 'success');
  assert.equal(result.summary.totalElements, 2);
});

test('parses rgb and rgba colors without temporary computed-style override', async () => {
  const script = await readFile(new URL('../browser-scripts/analyze-contrast.js', import.meta.url), 'utf8');
  const span = createElement('span', {
    textContent: 'Visible text',
    rect: { left: 10, top: 10, width: 100, height: 20 },
    computedStyle: {
      color: 'rgb(255, 255, 255)',
      backgroundColor: 'rgba(0, 0, 0, 0)',
      fontSize: '16px',
      fontWeight: '400'
    }
  });

  const result = vm.runInNewContext(script, {
    document: createDocument([span], {
      bodyStyle: {
        color: 'rgb(255, 255, 255)',
        backgroundColor: 'rgb(0, 0, 0)'
      },
      temporaryColorOverride: 'rgb(255, 255, 255)'
    }),
    window: createWindow(),
    Math,
    URL
  });

  assert.equal(result.status, 'success');
  assert.equal(result.summary.totalElements, 1);
  assert.equal(result.summary.issuesFound, 0);
  assert.equal(result.summary.passCount, 1);
});

function createElement(tagName, options = {}) {
  const element = {
    tagName: tagName.toUpperCase(),
    textContent: options.textContent || '',
    children: options.children || [],
    parentElement: null,
    style: {},
    computedStyle: {
      visibility: 'visible',
      display: 'block',
      opacity: '1',
      color: 'rgb(0, 0, 0)',
      backgroundColor: 'rgba(0, 0, 0, 0)',
      fontSize: '16px',
      fontWeight: '400',
      ...(options.computedStyle || {})
    },
    isTemporary: Boolean(options.isTemporary),
    getBoundingClientRect() {
      return options.rect || { left: 0, top: 0, width: 100, height: 20 };
    }
  };

  element.children.forEach((child) => {
    child.parentElement = element;
  });

  return element;
}

function createDocument(elements, options = {}) {
  const body = createElement('body', {
    computedStyle: {
      color: 'rgb(0, 0, 0)',
      backgroundColor: 'rgb(255, 255, 255)',
      ...(options.bodyStyle || {})
    }
  });
  body.temporaryColorOverride = options.temporaryColorOverride;
  const documentElement = createElement('html', {
    computedStyle: {
      color: 'rgb(0, 0, 0)',
      backgroundColor: 'rgb(255, 255, 255)'
    }
  });

  elements.forEach((element) => {
    if (!element.parentElement) {
      element.parentElement = body;
    }
  });

  body.appendChild = (element) => {
    element.parentElement = body;
  };
  body.removeChild = (element) => {
    element.parentElement = null;
  };

  return {
    body,
    documentElement,
    title: 'Test page',
    createElement: (tagName) => createElement(tagName, { isTemporary: true }),
    querySelectorAll: () => elements
  };
}

function createWindow() {
  return {
    location: { href: 'https://example.com/' },
    innerWidth: 1024,
    innerHeight: 768,
    scrollX: 0,
    scrollY: 0,
    getComputedStyle: (element) => ({
      ...element.computedStyle,
      color: element.isTemporary && element.parentElement?.temporaryColorOverride
        ? element.parentElement.temporaryColorOverride
        : element.style.color || element.computedStyle.color,
      backgroundColor: element.style.backgroundColor || element.computedStyle.backgroundColor
    })
  };
}
