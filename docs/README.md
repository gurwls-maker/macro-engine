# 탄단지 다이어리 문서 읽는 순서

# v8.0-AJ full Cartesian next-shard planner note

- AJ adds `tools/render_audit/plan_v8_full_cartesian_shards.cjs`.
- The planner reads a coverage ledger, finds uncovered ranges, and emits deterministic next execution ranges without claiming those ranges have already run.
- It reports exact range commands and shard-index batch commands separately.
- If a partially covered shard would be rerun by shard index, it reports `wouldRerunCaseCountIfUsingShardIndexes` and marks `exactRangeExecutionRequiredForNoDuplicateCoverage=true`.
- Verification on 2026-06-03: clean ledger pilot with `--shard-size=8 --max-shards=4` planned shard indexes 1,2,3,4 / planned uncovered 32 / duplicate-if-batch 0; truncation probe with `--shard-size=100000 --max-shards=2` planned exact `8~100000` first / planned uncovered 199,992 / duplicate-if-batch 8 / exact range required true; `runV8ScenarioRunnerTests` = 1 suite / 26 cases / failed 0; full internal suite = 99 suites / 1056 cases / failed 0.
- `index.html` now reports scenario runner version `8.0-AJ`.
- This is a planning tool only. It does not execute the planned shards or close `full_8_2_cartesian_execution` / `full_v8_completion`.

# v8.0-AI full Cartesian shard coverage ledger note

- AI adds `tools/render_audit/build_v8_full_cartesian_ledger.cjs`.
- The ledger recursively reads shard manifests and batch summaries, validates their hashes/schemas/non-claim flags, and merges coverage only from `executedEndExclusive`.
- This prevents a limited pilot such as `--max-cases=8` from being read as coverage through the planned `endExclusive` boundary.
- The ledger reports `gapCount`, `overlapCount`, `dirtySourceManifestCount`, `truncatedManifestCount`, `contiguousCoveredFromZero`, `uniqueExecutedCaseCount`, and `closureBlockers`.
- `run_v8_full_cartesian_batch.cjs` now writes an ignored `coverage_ledger.json` checkpoint for each batch folder after shard analyzer validation.
- At AI, `index.html` reported scenario runner version `8.0-AI`; AJ is now the current reported version.
- Verification on 2026-06-03: `runV8ScenarioRunnerTests` = 1 suite / 26 cases / failed 0; `run_v8_full_cartesian_batch.cjs --shards=0,144 --shard-size=8 --max-cases=8 --label=ai_ledger_pilot` = 2 shards / decoded 16 / calculated 8 / constraint-only 8 / ledger unique 16 / gap 2 / dirty-source manifests 2 / fullCoverageCandidate false; post-commit clean-source rerun `--label=ai_clean_ledger_pilot` = ledger dirty-source manifests 0 / unique 16 / gap 2 / fullCoverageCandidate false; truncation probe with `--shard-size=100000 --max-cases=8` = ledger unique 8 / truncated manifests 1 / first gap starts at 8; contiguous probe with `--shards=0,1 --shard-size=8` = ledger unique 16 / overlap 0 / first gap starts at 16; full internal suite = 99 suites / 1056 cases / failed 0.
- This is a checkpoint/gap-tracking tool only. It does not execute all `80,621,568,000` rows or close `full_8_2_cartesian_execution` / `full_v8_completion`.

# v8.0-AH profile-owned visual QA evidence realignment note

- AH re-audit found that the AA/AB runtime and render-audit fixture still started the mixed candidate-v2 case from `routinePlan=ppl_ul` / `routine=PUSH`, relying on normalization to reach `profileSession=mixed_strength_cardio`.
- That was the same class of shortcut the AG profile/session correction was meant to prevent: the evidence named the right derived session but did not prove the user-owned `exerciseProfile + routinePlan + routine` input.
- The candidate-v2 runtime QA and render-audit payload now use `exerciseProfile=mixed`, `routinePlan=mixed_balanced`, and `routine=mixed_strength_cardio` directly.
- `analyze_render_audit.cjs` now requires all 8 post-wiring candidate-v2 captures to report `routinePlan=mixed_balanced` and `routine=mixed_strength_cardio`, in addition to `exerciseProfile=mixed`, `profileSession=mixed_strength_cardio`, `selectedMacroBasis=profile_candidate_v2`, `productionTargetCalApplied=true`, and `recentGateStatus=applied`.
- At AH, `index.html` reported scenario runner version `8.0-AH`; AI is now the current reported version.
- Verification on 2026-06-03: `runV8ScenarioRunnerTests` = 1 suite / 26 cases / failed 0; render audit capture/analyzer = 55 captures / 8 post-wiring candidate-v2 captures / failed 0; full internal suite = 99 suites / 1056 cases / failed 0.
- This is a visual/runtime evidence realignment only. It does not close `full_8_2_cartesian_execution` or `full_v8_completion`.

