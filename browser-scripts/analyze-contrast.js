(function analyzeContrast() {
  'use strict';

  try {
    function parseColor(colorStr) {
      const div = document.createElement('div');
      div.style.color = colorStr;
      document.body.appendChild(div);
      const computed = window.getComputedStyle(div).color;
      document.body.removeChild(div);

      const match = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!match) return null;

      return {
        r: parseInt(match[1], 10),
        g: parseInt(match[2], 10),
        b: parseInt(match[3], 10),
        a: match[4] !== undefined ? parseFloat(match[4]) : 1
      };
    }

    function getEffectiveBgColor(el) {
      let current = el;
      while (current && current !== document.body && current !== document.documentElement) {
        const style = window.getComputedStyle(current);
        const bg = parseColor(style.backgroundColor);
        if (bg && bg.a > 0) {
          return bg;
        }
        current = current.parentElement;
      }

      const bodyBg = parseColor(window.getComputedStyle(document.body).backgroundColor);
      if (bodyBg && bodyBg.a > 0) return bodyBg;

      const htmlBg = parseColor(window.getComputedStyle(document.documentElement).backgroundColor);
      if (htmlBg && htmlBg.a > 0) return htmlBg;

      return { r: 255, g: 255, b: 255, a: 1 };
    }

    function getLuminance(r, g, b) {
      const channels = [r, g, b].map(function normalizeChannel(value) {
        const normalized = value / 255;
        return normalized <= 0.03928
          ? normalized / 12.92
          : Math.pow((normalized + 0.055) / 1.055, 2.4);
      });

      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    }

    function contrastRatio(color1, color2) {
      const lum1 = getLuminance(color1.r, color1.g, color1.b);
      const lum2 = getLuminance(color2.r, color2.g, color2.b);
      return (Math.max(lum1, lum2) + 0.05) / (Math.min(lum1, lum2) + 0.05);
    }

    function isVisible(el) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        style.opacity !== '0';
    }

    function hasTextContent(el) {
      const text = el.textContent || '';
      return text.trim().length > 0;
    }

    function getTextElements() {
      const selectors = [
        'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'span', 'a', 'button', 'label', 'li',
        'td', 'th', 'div', 'strong', 'em'
      ];
      const allElements = document.querySelectorAll(selectors.join(', '));
      const textElements = [];

      for (let i = 0; i < allElements.length; i += 1) {
        const el = allElements[i];
        if (isVisible(el) && hasTextContent(el)) {
          textElements.push(el);
        }
      }

      return textElements;
    }

    function analyzeElement(el) {
      const style = window.getComputedStyle(el);
      const color = parseColor(style.color);
      if (!color) return null;

      const rect = el.getBoundingClientRect();
      const bgColor = getEffectiveBgColor(el);
      const ratio = contrastRatio(color, bgColor);
      const fontSize = parseFloat(style.fontSize);
      const fontWeight = parseInt(style.fontWeight, 10) || 400;
      const isBold = fontWeight >= 700;
      const isLarge = fontSize >= 18 || (fontSize >= 14 && isBold);
      const aaPass = isLarge ? ratio >= 3.0 : ratio >= 4.5;
      const aaaPass = isLarge ? ratio >= 4.5 : ratio >= 7.0;

      return {
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || '').trim().slice(0, 100),
        color: 'rgb(' + color.r + ',' + color.g + ',' + color.b + ')',
        backgroundColor: 'rgb(' + bgColor.r + ',' + bgColor.g + ',' + bgColor.b + ')',
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        isLargeText: isLarge,
        contrastRatio: parseFloat(ratio.toFixed(2)),
        wcagAA: aaPass,
        wcagAAA: aaaPass,
        severity: ratio < 3.0 ? 'critical' : ratio < 4.5 ? 'warning' : 'pass',
        boundingBox: {
          x: Math.round(rect.left + window.scrollX),
          y: Math.round(rect.top + window.scrollY),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
      };
    }

    const elements = getTextElements();
    const results = [];
    const issues = [];

    for (let i = 0; i < elements.length; i += 1) {
      const result = analyzeElement(elements[i]);
      if (result) {
        results.push(result);
        if (!result.wcagAA) {
          issues.push(result);
        }
      }
    }

    issues.sort(function sortByContrastRatio(a, b) {
      return a.contrastRatio - b.contrastRatio;
    });

    const summary = {
      totalElements: results.length,
      issuesFound: issues.length,
      criticalIssues: issues.filter(function isCritical(issue) { return issue.severity === 'critical'; }).length,
      warningIssues: issues.filter(function isWarning(issue) { return issue.severity === 'warning'; }).length,
      passCount: results.filter(function isPassing(result) { return result.wcagAA; }).length
    };

    return {
      status: results.length > 0 ? 'success' : 'empty',
      pageUrl: window.location.href,
      pageTitle: document.title,
      pageDimensions: {
        width: Math.max(
          document.documentElement.scrollWidth,
          document.body ? document.body.scrollWidth : 0,
          window.innerWidth
        ),
        height: Math.max(
          document.documentElement.scrollHeight,
          document.body ? document.body.scrollHeight : 0,
          window.innerHeight
        )
      },
      summary: summary,
      issues: issues.slice(0, 50)
    };
  } catch (err) {
    return {
      status: 'error',
      errorMessage: err.message || String(err),
      summary: {
        totalElements: 0,
        issuesFound: 0,
        criticalIssues: 0,
        warningIssues: 0,
        passCount: 0
      },
      issues: []
    };
  }
})();
