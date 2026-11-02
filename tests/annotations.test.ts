import test from "node:test";
import assert from "node:assert/strict";
import {
  locateAnnotations,
  annotationSegments,
} from "../src/shared/annotations";

test("nested, out-of-order and repeated literal annotations remain individually reachable", () => {
  const source = "They know that they know better.";
  const ranges = locateAnnotations(source, [
    { text: "know better", role: "predicate" },
    { text: source, role: "main clause" },
    { text: "know", role: "first" },
    { text: "know", role: "second" },
    { text: "know better", role: "complement" },
    { text: "invented span" },
    { text: "", note: 42 },
  ]);
  assert.deepEqual(
    ranges.map((r) => r.start),
    [20, 0, 5, 20, 20],
  );
  const segments = annotationSegments(source, ranges);
  assert.equal(segments.map((p) => p.text).join(""), source);
  assert.equal(segments.find((p) => p.start === 20)?.index, 3);
  assert.equal(segments.find((p) => p.start === 0)?.index, 1);
  assert.deepEqual(locateAnnotations(source, "invalid"), []);
});

test("a completed annotation remains visible while a later JSON string is still streaming", () => {
  const first = { text: 'go "now"', note: 'read } before { and \\"' };
  const valid = JSON.stringify([first, { text: "later", extra: { x: true } }]);
  const source = 'go "now" or later';
  const partial = valid.slice(0, valid.indexOf("later") + 2);
  assert.deepEqual(locateAnnotations(source, partial), [
    { ...first, start: 0, end: 8 },
  ]);
  assert.equal(locateAnnotations(source, valid).length, 2);
  assert.deepEqual(locateAnnotations(source, "[{} broken"), []);
});
test("Read Frog fix, tag and 1-based occurrence target the intended repeated phrase", () => {
  const spans = locateAnnotations("do, do, do", [
    { text: "do", occurrence: 2, fix: "does", type: "grammar", tag: "单复数" },
    { text: "do", occurrence: 4, type: "good" },
  ]);
  assert.equal(spans.length, 1);
  assert.equal(spans[0].start, 4);
  assert.equal(spans[0].replacement, "does");
  assert.equal(spans[0].tier, "error");
  assert.equal(spans[0].tag, "单复数");
});