# v8.0-AG profile routine ownership realignment note

- `profileSession` is no longer treated as a separate user-facing session shortcut. It is a derived snapshot/draft/report field from the actual `exerciseProfile + routinePlan + routine` selection.
- Pre-V8 behavior is the baseline: with advanced training off, bodybuilding/general training shows user-facing `휴식 / 운동` while the internal values are `REST / PUSH`; the exercise day intensity is auto `0.70 + weeklyTrainingDays` adjustment. With advanced training on, the original bodybuilding `PPL-UL / 2분할 / 3분할 / 4분할 / 5분할` routine plans remain selectable.
- Non-bodybuilding profiles now use profile-owned routine plans and sessions instead of mapping through bodybuilding fallbacks: running uses `running_base` / `running_speed` sessions with cardio defaults and zero weight duration by default, strength uses strength plans/sessions, powerbuilding uses powerbuilding plans/sessions, and mixed uses mixed plans/sessions.
- AG follow-up re-audit also corrected the V8 scenario runner itself. Running, strength, powerbuilding, and mixed human-review/targeted cases now calculate through their profile-owned routine/session values (`running_tempo`, `strength_heavy_lower`, `powerbuilding_lower`, `mixed_strength_cardio`) instead of `UPPER` / `LOWER` / `LEGS` / `PUSH` bodybuilding fallbacks.
- Current AG runner direct check: `profileSessionCarbPolicy.summary.productionFallbackCount=0`; `running_focused.input.todayRoutine=running_tempo`; `low_reliability_user.input.todayRoutine=mixed_strength_cardio`; `targeted_mixed_carb_unresolved.candidate.targetDeltaKcal≈128.996`; `low_reliability_user.candidate.targetDeltaKcal≈130.646`; both mixed cases reach `carbsGPerKgBodyweight=6`.
- Historical pre-AG target-delta numbers such as `25.029`, `29.446`, `43.729`, and `51.446` remain historical evidence from the old fallback-shaped runner/runtime probes. Do not use them as the current AG profile-owned scenario expectation without re-running the current runner.
- The old v8.0-P sentence that profile/session preservation should keep production `targetCal` unchanged was an incorrect contract interpretation. Routine/session, intensity, weight duration, and cardio defaults are production workout inputs, so profile-owned sessions can change `targetCal` through the existing workout calculation path.
- At AG, `index.html` reported scenario runner version `8.0-AG`; AH is now the current reported version.
- Verification on 2026-06-03: `runTodayQuickEditTests` = 1 suite / 27 cases / failed 0; `runV8ScenarioRunnerTests` = 1 suite / 26 cases / failed 0; full internal suite = 99 suites / 1056 cases / failed 0; render audit capture/analyzer = 55 captures / failed 0. Spot-checks included Settings groups open and Today quick-open profile candidate screens on desktop/mobile.

# v8.0-AF shard batch orchestration pilot note

- At AF, `index.html` reported scenario runner version `8.0-AF`; AG is now the current reported version.
- New batch runner: `tools/render_audit/run_v8_full_cartesian_batch.cjs`.
- Batch runner supports `--shards=0,144` and contiguous `--start-shard` / `--shard-count` modes, runs shard manifests through `run_v8_full_cartesian_shard.cjs`, then invokes `analyze_v8_full_cartesian_shards.cjs` for the batch folder.
- AF pilot on 2026-06-03: `--shards=0,144 --shard-size=8 --max-cases=8 --label=af_pilot` produced batch schema `v8_full_cartesian_batch_manifest_v1`, 2 shard runs, analyzer failed 0, decoded 16, calculated 8, constraint-only 8, truncated 0.
- Direct analyzer re-check on the batch folder also reported 2 manifests / failed 0.
- Verification on 2026-06-03: `runV8ScenarioRunnerTests` = 1 suite / 26 cases / failed 0; full internal suite = 99 suites / 1054 cases / failed 0.
- This is batch orchestration for bounded evidence only. It still does not execute all `80,621,568,000` rows or close `full_8_2_cartesian_execution` / `full_v8_completion`.

# v8.0-AE shard manifest integrity and analyzer note

- `runV8FullCartesianShard()` now emits report schema `v8_full_cartesian_shard_report_v1`, including decoded accounting and `calculationIssueCount`.
- `tools/render_audit/run_v8_full_cartesian_shard.cjs` now wraps each shard report in manifest schema `v8_full_cartesian_shard_manifest_v1` with `reportSha256`, `manifestSha256`, git/source hashes, command args, and shard summary fields.
- The CLI also supports `--shard-index` / `--shard-size` so future shard batches do not need hand-computed start/end ranges.
- New analyzer: `tools/render_audit/analyze_v8_full_cartesian_shards.cjs` validates manifest schema, report schema, hashes, source hash presence, decoded/calculated/constraint accounting, and the non-claim flags.
- AE evidence on 2026-06-03: shard analyzer over 2 manifests reported `failedCount=0`, decoded 11, calculated 8, constraint-only 3, truncated 0.
- Verification on 2026-06-03: `runV8ScenarioRunnerTests` = 1 suite / 26 cases / failed 0; full internal suite = 99 suites / 1054 cases / failed 0.
- This still does not execute all `80,621,568,000` rows and does not close `full_8_2_cartesian_execution` or `full_v8_completion`.

