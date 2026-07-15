---
name: macro-engine-product-review
description: Use for every substantive macro-engine product task, including calculations, UI, copy, onboarding, Records, storage, backup, DailyCoach, nutrition, scoring, exercise, migration, and release work. Re-check the real problem, current code and data evidence, counterexamples, and complete scenario coverage before editing.
---

# Macro Engine Product Review

Use this workflow before every substantive app change. Small typo, link, formatting, and command-output-only tasks may use the short audit in `AGENTS.md`.

## 1. Reconstruct the request

- Read `AGENTS.md` and the mandatory current-truth files it routes to.
- Read the original user conversation or attached source when the request depends on a long-running product decision.
- Treat GPT/Codex audits and documented next gates as hypotheses, not authority.
- State the root problem without document names or implementation terms.

## 2. Inspect reality

- Read the production code path, rendered UI, data shape, fixtures, and relevant tests.
- Identify what the app actually knows and what it cannot truthfully infer.
- Separate external evidence from product-model choices. Record both what a source supports and what it does not specify.
- Write the strongest argument against the requested or proposed direction.

## 3. Preserve the product's domain behavior

- For every feature, identify the full state machine, ownership boundary, persistence behavior, accessibility behavior, and user-visible fallback before editing.
- Do not solve a calculation problem with copy, a data problem with UI hiding, or a product problem with a new document alone.
- For copy, read every affected visible sentence in context; tests protect meaning but do not make awkward old wording authoritative.
- For storage, backup, Records, onboarding, and release work, verify round trips and old/new state boundaries rather than assuming the happy path.

### Continuous physiological and numeric behavior

- Do not introduce fixed penalty tables, threshold caps, coarse exercise buckets, or count buckets as physiological score behavior.
- Use evidence-backed anchors and continuous interpolation or pressure where the underlying phenomenon is continuous.
- Discrete labels may select wording or UI state, but they must not create an unexamined score, target, or recommendation cliff.
- Add monotonicity, continuity, boundary-neighborhood, and extreme-input tests when numeric behavior changes.

## 4. Separate scope correctly

- `minimal surface` means touching only the necessary product and file surfaces.
- `complete feature` means closing all semantic states, combinations, fallbacks, error paths, rendering states, and regressions inside that surface.
- Never use a small diff as a reason to leave required behavior for an unspecified later task.
- Never broaden into storage, schema, migration, score tuning, or UI explanation unless the root problem requires it.

## 5. Cover the domain, not examples

- Build a scenario matrix across every relevant input, state, history, persistence, context, confidence, viewport, and display dimension.
- Use representative fixtures for semantic partitions and grid/property checks for continuous numeric space.
- Include mixed and opposing cases, not only the example that triggered the task.
- State what would falsify the chosen design and make those conditions executable tests where possible.

## 6. Own the engineering decision

- Do not ask the user to choose coefficients or internal mechanics they cannot reasonably evaluate.
- Ask only for product values or tradeoffs that evidence and tests cannot decide.
- Explain the outcome in plain Korean before listing files, functions, or test counts.
