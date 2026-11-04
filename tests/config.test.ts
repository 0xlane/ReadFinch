import { legacyConfig } from "./legacy-config";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  defaultConfig,
  parseConfig,
  mergeConfig,
  promptVariables,
  cleanupLines,
} from "../src/shared/config";
import { ConfigStore, digest } from "../src/core/store";
test("portable round-trip preserves references and stable IDs without duplication", () => {
  const local = defaultConfig();
  local.actions[0].providerId = local.providers[0].id;
  const imported = parseConfig(JSON.stringify(local));
  assert.deepEqual(imported, local);
  assert.deepEqual(mergeConfig(local, imported), local);
  assert.equal(digest(local), digest(imported));
});
test("schema rejects secrets, invalid references, duplicate IDs, invalid versions and retired provider fields", () => {
  for (const mutate of [
    (c: any) => (c.apiKey = "secret"),
    (c: any) => (c.providers[0].apiKey = "secret"),
    (c: any) => (c.schemaVersion = 50),
    (c: any) => (c.defaults.textProfileId = "missing"),
    (c: any) => (c.actions[0].providerId = "missing"),
    (c: any) => c.actions.push(c.actions[0]),
    (c: any) => (c.providers[0].endpoint = "https://key:secret@example.com/v1"),
    (c: any) => (c.ocrProfiles = []),
    (c: any) => (c.providers[0].kind = "ollama"),
    (c: any) => (c.defaults.ocrProfileId = "missing"),
    (c: any) => {
      c.providers[0].model = "";
      c.defaults.ocrProfileId = c.providers[0].id;
    },
  ]) {
    const c = defaultConfig();
    mutate(c);
    assert.throws(() => parseConfig(c));
  }
});
test("v0 migration adds font size, unknown fields remain rejected", () => {
  const old = legacyConfig();
  old.schemaVersion = 0;
  delete old.appearance.fontSize;
  const next = parseConfig(old);
  assert.equal(next.schemaVersion, 15);
  assert.equal(next.appearance.fontSize, 15);
});
test("substitution is single-pass and preserves source tokens literally", () => {
  assert.equal(
    promptVariables("{{text}} / {{context}}", {
      text: "{{context}}",
      context: "private",
    }),
    "{{context}} / private",
  );
});
test("line cleanup preserves code, paths, logs and paragraph boundaries", () => {
  assert.equal(
    cleanupLines("你好\n世界\n\nHello\nworld"),
    "你好世界\n\nHello world",
  );
  assert.equal(
    cleanupLines("C:\\apps\\test\n  const x = 1;"),
    "C:\\apps\\test\n  const x = 1;",
  );
});
test("store persists actions, protects last valid state and detects concurrent writes", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "readfinch-store-"));
  const store = new ConfigStore(dir);
  await store.init();
  const original = store.config;
  const changed = store.config;
  changed.actions[0].name = "A changed action";
  await store.save(changed);
  const restored = new ConfigStore(dir);
  await restored.init();
  assert.equal(restored.config.actions[0].name, "A changed action");
  assert.equal(
    JSON.parse(await readFile(store.file + ".bak", "utf8")).actions[0].name,
    original.actions[0].name,
  );
  const revision = store.revision;
  await assert.rejects(() => store.save({ ...changed, schemaVersion: 99 }));
  assert.equal(store.revision, revision);
  const c = store.config;
  c.actions.reverse();
  await store.save(c, revision);
  await assert.rejects(() => store.save(changed, revision), /其他窗口/);
  await writeFile(store.file, "broken");
  const recovery = new ConfigStore(dir);
  await recovery.init();
  assert.equal(recovery.config.actions[0].name, "A changed action");
  assert.ok(recovery.recovery);
  assert.ok((await readdir(dir)).some((f) => f.startsWith("config-invalid")));
});