# v8.0-AD deterministic full Cartesian shard pilot note

- `index.html` now exports `runV8FullCartesianShard()` at stage `8-2_full_cartesian_shard_execution_v0`.
- `tools/render_audit/run_v8_full_cartesian_shard.cjs` runs bounded shard ranges in a browser and writes ignored JSON evidence under `tools/render_audit/v8_full_cartesian_shards/`.
- Pilot evidence on 2026-06-03: `--start=0 --limit=8 --max-cases=8` decoded 8 rows, calculated 8 rows, constraint-only 0; `--start=1152 --limit=3 --max-cases=3` decoded 3 rows, calculated 0 rows, constraint-only 3.
- Constraint-only rows are not calculated as plausible sessions; the pilot at index 1152 reports `training_session_without_weight_duration`, `weekly_zero_with_training_session`, and `no_performance_with_training_session`.
- This is a bounded shard executor/pilot only. It does not execute all `80,621,568,000` rows and does not close `full_8_2_cartesian_execution` or `full_v8_completion`.
- Verification on 2026-06-03: `runV8ScenarioRunnerTests` = 1 suite / 26 cases / failed 0; full internal suite = 99 suites / 1054 cases / failed 0.

# v8.0-AC full Cartesian execution contract note

- v8.0-AC introduced `fullCartesianExecutionContract` at `8-2_full_cartesian_execution_contract_v0`; the current runner version may be later.
- The contract recomputes the 20 required-axis product as `80,621,568,000`, exposes deterministic axis strides, and decodes pilot indexes `0`, `1`, middle, `80,621,567,998`, and `80,621,567,999`.
- The default shard contract is `100,000` rows per shard, so the planned full run is `806,216` shards and the final shard contains `68,000` rows.
- This is an execution/audit contract only. It does not execute the full Cartesian set, does not replace pairwise/targeted stress or the 18 human-review cases, and does not add new exercise-physiology evidence.
- Remaining open scopes are still `full_8_2_cartesian_execution` and `full_v8_completion`.
- Verification on 2026-06-03: `runV8ScenarioRunnerTests` = 1 suite / 25 cases / failed 0; full internal suite = 99 suites / 1053 cases / failed 0.

# v8.0-AB post-wiring production visual QA note

- `tools/render_audit/capture_render_audit.cjs` now includes the actual AA-wired candidate-v2 production case as a separate `profileCandidateV2` payload instead of relying on the old rich bodybuilding fixture.
- The post-wiring visual set covers Today applied, Today quick-open, Records detail, and Records basis-open surfaces on desktop/mobile. The basis-open capture verifies that the user can see the saved profile/session target correction context, not just the collapsed record shell.
- `tools/render_audit/analyze_render_audit.cjs` now requires 55 captures = 37 desktop + 18 mobile and checks 8 post-wiring profile-candidate captures for runtime evidence: `exerciseProfile=mixed`, `profileSession=mixed_strength_cardio`, `routinePlan=mixed_balanced`, `routine=mixed_strength_cardio`, `selectedMacroBasis=profile_candidate_v2`, `productionTargetCalApplied=true`, `recentGateStatus=applied`.
- `runV8ScenarioRunner()` now reports version `8.0-AB`; its approval decision marks `productionVisualQaCompleted=true` and removes `post_wiring_production_visual_qa` from `notApprovedYet` while keeping full Cartesian/full V8 open.
- Latest render audit on 2026-06-03: `captureCount=55`, `postWiringProfileCandidateCaptureCount=8`, `postWiringProfileCandidateAppliedCaptureCount=8`, `failedCount=0`, `minUniqueSampleColorCount=547`, `minLuminanceStdDev=22.743`.
- Spot-checked screenshots: `52_mobile_today_profile_candidate_v2_applied.png`, `54_mobile_records_profile_candidate_v2_detail.png`, `55_desktop_records_profile_candidate_v2_basis_open.png`, and `56_mobile_records_profile_candidate_v2_basis_open.png`.
- Internal regression on 2026-06-03: `runV8ScenarioRunnerTests` = 1 suite / 24 cases / failed 0; full internal suite = 99 suites / 1052 cases / failed 0.
- This closes `post_wiring_production_visual_qa` only. It does not claim `full_8_2_cartesian_execution`, `full_v8_completion`, or any new external exercise-physiology evidence.

