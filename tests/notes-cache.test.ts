import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CompletionCache } from "../src/core/completion-cache";
import { LocalNotes } from "../src/core/local-notes";
import { defaultConfig, parseConfig } from "../src/shared/config";
import oldBuiltinPrompts from "../src/shared/action-default-history.json";
import { toolbarWindowLayout } from "../src/core/toolbar-placement";
import type { NoteInput } from "../src/shared/notes";

test("complete answers are reused within TTL, scoped to actual inputs, and regeneration bypasses cache", async (t) => {
  let now = 1000,
    count = 0;
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ choices: [{ message: { content: "result " + ++count } }] }),
  );
  const cache = new CompletionCache(() => now);
  cache.configure({ enabled: true, minutes: 1 });
  const profile = {
    ...defaultConfig().providers[0],
    model: "A",
    requiresKey: false,
  };
  const signal = new AbortController().signal;
  const run = (p = profile, text = "a", refresh = false) =>
    cache.run(
      p,
      [{ role: "user", content: text }],
      undefined,
      signal,
      () => {},
      refresh,
    );
  assert.equal(await run(), "result 1");
  assert.equal(await run(), "result 1");
  assert.equal(await run({ ...profile, model: "B" }), "result 2");
  assert.equal(await run(profile, "b"), "result 3");
  assert.equal(await run({ ...profile, temperature: 0.8 }), "result 4");
  now += 60000;
  assert.equal(await run(), "result 5");
  assert.equal(await run(profile, "a", true), "result 6");
  assert.equal(await run(), "result 6");
  cache.clear();
  assert.equal(await run(), "result 7");
  cache.configure({ enabled: false, minutes: 1 });
  assert.equal(await run(), "result 8");
  assert.equal(await run(), "result 9");
});
test("the service default and explicit reasoning efforts make distinct requests and cache entries", async (t) => {
  const sent: Record<string, unknown>[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, options: RequestInit) => {
      sent.push(JSON.parse(String(options.body)));
      return Response.json({
        choices: [{ message: { content: String(sent.length) } }],
      });
    },
  );
  const cache = new CompletionCache();
  const profile = {
    ...defaultConfig().providers[0],
    model: "reasoner",
    requiresKey: false,
  };
  const run = (reasoningEffort?: "high" | "xhigh") =>
    cache.run(
      { ...profile, reasoningEffort },
      [],
      undefined,
      new AbortController().signal,
      () => {},
    );
  assert.equal(await run(), "1");
  assert.equal(await run("xhigh"), "2");
  assert.equal(await run("high"), "3");
  assert.equal(await run("xhigh"), "2");
  assert.ok(!("reasoning_effort" in sent[0]));
  assert.deepEqual(
    sent.slice(1).map((body) => body.reasoning_effort),
    ["xhigh", "high"],
  );
});
test("clearing in flight, cancellation and incomplete streams cannot populate cache", async (t) => {
  let answer!: (value: Response) => void,
    count = 0;
  t.mock.method(globalThis, "fetch", async () => {
    count++;
    return new Promise<Response>((r) => {
      answer = r;
    });
  });
  const c = new CompletionCache(),
    p = { ...defaultConfig().providers[0], model: "A", requiresKey: false };
  const run = (signal = new AbortController().signal) =>
    c.run(p, [], undefined, signal, () => {});
  const response = (finish_reason: string) =>
    Response.json({
      choices: [{ message: { content: "part" }, finish_reason }],
    });
  const first = run();
  c.clear();
  answer(response("stop"));
  await first;
  const second = run();
  assert.equal(count, 2);
  answer(response("length"));
  await assert.rejects(second);
  const abort = new AbortController(),
    third = run(abort.signal);
  abort.abort();
  answer(response("stop"));
  await third.catch(() => {});
  const last = run();
  assert.equal(count, 4);
  answer(response("stop"));
  await last;
  assert.equal(await run(), "part");
  assert.equal(count, 4);
});
test("local notes retain structured output and provenance across restart and support independent search and deletion", async () => {
  const file = path.join(
    await mkdtemp(path.join(os.tmpdir(), "readfinch-notes-")),
    "notes.sqlite",
  );
  const n: NoteInput = {
    actionId: "dictionary",
    actionName: "词典",
    notebook: "生词本",
    format: "dictionary",
    source: "serendipity",
    result: '{"definition":"意外发现"}',
    sourceApp: "Reader",
    model: "lookup",
    targetLanguage: "简体中文",
  };
  const db = new LocalNotes(file);
  const id = db.save(n);
  assert.equal(db.save(n), id);
  db.save({ ...n, notebook: "写作", format: "writing", result: "different" });
  db.close();
  const again = new LocalNotes(file);
  const q = { search: "意外", notebook: "", offset: 0 };
  assert.equal(again.list(q).total, 1);
  assert.equal(again.get(id)?.sourceApp, "Reader");
  assert.equal(again.get(id)?.result, n.result);
  assert.equal(again.list({ ...q, notebook: "写作" }).total, 0);
  again.delete(id);
  assert.equal(again.get(id), null);
  assert.equal(again.list({ ...q, search: "" }).total, 1);
  again.close();
});
test("v6 migration retires only untouched sample commands and recognizes custom model IDs", () => {
  const current = defaultConfig(),
    old = { ...current, schemaVersion: 6 };
  old.providers[0].model = "org/private-id";
  const simple = {
    ...old.actions[0],
    id: "shorten",
    name: "精简表达",
    prompt: oldBuiltinPrompts.en.translate.prompt,
    icon: "align" as const,
    system:
      "Shorten the text without losing essential facts. Preserve names, numbers, technical content and the source language. Return only the revision.",
    shortcut: "",
    pinned: false,
  };
  old.actions = [...old.actions, simple];
  old.actions[3] = { ...old.actions[3], name: "润色" };
  const config = parseConfig(old);
  assert.equal(config.actions.length, 4);
  assert.equal(config.actions[3].name, "写作改进");
  assert.equal(config.providers[0].customModel, true);
  simple.pinned = true;
  assert.ok(
    parseConfig(old).actions.some((a) => a.id === "shorten" && a.pinned),
  );
});
test("hovering More does not move or resize the native shaped window at either screen edge", () => {
  for (const anchor of [
    { x: -1010, y: 5 },
    { x: -8, y: 710 },
  ]) {
    const area = { x: -1024, y: 0, width: 1024, height: 768 };
    const closed = toolbarWindowLayout(anchor, area, 5, 5, "none", true);
    assert.equal(closed.shape?.length, 1);
    for (const mode of ["more", "disable"] as const) {
      const open = toolbarWindowLayout(anchor, area, 5, 5, mode, true);
      assert.deepEqual(open.bounds, closed.bounds);
      assert.deepEqual(open.bar, closed.bar);
      assert.equal(open.shape?.length, 2);
    }
  }
});
test("every featured and legacy icon resolves offline and IDs can round-trip in instructions", async () => {
  const { catalogIcons, iconPosition, defaultIconId, featuredIcons } =
    await import("../src/shared/icons");
  assert.equal(new Set(catalogIcons).size, 11534);
  assert.equal(featuredIcons.length, 30);
  for (const id of [
    ...Object.values(defaultIconId),
    ...featuredIcons.map((i) => i.id),
  ])
    assert.ok(iconPosition(id), id);
  const cfg = defaultConfig();
  for (const id of [
    "tabler:microscope",
    "ri:book-open-line",
    "streamline-color:dictionary-language-book-flat",
  ]) {
    cfg.actions[1].icon = id;
    assert.equal(parseConfig(JSON.stringify(cfg)).actions[1].icon, id);
  }
  cfg.actions[1].icon = "tabler:not-a-real-glyph";
  assert.throws(() => parseConfig(cfg));
});
test("links to an older saved result open the page that contains it", () => {
  const store = new LocalNotes(":memory:");
  const template: NoteInput = {
    notebook: "A",
    actionId: "a",
    actionName: "Command",
    format: "markdown",
    source: "one",
    result: "answer",
    sourceApp: "",
    model: "m",
    targetLanguage: "en",
  };
  const earliest = store.save(template);
  for (let i = 0; i < 65; i++)
    store.save({ ...template, source: "entry " + i });
  const page = store.list({
    search: "",
    notebook: "",
    offset: 0,
    focusId: earliest,
  });
  assert.equal(page.offset, 60);
  assert.ok(page.notes.some((n) => n.id === earliest));
  store.close();
});
