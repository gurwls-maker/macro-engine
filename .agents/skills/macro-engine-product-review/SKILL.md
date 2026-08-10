---
name: macro-engine-product-review
description: Use for every substantive macro-engine product task, including calculations, UI, copy, onboarding, Records, storage, backup, DailyCoach, nutrition, scoring, exercise, migration, external audit acceptance or rejection, closeout, merge/release readiness, and judgments about whether a required next gate exists. Re-check the real problem, current code and data evidence, counterexamples, and complete scenario coverage before editing or closing work.
---

# Macro Engine Product Review

Use this workflow before every substantive app change or decision, including read-only external-audit acceptance/rejection, closeout, merge/release readiness, and judgments that no required next gate exists. Small typo, link, formatting, and command-output-only tasks may use the short audit in `AGENTS.md`.

## 1. Reconstruct the request

- Read `AGENTS.md` and the mandatory current-truth files it routes to.
- Read the original user conversation or attached source when the request depends on a long-running product decision.
- Treat GPT/Codex audits and documented next gates as hypotheses, not authority.
- For audit acceptance or closeout, decide separately (a) `이번 판정이 닫는 범위` and (b) the `프로젝트 전체 다음 상태` derived from the structured registry, current repo evidence, and latest user intent. A local PASS does not prove project completion, and optional, deferred, or blocked candidates are not approved next implementations.
- Treat `docs/00_current_truth/product_gates.json` as the only machine-readable product-gate authority. Result-log and historical prose are evidence, not executable state; never infer a gate from natural-language aliases, particles, verbs, or negation.
- Read the registry development contract before interpreting version labels or old data. Under `development/current_only/not_required`, do not invent legacy migration or backward-compatibility work; old development data may be reset or rejected with a clear unsupported-format result.
- Follow the registry execution sequence. Work only on its first incomplete `required` gate; do not start later `blocked` gates or optional features. Feature-branch commits and pushes are reversible checkpoints, while master integration requires the active gate to pass.
- Never copy an unmerged failed candidate wholesale into a clean implementation branch. Reuse a proven counterexample as an independent test only when it still applies to the current contract.
- Reuse an existing in-scope result log when a durable repository record is required. Do not create a new document for every review; keep transient console output, JSON, screenshots, and hashes in Git/CI evidence, the final user report, or an external audit bundle.
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
- Development-stage schema, transaction, rollback, and test-oracle choices are the implementer's responsibility. Do not turn an internal compatibility question into a user decision when the registry already says `current_only`.
- If two sibling failures expose the same authority boundary, stop adding example conditions and redesign that bounded gate before continuing. This is a design stop, not a request for the user to choose the code architecture.
