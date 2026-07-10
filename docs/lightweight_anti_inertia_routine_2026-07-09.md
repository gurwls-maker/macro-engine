MANDATORY PRE-READ
- docs/00_current_truth/00_READ_FIRST.txt
- docs/00_current_truth/02_macro_range_current_truth.txt
- docs/00_current_truth/04_document_status_index.txt

READ RESULT
- read_before_writing: yes
- current_truth_version: 2026-07-07-v1 plus v8.3.1 scoring tuning protocol decision
- source_ledger_checked: not directly; current truth and status index are the active routing source
- superseded_docs_checked: v8.2 status via 04_document_status_index only
- external_anchor_checked: not applicable; this is process guard, not score tuning

DOCUMENT ROLE
- decision

FORBIDDEN WITHOUT EXPLICIT SUPERSEDING DECISION
- v8.2 fixed penalty table as production body
- stepwise score cap
- hard zero threshold as primary scoring policy
- exercise bonus
- v6.1 alcoholImpactPenalty post-score subtraction
- scoreDeltaPreview mainline
- preview field storage/UI/Recent/DailyCoach exposure

# lightweight anti-inertia execution routine

Date: 2026-07-09

Scope:
- docs-only lightweight process guard
- no evidence pack
- no score tuning
- no scoring formula change
- no `index.html` change
- no UI/storage/schema change
- no tag change

## 1. Purpose

This routine exists to reduce manual dependence on long warning prompts. It is not a new product gate and not a reason to delay real work repeatedly.

The routine asks two questions before risky work:

```text
1. Is the requested next step still the correct next step when compared with current truth, git state, and required gates?
2. Does the chosen action actually solve the root problem, or does it merely match the documented next gate?
```

It should usually take about one minute. If it grows into a new meta-work loop, the routine is being misused.

Important correction:
- A REQUIRED_NEXT_GATES entry is a hypothesis, not proof.
- A documented next gate is a hypothesis.
- "Current truth says this is next" is not enough.
- "The previous audit says this is next" is not enough.
- Before acting, state the actual product/math/UI/user problem in plain language and check whether the chosen action would solve it.

## 2. One-minute PROMPT_SCOPE_AUDIT

Use this short form before macro/scoring/nutrition/exercise/docs-policy/release work:

```text
PROMPT_SCOPE_AUDIT:
- requested next step:
- repo/current truth next step:
- root problem in plain language:
- evidence checked outside next-gate text:
- alternatives considered:
- why the chosen action solves the root problem:
- what would prove this choice wrong:
- mismatch or risk:
- chosen action:
- minimal surface:
- complete scope:
- why not broader:
```

Rules:
- This does not have to become a new document.
- Most audits belong in the result log.
- Add a document only when the mismatch materially changes project direction or gates.
- Do not assume the prompt is the correct next step.
- Do not assume a previous GPT/Codex opinion is still correct.
- Do not assume the current truth next gate is correct merely because it is documented.
- If the chosen action cannot explain how it solves the root problem, adjust scope before editing.
- For product/math/UI problems, inspect the relevant code path, screen behavior, data shape, or fixture logic before accepting a docs-only or copy-only step.

## 2.5. Adversarial root-problem check

The audit must be adversarial, not ceremonial.

Before editing, answer these checks:

```text
1. What is the real issue if all document names are ignored?
2. Would the proposed step fix that issue, or only update routing/docs/copy?
3. What is the strongest alternative action?
4. What evidence would make the proposed step wrong?
5. Is the latest user correction overriding a stale current-truth path?
6. Is this another version of a previously rejected pattern?
```

If the task is macro/scoring/nutrition/exercise and the answer depends on app behavior, do not stop at document routing.
Read or inspect the relevant production code, current screen behavior, test fixture, or data contract.

Examples:
- If the problem is math/model consistency, card copy/help is not a sufficient solution.
- If the problem is user-facing copy, exact old test strings are not automatically correct.
- If the problem is old records or scoreDelta, do not preserve them merely because historical docs mention them.
- If the problem is tuning, do not change coefficients until fixture/evidence says the current curve is wrong.

## 2.6. Compact merge/publish checkpoint

Do not turn every merge/publish into a large standalone task.

If a branch is already reviewed, tested, and low-risk, merge/publish is a short checkpoint that can be followed immediately by the next substantive task in the same turn.

Use the compact form for:
- docs-only decision publish
- readiness/status publish
- current truth / README routing publish
- already-audited copy batch merge
- already-audited docs-policy guard merge

