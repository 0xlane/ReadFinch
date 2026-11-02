import test from "node:test";
import assert from "node:assert/strict";
import { rebaseDraft, sameDraft } from "../src/shared/draft";

test("autosave acknowledgement preserves typing that happened while the write was in flight", () => {
  const base = { name: "original", appearance: { theme: "light", size: 15 } };
  const typed = {
    name: "latest keystroke",
    appearance: { theme: "light", size: 18 },
  };
  const ack = {
    name: "earlier keystroke",
    appearance: { theme: "dark", size: 15 },
  };
  assert.deepEqual(rebaseDraft(typed, base, ack), {
    name: "latest keystroke",
    appearance: { theme: "dark", size: 18 },
  });
});
test("clean arrays follow imported configuration while edited profiles survive unrelated updates", () => {
  const base = { profiles: [{ id: "a", name: "A" }], actions: ["translate"] };
  const incoming = {
    profiles: [{ id: "a", name: "A" }],
    actions: ["dictionary"],
  };
  assert.deepEqual(
    rebaseDraft(
      { ...base, profiles: [{ id: "a", name: "typing" }] },
      base,
      incoming,
    ),
    { profiles: [{ id: "a", name: "typing" }], actions: ["dictionary"] },
  );
});

test("schema field ordering is clean after an autosave, while reordered actions stay dirty", () => {
  const old = { theme: "system", fontSize: 15, language: "en" };
  const saved = { theme: "system", language: "en", fontSize: 15 };
  assert.equal(sameDraft(old, saved), true);
  assert.equal(sameDraft(["first", "second"], ["second", "first"]), false);
  assert.equal(
    rebaseDraft(old, saved, { ...saved, theme: "dark" }).theme,
    "dark",
  );
});
