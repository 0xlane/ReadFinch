import test from "node:test";
import assert from "node:assert/strict";
import {
  createProvider,
  defaultConfig,
  parseConfig,
} from "../src/shared/config";
import {
  BUILTIN_MODELS,
  actionModel,
  assignProvider,
  modelOptions,
  supportsImages,
} from "../src/shared/models";

test("built-in catalogs work without fetching, merge discovery and saved custom IDs without duplicates", () => {
  const config = defaultConfig(),
    p = config.providers[0];
  p.model = "private/model";
  const options = modelOptions(config, p.id, ["gpt-4.1-mini", "remote/model"]);
  assert.equal(options.filter((m) => m.id === "gpt-4.1-mini").length, 1);
  assert.equal(options.find((m) => m.id === "private/model")?.source, "saved");
  assert.equal(options.find((m) => m.id === "remote/model")?.vision, undefined);
  assert.equal(
    BUILTIN_MODELS.deepseek.find((m) => m.id === "deepseek-v4-pro")?.vision,
    false,
  );
  for (const [preset, entries] of Object.entries(BUILTIN_MODELS))
    if (preset !== "custom") assert.ok(entries.length >= 2);
});
test("each provider routes exactly one model to every assigned feature", () => {
  let c = defaultConfig();
  const p = createProvider("custom", "second");
  p.model = "lookup";
  c.providers.push(p);
  c.providers[0].model = "default";
  c = assignProvider(c, "action:dictionary", p.id);
  c = assignProvider(c, "languageDetection", p.id);
  c = assignProvider(c, "ocr", p.id);
  p.model = "replacement";
  assert.equal(actionModel(c, c.actions[1]).model, "replacement");
  assert.equal(actionModel(c, c.actions[0]).model, "default");
  assert.equal(c.defaults.ocrProfileId, p.id);
  assert.deepEqual(c.languageDetection, { mode: "llm", providerId: p.id });
  assert.deepEqual(parseConfig(JSON.stringify(c)), c);
  assert.throws(() =>
    parseConfig({ ...c, providers: [{ ...p, models: ["another"] }] }),
  );
  assert.throws(() =>
    parseConfig({ ...c, actions: [{ ...c.actions[0], model: "another" }] }),
  );
  assert.equal(
    supportsImages({ ...p, preset: "deepseek", model: "deepseek-v4-pro" }),
    false,
  );
});
test("v4/v5 multi-model providers split deterministically and preserve actions, detection, OCR and credentials", () => {
  for (const schemaVersion of [4, 5]) {
    const old: any = defaultConfig(),
      p = old.providers[0];
    old.schemaVersion = schemaVersion;
    Object.assign(p, {
      model: "default",
      models: ["lookup", "image", "saved"],
      visionModel: "image",
    });
    old.defaults.ocrProfileId = p.id;
    old.actions[1].model = "lookup";
    old.languageDetection = { mode: "llm", providerId: p.id, model: "lookup" };
    const moves: import("../src/shared/config").CredentialMove[] = [];
    const c = parseConfig(old, moves);
    assert.deepEqual(c, parseConfig(old));
    assert.equal(c.schemaVersion, 12);
    assert.equal(actionModel(c, c.actions[1]).model, "lookup");
    assert.equal(
      c.providers.find((p) => p.id === c.defaults.ocrProfileId)?.model,
      "image",
    );
    assert.equal(c.providers.length, 4);
    assert.equal(moves.length, 3);
    assert.ok(
      moves.every(
        (m) => m.from === "text:" + p.id && m.endpoint === p.endpoint,
      ),
    );
    assert.equal(c.providers[0].model, "default");
    if (schemaVersion === 5)
      assert.deepEqual(c.languageDetection, {
        mode: "llm",
        providerId: c.actions[1].providerId,
      });
  }
});