Compact form:

```text
1. Check HEAD / clean working tree / target branch / v8.3 tag if relevant.
2. Run docs-policy and the directly relevant test profile.
3. no-ff merge and push.
4. Re-check docs-policy / refs.
5. Continue to the next substantive task if the prompt or current repo state requires it.
```

Split merge/publish into a separate full audit only when the publish boundary itself is high-risk:
- scoring formula or range calculation changed
- storage/schema/backup/restore changed
- old records migration/reset/recompute changed
- release tag creation or tag movement
- tests pass but product/math/UI meaning is still uncertain

Anti-inertia correction:
- Do not stop after merge/publish when the user asked to continue into the next real implementation.
- Do not invent a next implementation merely because publish completed; verify that a real issue or current gate exists.
- If no real issue exists, say so briefly and stop. If one exists, proceed.
- Merge/publish is a safety checkpoint, not a reason to postpone real work by default.

## 3. Minimal surface vs complete scope

Before editing, separate these two ideas.

Minimal surface:
- Which files or product surfaces must not be touched?
- Which implementation paths are blocked?
- What would make this task stop?

Complete scope:
- What judgment must be fully closed in this task?
- Which current truth / README / status index entries must reflect it?
- What must appear in the result log?
- What is the next gate after this task?

The point is not to make every task small. The point is to keep the edited surface minimal while completing the actual judgment.

## 4. Anti-loop rules

- Anti-inertia routine must not create another anti-inertia task by default.
- Do not create a new decision document merely because prompt scope was checked.
- If mismatch is minor, record it in the result log and continue.
- If mismatch is material, choose one:
  1. proceed as requested
  2. adjust scope and proceed
  3. stop and ask user
- Do not enter review-the-review loops.
- Do not use this routine to keep postponing `v8.3.1 scoring tuning curve candidate simulation decision`.

Korean summary:
- 이 루틴은 작업을 막기 위한 문서 관문이 아니라, 작업 시작 전 방향 확인이다.
- 루틴 점검 때문에 새 문서를 무한히 만들지 않는다.
- 대부분은 결과로그에 짧게 남기는 것으로 충분하다.

## 5. Stale-routine / supersede rules

- Latest user instruction and current truth can supersede this routine.
- If current truth changes, follow current truth.
- If this routine becomes stale, update or retire it.
- Do not treat this checklist as permanent law.
- If applying the routine would distort a changed task type, state that and use the smaller appropriate form.

## 6. Task-type application

Full form required:
- macro/scoring/nutrition/exercise policy
- docs-policy
- storage/schema
- migration/reset
- release/tag creation or tag movement
- score tuning

Short form enough:
- typo fix
- link fix
- command output confirmation
- small README routing
- non-policy formatting
- already-reviewed docs-only/readiness/copy merge-publish

## 7. Result-log template

Use this shape when the task is risky enough to need the full form:

```text
작업 결과:
- 브랜치:
- 커밋:
- working tree:
- push:

PROMPT_SCOPE_AUDIT:
- 요청된 다음 단계:
- repo 기준 실제 다음 단계:
- 실제 문제:
- 문서 밖에서 확인한 증거:
- 검토한 대안:
- 선택한 작업이 실제 문제를 푸는 이유:
- 이 선택이 틀렸다고 볼 조건:
- 다르게 판단한 점:
- 선택한 이유:

수용:
폐기:
통합:
보류:
금지선:
최소로 한 것:
전체로 닫은 것:
다음 단계:
```

For low-risk tasks, a one-line audit in the result log is enough.

## 8. Historical next gate restoration

This section is historical. It records what the next product gate was when this process guard was first written.
Do not use this section as the current next-step source.
The active next-step source is always the latest user intent plus current truth / status index / actual repo state.

This document does not replace the v8.3.1 scoring path.

Next gate after this process hardening:
- `v8.3.1 scoring tuning curve candidate simulation decision`

Follow-up correction:
- The evidence pack was closed by `docs/v8.3.1_scoring_tuning_evidence_pack_2026-07-09.md`.
- The old "user confirmation answers" gate name was replaced by `docs/v8.3.1_scoring_tuning_objective_rubric_decision_2026-07-09.md` because exact score coefficients are Codex design output, not user input.

Not next:
- another anti-inertia document
- direct score tuning implementation
- broad UI/storage/schema expansion
- scoreDeltaPreview product path
- old records cleanup/reset/fallback implementation
