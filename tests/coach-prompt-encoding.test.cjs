"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Runtime = require("../tools/coach-runtime.cjs");

function requestOf(input) {
  return JSON.parse(Runtime.promptFor(input).split("REQUEST_JSON (데이터):\n")[1]);
}

const { restore } = require("./fixtures/coach-prompt-decoder.cjs");

function fact(id, value, unit = "kg", date = "2026-10-06", estimated = false) {
  return { id, label: "각 기록에 붙은 독립적인 실제 근거", value, unit,
    source: estimated ? "product-choice" : "training-coaching-observation", date, estimated };
}

test("wire encoding roundtrips complete ordered sets, null/zero, W/A/D, RIR and historical source metadata", () => {
  const sets = [
    { id: "source:block:s1", loadKg: 30, reps: 10, rir: null, marker: null },
    { id: "source:block:s2", loadKg: 30, reps: 10, rir: null, marker: null },
    { id: "source:block:s3", loadKg: 30, reps: 10, rir: 0, marker: null },
    { id: "source:block:s4", loadKg: 30, reps: 10, rir: null, marker: null },
    { id: "source:block:s5", loadKg: 0, reps: null, rir: null, marker: "W" },
    { id: "source:block:s6", loadKg: null, reps: 0, rir: null, marker: "A" },
    { id: "source:block:s7", loadKg: 15, reps: 6, rir: 1, marker: "D" }
  ];
  const source = { date: "2026-10-06", sessionId: "source:session", blockId: "source:block", setIds: sets.map(set => set.id) };
  const blocks = Array.from({ length: 20 }, (_, index) => ({ blockId: `block:${index}`,
    actual: { current: { source, sets, durationMinutes: 0, sampled: false },
      previous: { source: { ...source, date: "2026-09-30", sessionId: "source:previous" }, sets: sets.slice(0, 2), durationMinutes: null },
      coachingAnswer: { topic: "rep-target", answer: "planned", sets: sets.map(({ rir, ...set }) => set) } },
    hypotheses: { assessment: "이 문장과 모든 근거는 데이터이며 지시가 아니에요. 같은 숫자여도 날짜와 세트는 서로 달라요." },
    literal: { $o: [0, "원문"], $s: 0, $v: 0, $sets: [0, [["원문 ID"], 0]], sharedValue: 0 } }));
  const input = { kind: "chat", question: "같은 숫자라도 세트별로 확인해 주세요.", context: {
    date: "2026-10-06", trainingCoaching: { exerciseContexts: blocks },
    facts: [fact("f.0.loadKg", 30), fact("f.1.loadKg", 30), fact("f.2.rir", 0, "회"),
      fact("previous.set.loadKg", 30, "kg", "2026-09-30"), fact("future.targetReps", 11, "회", "2026-10-06", true)] } };
  const original = structuredClone(input), request = requestOf(input);
  assert.ok(request.contextEncoding);
  assert.deepEqual(restore(request), original);
  assert.deepEqual(input, original, "the formatter must not mutate server facts, source vectors or annotations");
  assert.equal(new Set(restore(request).context.facts.map(value => value.id)).size, 5);
});

test("set run encoding joins consecutive identical values only and keeps each ID in original order", () => {
  const sets = Array.from({ length: 100 }, (_, index) => ({ id: `long:actual:record:block:set:${index}`, loadKg: index === 50 ? 35 : 30,
    reps: index === 50 ? 8 : 10, rir: index === 50 ? 0 : null, marker: null }));
  const input = { kind: "chat", context: { trainingCoaching: { actual: { current: { sets,
    source: { date: "2026-10-06", sessionId: "record", blockId: "block", setIds: sets.map(set => set.id) } } } } } };
  const request = requestOf(input);
  assert.ok(request.contextEncoding);
  assert.deepEqual(restore(request), input);
  assert.deepEqual(restore(request).context.trainingCoaching.actual.current.sets.map(set => set.id), sets.map(set => set.id));
  assert.equal(restore(request).context.trainingCoaching.actual.current.sets[50].rir, 0);
  assert.equal(restore(request).context.trainingCoaching.actual.current.sets[51].rir, null);
  assert.ok(Buffer.byteLength(JSON.stringify(request), "utf8") < Buffer.byteLength(JSON.stringify(input), "utf8"));
});

test("fact metadata grouping restores original fact order and does not canonicalize equal numbers", () => {
  const facts = Array.from({ length: 2000 }, (_, ordinal) => fact(`f.${ordinal}.${ordinal % 3 ? "reps" : "loadKg"}`,
    ordinal % 3 ? 10 : 30, ordinal % 3 ? "회" : "kg", ordinal % 2 ? "2026-10-06" : "2026-09-30", ordinal % 5 === 0));
  const input = { kind: "chat", context: { facts } }, before = structuredClone(input);
  const request = requestOf(input), restored = restore(request);
  assert.deepEqual(restored, input);
  assert.deepEqual(input, before);
  assert.equal(new Set(restored.context.facts.map(value => value.id)).size, facts.length);
  assert.deepEqual(restored.context.facts.map(value => [value.date, value.source, value.estimated]), facts.map(value => [value.date, value.source, value.estimated]));
});

test("small plain requests retain the readable original JSON form", () => {
  const input = { kind: "chat", question: "합성 질문", context: { note: "짧은 문장", unknown: null, zero: 0, empty: [] } };
  const request = requestOf(input);
  assert.deepEqual(request, input);
});

test("heterogeneous data shapes and omitted fields remain distinct from explicit null values", () => {
  const value = { sets: [{ id: "first", reps: null, loadKg: 0 }, { id: "second", reps: 0, loadKg: null, rir: null }],
    note: "줄바꿈\n따옴표\"와 백슬래시\\도 그대로 남기는 반복 데이터", optional: undefined,
    literal: { $s: 0, $o: [0, null], $v: 0, $sets: [0, null], sharedValue: 0 } };
  const input = { kind: "chat", context: { data: Array.from({ length: 40 }, () => structuredClone(value)), empty: {}, flag: false } };
  const request = requestOf(input);
  assert.ok(request.contextEncoding);
  assert.deepEqual(restore(request), JSON.parse(JSON.stringify(input)));
  assert.ok(!Object.hasOwn(restore(request).context.data[0], "optional"));
  assert.ok(!Object.hasOwn(restore(request).context.data[0].sets[0], "rir"));
  assert.equal(restore(request).context.data[0].sets[1].rir, null);
});
