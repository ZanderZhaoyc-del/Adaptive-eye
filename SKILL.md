---
name: adaptive-eye-routing
description: Use when working in the Adaptive Eye project and deciding which project skill should handle a contrast audit, annotated screenshot workflow, or Windows contrast-theme comparison run.
---

# Adaptive Eye Routing

This file is the project entry point. Keep detailed execution steps in `.agents/skills/.../SKILL.md` and use this file only to route work to the right skill.

## Skill Routing

- Use `adaptive-eye-audit` for a normal single-page WCAG color contrast audit on one URL.
- Use `annotated-screenshot-report` when the user already has an audit JSON report and wants visual issue boxes added to a screenshot.
- Use `theme-batch-audit` when the user wants to compare one page across Windows contrast themes such as `none`, `aquatic`, `desert`, `dusk`, or `night-sky`.
- Use `vision-contrast-review` after a contrast report has findings or `fallbackRequired: true`, or when the user asks for AI/vision-model review of reported contrast issues.

## Guardrails

- Prefer the bundled CLI over manually reconstructing browser steps.
- Treat theme-batch auditing as a workflow built on top of contrast auditing, not as a standalone generic theme-switch feature.
- Treat vision review as a follow-up validation layer, not as a replacement for DOM contrast measurements.
- Do not claim full accessibility coverage from these skills.
- If the user asks for keyboard, focus-order, ARIA, screen-reader, or other non-contrast audits, say that those areas need separate implemented features or future skills.