# v8.0-AA production candidate-v2 target wiring note

- `calculate()` now applies the approved `candidate-v8-profile-macro-v2-linked-target-v0` target/macro output to production for active runtime profile target-delta cases.
- Direct extraction on 2026-06-03: mixed high-load runtime QA reports `productionTargetCal=3312.9411753385825`, `proposedCandidateTargetCal=3312.9411753385825`, `targetDeltaKcal=29.446064227471197`, `targetDeltaApplied=true`, `productionTargetCalApplied=true`, `recentGateStatus=applied`, and `coachHasProfileTargetDeltaAppliedDecision=true`.
- The historical scenario/audit baseline is kept separate: `runV8ScenarioRunner()` calls the scenario baseline with `profileCandidateV2ProductionWiring=false`, so v8.0-D~X report-only candidate comparisons are not reinterpreted through the AA production result.
- During AA verification, a sandbox restore leak was found: V8 runtime QA could leave `exerciseProfile/profileSession` DOM values as `mixed / mixed_strength_cardio` for later suites. `withRecordTestSandbox()` and `withCalibrationReportSandbox()` now restore those inputs explicitly.
- This is production target application for active runtime target-delta cases only. It does not claim post-wiring production visual QA, full 8-2 Cartesian execution, or full V8 completion, and it does not introduce new external exercise-physiology evidence beyond the already documented candidate-v2 evidence boundary.
- Still-open scopes are `post_wiring_production_visual_qa`, `full_8_2_cartesian_execution`, and `full_v8_completion`.
- Scenario runner verification on 2026-06-03: `runV8ScenarioRunnerTests` = 1 suite / 24 cases / failed 0.
- Calibration verification on 2026-06-03: 14 suites / 132 cases / failed 0.
- Full internal verification on 2026-06-03: 99 suites / 1052 cases / failed 0.

# v8.0-Z profile formula approval decision note

- `runV8ScenarioRunner()` now includes `profileFormulaApprovalDecision` at `9-11_profile_formula_approval_decision_v0`.
- Candidate-v2 is approved only for the next production wiring step: `candidateFormulaApproved=true`, `approvedCandidateModel=candidate-v8-profile-macro-v2-linked-target-v0`, `productionWiringAllowed=true`.
- This is not production application and not full V8 completion. Direct extraction on 2026-06-03: `productionFormulaChanged=false`, `productionTargetCalApplied=false`, `productionVisualQaCompleted=false`, `fullV8Complete=false`.
- Still-open scopes are `production_targetCal_application`, `post_wiring_production_visual_qa`, `full_8_2_cartesian_execution`, and `full_v8_completion`.
- Scenario runner verification on 2026-06-03: `runV8ScenarioRunnerTests` = 1 suite / 24 cases / failed 0.
- Calibration verification on 2026-06-03: 14 suites / 132 cases / failed 0.
- Full internal verification on 2026-06-03: 99 suites / 1052 cases / failed 0.

# v8.0-Y profile formula approval preflight note

- `runV8ScenarioRunner()` now includes `profileFormulaApprovalPreflight` at `9-10_profile_formula_approval_preflight_v0`.
- This is a report-only approval preflight. It does not approve `candidate-v8-profile-macro-v2-linked-target-v0`, does not change production formulas, does not apply production `targetCal`, and does not close post-wiring visual QA.
- Direct extraction on 2026-06-03: `checkCount=5`, `readyCheckCount=5`, `blockedCount=0`, `approvalPreflightReady=true`, `readyForExplicitFormulaApprovalDecision=true`.
- Boundary values remain explicit: `candidateFormulaApproved=false`, `productionFormulaChanged=false`, `productionWiringAllowed=false`, `productionTargetCalApplied=false`, `productionVisualQaCompleted=false`.
- The five ready checks are `candidate_v2_code_contracts_closed`, `human_review_numerical_gate_18_of_18`, `runtime_user_surfaces_review_only_ready`, `report_only_boundary_preserved`, and `candidate_target_delta_not_applied`.
- Scenario runner verification on 2026-06-03: `runV8ScenarioRunnerTests` = 1 suite / 23 cases / failed 0.
- Calibration verification on 2026-06-03: 14 suites / 131 cases / failed 0.
- Full internal verification on 2026-06-03: 99 suites / 1051 cases / failed 0.

# v8.0-X candidate-v2 fat floor linked-target consistency note

