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

The routine asks one question before risky work:

```text
Is the requested next step still the correct next step when compared with current truth, git state, and required gates?
```

It should usually take about one minute. If it grows into a new meta-work loop, the routine is being misused.

## 2. One-minute PROMPT_SCOPE_AUDIT

Use this short form before macro/scoring/nutrition/exercise/docs-policy/release work:

```text
PROMPT_SCOPE_AUDIT:
- requested next step:
- repo/current truth next step:
- mismatch or risk:
- chosen action:
- why not broader:
```

Rules:
- This does not have to become a new document.
- Most audits belong in the result log.
- Add a document only when the mismatch materially changes project direction or gates.
- Do not assume the prompt is the correct next step.
- Do not assume a previous GPT/Codex opinion is still correct.

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
- release/tag/merge
- score tuning

Short form enough:
- typo fix
- link fix
- command output confirmation
- small README routing
- non-policy formatting

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

## 8. Next gate restoration

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
