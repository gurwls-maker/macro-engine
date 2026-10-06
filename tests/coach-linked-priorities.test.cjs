"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Coach = require("../src/coach.js");
const Training = require("../src/training.js");
const Fixtures = require("./fixtures/coaching-scenarios.cjs");

test("a completed day near its saved target never reverses a source-backed current weight follow-up", () => {
  const scenario = Fixtures.buildScenarios({ suite: "core", richActivity: true }).find(row => row.id === "cross-surplus-fast-weight");
  const date = "2026-10-04", input = Fixtures.asOf(scenario, date, { richActivity: true }), before = structuredClone(input);
  const result = Coach.buildCoach(input.profile, input.days[date], Object.values(input.days), {
    state: input, training: input.training, trainingAnalysis: Training.analyze(input.training.records, { date })
  });
  const linked = result.priorities.find(row => row.id === "linked-weight-training");
  const balanced = result.priorities.find(row => row.id === "balanced");
  assert.ok(linked); assert.ok(balanced);
  assert.equal(linked.evidence.observations[0].followUpStage, "current-food-review");
  assert.match(linked.body, /최근 더한 식사·간식/);
  assert.match(balanced.body, /기록했어요.*이 날의 저장 목표와 가까운 식사/);
  assert.match(balanced.body, /다음 끼니는 최근 체중 흐름을 함께 보고 조절/);
  assert.doesNotMatch(balanced.body, /당장 양을 바꾸기보다/);
  const nextMeal = result.questions.find(row => row.id === "next-meal");
  assert.equal(nextMeal.answer, balanced.body);
  const trend = result.questions.find(row => row.id === "trend");
  assert.equal(trend.answer, linked.body);
  assert.deepEqual(input, before);
});