- `candidate-v8-profile-macro-v2-linked-target-v0` remains report-only, but its linked-target feasibility check now evaluates the fat guard against the increased candidate target, not the pre-delta base target.
- Direct extraction on 2026-06-03: `profileMacroCandidateV2Comparison.summary.fatFloorRaisedForTargetDeltaCount=4`, `fatGuardConflictCount=0`, `fatGuardResolvedCount=5`.
- The previous W blocker `low_reliability_user` now has `targetDeltaKcal=51.44606338171707`, `targetRateDeltaEquivalentKgPerWeek=0.046769148528833696`, `carbsGPerKgBodyweight=6`, `fatGPerKgBodyweight=0.6274509778949856`, and `fatPercentKcal≈15`.
- `humanReviewNumericalApproval` now reports `numericApprovedCount=18`, `blockedCount=0`, `productionFormulaApprovalReady=true`, while `candidateFormulaApproved=false` and `productionFormulaChanged=false`.
- Runtime user-facing QA remains review-only: production `targetCal=3283.4951111111113`, proposed candidate target `3312.9411753385825`, `targetDeltaKcal=29.446064227471197`, `targetDeltaApplied=false`, `canApplyAutomatically=false`.
- Scenario runner verification on 2026-06-03: `runV8ScenarioRunnerTests` = 1 suite / 22 cases / failed 0.
- Calibration verification on 2026-06-03: 14 suites / 130 cases / failed 0.
- Full internal verification on 2026-06-03: 99 suites / 1050 cases / failed 0.

# v8.0-W human-review numerical approval gate note

- `runV8ScenarioRunner()` now includes `humanReviewNumericalApproval` at `8-3_human_review_numerical_approval_v0`.
- This is a report-only numerical gate for the 18 human-review candidate-v2 cases. It is not owner signoff, not formula approval, and not production `targetCal` application.
- Direct gate result on 2026-06-03: `humanReviewCaseCount=18`, `numericApprovedCount=17`, `blockedCount=1`, `productionFormulaApprovalReady=false`.
- The blocked case is `low_reliability_user`. The target-rate high finding is resolved for this numerical gate by the already-closed target-rate/recentContext/score/Coach/user-facing QA contracts, but `fat_percent_below_contest_prep_reference_floor` remains an unresolved external-reference blocker.
- Superseding note: v8.0-X resolves this W blocker inside report-only candidate-v2 by rechecking the fat reference against the increased linked target.
- Required regression `required_user_rest_diet_1913` is numerically approved for owner formula review only; it is not production approval.
- Scenario runner verification on 2026-06-03: `runV8ScenarioRunnerTests` = 1 suite / 22 cases / failed 0.
- Calibration verification on 2026-06-03: 14 suites / 130 cases / failed 0.
- Full internal verification on 2026-06-03: 99 suites / 1050 cases / failed 0.

# v8.0-V mobile screenshot audit analyzer note

- `tools/render_audit/analyze_render_audit.cjs` now verifies the ignored screenshot manifest and PNGs generated by `capture_render_audit.cjs`.
- Latest run on 2026-06-03 KST: `capture_render_audit.cjs` generated 47 captures = 33 desktop + 14 mobile.
- Latest analyzer output: `failedCount=0`, `minMobileImageHeight=1601`, `maxMobileImageHeight=4909`, `minUniqueSampleColorCount=547`, `minLuminanceStdDev=24.244`.
- Manual spot-checks were performed for `34_mobile_today_rich.png`, `36_mobile_records.png`, and `40_mobile_settings.png`; the inspected mobile surfaces were nonblank and the primary cards/buttons fit within the mobile width.
- Full internal verification after the analyzer update on 2026-06-03: 99 suites / 1049 cases / failed 0.
- This closes the first-pass mobile/desktop screenshot audit evidence gate only. It does not approve candidate-v2, does not apply production `targetCal`, and does not replace production visual QA after formula wiring.

# v8.0-U candidate-v2 runtime user-facing QA note

- `runV8ScenarioRunner()` now includes `profileFormulaUserFacingQa` at `9-9_profile_formula_user_facing_qa_v0`.
- This is runtime user-facing QA only. It does not approve `candidate-v8-profile-macro-v2-linked-target-v0`, does not change production formulas, and does not apply candidate-v2 target deltas to production `targetCal`.
- Direct extraction on 2026-06-03: runtime mixed high-load QA keeps production `targetCal=3283.4951111111113`, proposed candidate target `3308.524266666667`, `targetDeltaKcal=25.029155555555462`, weekly-rate equivalent `0.022753777777777692kg/week`.
- Direct extraction on 2026-06-03: `coachHasProfileTargetDeltaDecision=true`, `recordDetailHasProfileTargetDelta=true`, `recordDetailHasProfileTargetRateDelta=true`, `surfaceForbiddenTermCount=0`, `targetDeltaApplied=false`, `canApplyAutomatically=false`.
- Scenario runner verification on 2026-06-03: `runV8ScenarioRunnerTests` = 1 suite / 21 cases / failed 0.
- Calibration verification on 2026-06-03: 14 suites / 129 cases / failed 0.
- Full internal verification on 2026-06-03: 99 suites / 1049 cases / failed 0.

# v8.0-T candidate-v2 runtime target-delta proposal wiring note

