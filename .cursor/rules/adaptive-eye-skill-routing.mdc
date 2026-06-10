---
description: Route Adaptive Eye work to the right project skill
alwaysApply: true
---

# Adaptive Eye Skill Routing

When working in this project, prefer project skills over ad-hoc command reconstruction.

- Use `adaptive-eye-audit` when the user wants a single-page WCAG contrast audit for one URL.
- Use `annotated-screenshot-report` when the user wants issue boxes drawn on a screenshot from an existing audit JSON report.
- Use `theme-batch-audit` when the user wants to compare contrast results across Windows contrast themes such as `none`, `aquatic`, `desert`, `dusk`, or `night-sky`.

Routing rules:

- If the user asks for theme switching only as part of contrast comparison, use `theme-batch-audit`, not a standalone theme-switch workflow.
- If the user asks for a normal contrast audit first and then visual marking, use `adaptive-eye-audit` followed by `annotated-screenshot-report`.
- Treat theme-batch auditing as a workflow built on top of Adaptive Eye contrast auditing, not as a general-purpose accessibility skill.

Scope guardrails:

- Do not claim full accessibility coverage from these skills.
- If the user asks for keyboard, focus, ARIA, screen-reader, or other non-contrast audits, say that this project currently has separate or future functionality for those areas unless an implemented feature exists.
