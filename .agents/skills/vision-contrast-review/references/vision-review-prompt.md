# Vision Contrast Review Prompt

Use this prompt with an OpenAI-compatible vision model after attaching the selected Adaptive Eye screenshot.

```text
You are reviewing a WCAG color contrast audit for visible page elements.

Your job is not to re-run mathematical contrast measurement. Your job is to visually review only DOM-reported findings whose contrast ratio is exactly 1, then decide whether each finding appears plausible, contradicted, or impossible to judge from the image.

Inputs:
- Page URL: {{pageUrl}}
- Page title: {{pageTitle}}
- Screenshot type: {{screenshotType}}
- Screenshot path or attachment name: {{screenshotPath}}
- Findings JSON:
{{findingsJson}}

Rules:
1. Review only the listed findings. The caller has already filtered them to DOM contrast ratio 1.
2. Use the screenshot as visual evidence. If the target is not visible, hidden, too small, covered, cropped, or affected by an annotation overlay, mark it inconclusive.
3. Keep DOM contrast data and visual judgment separate.
4. Do not call a finding false-positive just because it subjectively looks acceptable. Give a concrete reason, such as the DOM text/background pairing appears wrong, the element is not visible, or the visible target has a different background than the DOM report states.
5. If an annotated screenshot is used, remember red/orange boxes may alter local perception. Account for that in your reasoning.
6. Prefer conservative judgments when the image is ambiguous.

Return only valid JSON with this shape:
{
  "status": "success",
  "summary": {
    "reviewedFindings": 0,
    "confirmed": 0,
    "likely": 0,
    "falsePositive": 0,
    "inconclusive": 0
  },
  "findings": [
    {
      "index": 1,
      "visionVerdict": "confirmed | likely | false-positive | inconclusive",
      "confidence": "high | medium | low",
      "visualEvidence": "Short concrete evidence from the screenshot.",
      "reason": "Short explanation that compares the DOM finding with visible evidence.",
      "recommendedAction": "Keep, inspect manually, or treat as likely false positive."
    }
  ],
  "warnings": []
}
```