- `index.html` now builds `profileMacroCandidateV2RuntimeProposal` from the actual `calculate()` Today profile/session path.
- The runtime proposal writes candidate-v2 metadata into `targetRateContext`: `profileMacroCandidateModel`, `profileMacroCandidateStage`, `profileTargetDeltaKcal`, and `profileTargetRateDeltaEquivalentKgPerWeek`.
- Mixed high-load runtime probe: production `targetCal=3283.4951111111113`, proposed candidate target `3308.524266666667`, `targetDeltaKcal=25.029155555555462`, weekly-rate equivalent `0.022753777777777692kg/week`.
- This is metadata wiring only. `profileCandidateDeltaContract.appliedToTarget=false`, production `targetCal` remains unchanged, `candidateFormulaApproved=false`, and `recentContext.profileCandidateV2TargetDeltaGate.canApplyAutomatically=false`.
- Scenario runner verification on 2026-06-03: `runV8ScenarioRunnerTests` = 1 suite / 20 cases / failed 0.
- Calibration verification on 2026-06-03: 14 suites / 128 cases / failed 0.
- Full internal verification on 2026-06-03: 99 suites / 1048 cases / failed 0.

# v8.0-S protein guard candidate-v2 resolution contract note

- `index.html` now separates the candidate-v2 protein guard issue into external evidence guard vs internal legacy guide-floor conflict.
- For non-contest mixed/running candidate-v2 cases, protein at `2.0g/kg BW` is classified inside the ISSN general exercising-individual range, so legacy `2.2g/kg BW` diet-floor conflicts are recorded as resolved policy cases rather than unresolved production blockers.
- Contest-prep-like cases still use the Helms/Aragon/Fitschen lean-body-mass protein context, and low-protein or fat-floor failures would still remain blockers.
- Direct extraction on 2026-06-03: `profileMacroCandidateV2Comparison`: `proteinGuardConflictCount=0`, `proteinGuardResolvedCount=4`, `proteinLegacyGuideConflictCount=4`, `fatGuardConflictCount=0`.
- Direct extraction on 2026-06-03: `profileMacroCandidateV2Contract`: `contractCount=14`, `presentCount=14`, `missingContractCount=0`, `productionBlockerCount=0`, `resolvedProteinGuardPolicyCount=4`, `productionReady=true`.
- This means the production contract review is ready for an explicit approval step. It still does not apply candidate-v2 target deltas to production `targetCal` and does not approve `candidate-v8-profile-macro-v2-linked-target-v0` as the final formula.

# v8.0-R score Coach candidate-v2 contract note

- `index.html` now adds explicit candidate-v2 score and Daily Coach policy contracts under `profileCandidateV2`.
- The score profile intentionally reuses an explicit diet-equivalent product policy. This is internal product policy, not new external sports-nutrition evidence, and it does not approve the candidate-v2 formula.
- Daily Coach now carries candidate-v2 target-delta review and guard-conflict review signals. Guard conflict is prioritized before target-delta review, and the user-facing copy does not expose the internal candidate model name.
- This closes the score/Coach missing-contract layer only. It does not apply candidate-v2 target deltas to production `targetCal`, does not approve `candidate-v8-profile-macro-v2-linked-target-v0`, and leaves protein/fat guard behavior unresolved.
- Direct extraction on 2026-06-03: `contractCount=14`, `presentCount=14`, `missingContractCount=0`, `productionBlockerCount=1`, `targetRateContractMissingCount=0`, `scoreCoachContractMissingCount=0`, `recentContextContractMissingCount=0`, `productionReady=false`.
- Remaining production blocker: `profileMacroCandidateV2Comparison.proteinGuardConflict`. The required next action is to resolve or explicitly justify protein/fat guard behavior before approving any profile-specific macro formula.
- Direct probe check: `policyKey=profileCandidateV2`, `scoreProfileUsesDietProductPolicy=true`, `coachThresholdUsesDietMacroThresholds=true`, first Coach decision is `profile_guard_conflict`, and user-facing output does not mention internal candidate names.

# v8.0-Q target-rate recentContext candidate-delta contract note

- `index.html` now preserves candidate-v2 target/rate delta metadata through `buildGoalTargetRateContext()` and exposes a `profileCandidateDeltaContract`.
- `recentContext` now includes `profileCandidateV2TargetDeltaGate` with eligible, blocked, and inactive outcomes. The gate uses recent28 as the review window and blocks low goal-snapshot coverage or recent goal changes.
- This closes the target-rate metadata and recentContext gate contracts only. It does not apply candidate-v2 target deltas to production `targetCal`, does not approve `candidate-v8-profile-macro-v2-linked-target-v0`, and does not change score or Daily Coach behavior.
- Direct extraction on 2026-06-03: `contractCount=14`, `presentCount=11`, `missingContractCount=3`, `productionBlockerCount=4`, `targetRateContractMissingCount=0`, `recentContextContractMissingCount=0`, `productionReady=false`.
- Remaining missing production contracts are macro score profile, Daily Coach threshold, and Daily Coach decision/copy. The extra production blocker is still `profileMacroCandidateV2Comparison.proteinGuardConflict`.
- Direct probe check: candidate target/rate deltas are returned as metadata, `appliedToTarget=false`, `targetCalUnchangedByProfileCandidateDelta=true`, and recentContext `eligibleCanApplyAutomatically=false`.

# v8.0-P profile/session snapshot contract note, AG-corrected

- `index.html` now exposes Settings/Today `exerciseProfile` and derives `profileSession` from the actual routine/session selection for Today draft, calculation state, Records `goalSnapshot`, snapshot signature, and full backup.
- This closes the input/snapshot/backup data contract only. It does not approve `candidate-v8-profile-macro-v2-linked-target-v0` or change production macro formulas.
- Direct extraction on 2026-06-03: `contractCount=14`, `presentCount=9`, `missingContractCount=5`, `productionBlockerCount=6`, `productionReady=false`.
- Remaining missing production contracts are target-rate candidate delta, macro score profile, Daily Coach threshold, Daily Coach decision/copy, and recentContext target-delta gate.
- The extra production blocker beyond missing contracts is still `profileMacroCandidateV2Comparison.proteinGuardConflict`.
- Later AG re-audit corrected the old "unchanged production targetCal" reading: profile-owned routine/session context can change `targetCal` through existing workout inputs, and `profileSession` must remain derived rather than a separate user-facing bypass.

# v8.0-O profileMacroCandidateV2Contract note

- `runV8ScenarioRunner()` now includes `profileMacroCandidateV2Contract`.
- This layer is report-only and does not change production formulas.
- Direct extraction on 2026-06-03: `contractCount=14`, `presentCount=3`, `missingContractCount=11`, `productionBlockerCount=12`, `productionReady=false`.
- Missing production contracts are Settings/Today exerciseProfile input, Settings/Today profileSession derived field, Today draft persistence, target-rate candidate delta, Records snapshot/signature candidate fields, score, Coach thresholds/decisions, recentContext target-delta gate, and backup/import round-trip.
- Present guards are `profileMacroCandidateV2Comparison.reportOnlyGuard` and `targetedStress.constraintOnlyTupleGuard`.
- The extra production blocker beyond missing contracts is `profileMacroCandidateV2Comparison.proteinGuardConflict`, because the guard is present but unresolved.
- Evidence policy: internal code-contract review only; external sports-nutrition references remain threshold background and do not approve app-wide production behavior.

# v8.0-N profileMacroCandidateV2 note

- `runV8ScenarioRunner()` now includes `profileMacroCandidateV2Comparison`.
- This layer is report-only and does not change production formulas.
- Direct extraction on 2026-06-03: candidate-v2 comparison covers 96 cases = axis coverage 73 + human-review 18 + targeted calculated 5.
- `profileCarbFloorAttemptedCount=5`, `profileCarbFloorMetCount=5`, `profileCarbFloorUnresolvedCount=0`, `targetChangedCount=5`, `targetRateContractRequiredCount=5`, `proteinGuardConflictCount=4`.
- For `targeted_mixed_carb_unresolved`, candidate-v2 opens `targetDeltaKcal=43.72915555555528`, `targetRateDeltaEquivalentKgPerWeek=0.03975377777777753`, and reaches `carbsGPerKgBodyweight=6`.
- This is not production approval. At v8.0-N those target/rate deltas still needed recent trend, score, Coach, Records, Settings/Today, and backup/import contracts; v8.0-P closes the input/snapshot/backup part, v8.0-Q closes target-rate metadata plus the recentContext gate, v8.0-R closes candidate-v2 score/Coach contracts, and v8.0-S resolves the protein guard blocker as an evidence/product-policy contract. Formula approval and production `targetCal` wiring still remain separate.

# v8.0-M targetedStress note

- `runV8ScenarioRunner()` now includes `targetedStress`.
- This layer is report-only and does not change production formulas.
- Direct extraction on 2026-06-03: total targeted cases 8 = 5 calculated review cases + 3 constraint-only excluded tuples.
- Focus counts: `derived_ffmi=1`, `inactive_intensity=1`, `mixed_carb_unresolved=2`, `maintain_non_bodybuilding=2`, `excluded_constraint=3`.
- Actual unresolved mixed carb finding count is 1. The maintain mixed case is marked as report-only carb-floor-met, not unresolved.
- It is not the 80,621,568,000 full Cartesian run, not a replacement for the 18 human-review cases, and not candidate formula approval.

이 폴더는 프로젝트의 기준문서 폴더다. 과거 `source` 폴더명은 실제 소스 코드처럼 보였기 때문에 `docs`로 바꿨다. 앱 구현 소스는 루트의 `index.html`이며, 문서는 구현 방향과 판단 기준을 정리하는 역할이다.

## 1. 먼저 읽을 문서

1. `내가-바라는-앱의-성격.txt`
   - 앱의 최상위 성격을 정한다.
   - Today / Records / 최근 흐름 / InBody / Settings가 각각 무엇을 책임지는지 판단할 때 먼저 본다.

2. `개발정책.txt`
   - Codex 작업 방식, 기준 우선순위, commit / QA / 문서 충돌 처리 원칙을 정한다.
   - 구현이 문서와 충돌할 때 무엇을 우선할지 판단하는 운영 기준이다.

3. `v8_운동프로필_산식_정밀설계.txt`
   - v8부터 다룰 운동 프로필, 사용자 유형, 목표별 산식, Today-Records 기준갱신 감사, 시나리오 검증의 초정밀 인계서다.
   - v7.x UI 안정화 이후 다른 Codex가 처음 투입되어도 이 문서만 읽고 같은 의도로 산식/프로필 감사를 시작할 수 있어야 한다.
   - 산식 근거를 볼 때는 이 문서의 `0-4. 근거 등급 원칙`을 따른다. 내부 코드 근거나 제품 정책 근거를 외부 운동생리학 근거처럼 통과시키면 안 된다.
   - v8.0-J 이후 maintain은 production goal 1차 계약이 닫힌 상태지만, profile-specific macro formula와 전체 v8 완료로 읽으면 안 된다.
   - v8.0-K 이후 profile macro candidate-v1은 report-only feasibility audit이며, mixed 탄수 floor unresolved를 production 승인으로 덮으면 안 된다.
   - v8.0-L 이후 pairwiseStress는 8-2 full 축의 constrained pairwise 계산 레이어다. 80,621,568,000개 전수 실행이나 18개 human-review 수치 승인이 아니다.

4. `v8_현재산식_기준갱신_감사_2026-06-02.txt`
   - v8 1단계 현재 산식 / Today-Records 기준갱신 감사 완료 리포트다.
   - 다음 Codex는 v8 산식 작업 전에 이 문서와 현재 `index.html`의 차이 여부를 먼저 확인하고, 중복 감사 대신 다음 단계 판단에 사용한다.
   - v8.0-I의 maintain missing-contract 감사는 v8.0-J 섹션으로 갱신되었으므로, 히스토리와 현재 상태를 섞어 읽지 않는다.
   - v8.0-H의 resistance carbohydrate reference 저자 표기는 v8.0-K에서 Escobar / VanDusseldorp / Kerksick 2016으로 정정되었다.

5. `앱-문구-기준.txt`
   - 화면 문구, Coach 문구, 최근 흐름 문구, InBody 문구의 표현 기준이다.
   - 문구가 길어지거나 사용자에게 “그래서 뭘 하라는 건지” 흐려질 때 반드시 확인한다.

6. `캔버스_updated.txt`
   - v6.x부터 v7.x까지의 큰 개발 판단이 누적된 통합 캔버스다.
   - 최신 단일 설계서라기보다 히스토리와 의사결정 맥락을 보관하는 문서로 본다.

## 2. 보조 문서

- `# 2026 ACSM 근력운동 가이드 한국어 해설판.txt`
  - v8 운동 프로필과 세션 설계를 할 때 참고한다.
  - 앱의 산식 자체를 직접 결정하는 문서는 아니며, 근력운동 기준을 검토할 때 보조 근거로 쓴다.

- `코덱스-인텔리전스.txt`
  - Codex 작업 난이도별 추론 강도 선택 기준이다.

## 3. archive

`archive` 폴더는 현재 기준문서가 아니라 과거 작업 산출물 보관 위치다.

- `20260525_스티치_UI_기능_이식_누락_보고서.txt`
  - 과거 Stitch 독립 HTML 프로토타입 기준의 기능 이식 누락 보고서다.
  - 현재 `index.html` 기준 구현 문서가 아니므로 새 작업 기준으로 직접 쓰지 않는다.

## 4. 문서 충돌 처리

문서끼리 충돌하면 아래 순서로 판단한다.

1. 사용자가 만들고 싶은 앱의 성격
2. 최신 대화에서 확정된 의도
3. `개발정책.txt`
4. `v8_운동프로필_산식_정밀설계.txt` 또는 해당 작업의 최신 기준문서
5. `v8_현재산식_기준갱신_감사_2026-06-02.txt`처럼 현재 구현을 직접 대조한 최신 감사 리포트
6. `앱-문구-기준.txt`
7. `캔버스_updated.txt`의 과거 맥락
8. 현재 `index.html` 구현

구현이 더 좋아 보여도 제품 성격과 충돌하면 구현을 합리화하지 않는다. 반대로 기준문서가 낡았고 현재 앱 구조가 더 타당하면, 문서를 먼저 갱신하고 그 이유를 남긴다.
