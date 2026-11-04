import test from "node:test";
import assert from "node:assert/strict";
import {
  isCustomProvider,
  isTranslationOnly,
  type ProviderPreset,
} from "../src/shared/provider-presets";
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
  providerCanServe,
  updateProviderModel,
} from "../src/shared/models";
import { modelKind, speechProtocol } from "../src/shared/model-capabilities";

test("built-in catalogs are a fallback; a fetched catalog replaces all candidates, including when empty", () => {
  const config = defaultConfig(),
    p = config.providers[0];
  p.model = "private/model";
  const fallback = modelOptions(config, p.id);
  assert.equal(fallback.find((m) => m.id === "private/model")?.source, "saved");
  assert.ok(fallback.some((m) => m.source === "builtin"));
  const options = modelOptions(config, p.id, [
    "gpt-4.1-mini",
    "remote/model",
    "gpt-4.1-mini",
  ]);
  assert.deepEqual(
    options.map((m) => m.id),
    ["gpt-4.1-mini", "remote/model"],
  );
  assert.equal(options.filter((m) => m.id === "gpt-4.1-mini").length, 1);
  assert.ok(options.every((m) => m.source === "remote"));
  assert.equal(options.find((m) => m.id === "gpt-4.1-mini")?.vision, true);
  assert.deepEqual(modelOptions(config, p.id, []), []);
  assert.equal(options.find((m) => m.id === "remote/model")?.vision, false);
  assert.equal(
    BUILTIN_MODELS.deepseek.find((m) => m.id === "deepseek-v4-pro")?.vision,
    false,
  );
  for (const [preset, entries] of Object.entries(BUILTIN_MODELS))
    if (
      !isCustomProvider(preset as ProviderPreset) &&
      !isTranslationOnly({ preset: preset as ProviderPreset })
    )
      assert.ok(entries.length >= 1, preset);
});
test("each provider routes exactly one model to every assigned feature", () => {
  let c = defaultConfig();
  const p = createProvider("custom", "second");
  p.model = "lookup";
  p.modelKind = "vision"; // This private deployment was explicitly assigned for images.
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
    supportsImages({
      ...p,
      preset: "deepseek",
      model: "deepseek-v4-pro",
      modelKind: undefined,
    }),
    false,
  );
});
test("v4/v5 multi-model providers split deterministically and preserve actions, detection, OCR and credentials", () => {
  for (const schemaVersion of [4, 5]) {
    const old: any = defaultConfig(),
      p = old.providers[0];
    old.schemaVersion = schemaVersion;
    delete p.proxy;
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
    assert.equal(c.schemaVersion, 16);
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
test("new provider defaults match Read Frog while custom endpoints remain user-defined", () => {
  const expected = {
    openai: "gpt-6-luna",
    deepseek: "deepseek-v4-flash",
    qwen: "qwen3.8-flash",
    siliconflow: "Qwen/Qwen3-Next-80B-A3B-Instruct",
    gemini: "gemini-3.5-flash-lite",
    openrouter: "google/gemma-4-31b-it:free",
  };
  for (const [preset, model] of Object.entries(expected)) {
    const p = createProvider(preset, "new");
    assert.equal(p.model, model);
    assert.ok(BUILTIN_MODELS[p.preset].some((m) => m.id === model));
    assert.equal(
      new Set(BUILTIN_MODELS[p.preset].map((m) => m.id)).size,
      BUILTIN_MODELS[p.preset].length,
    );
  }
  assert.equal(createProvider("custom", "private").model, "");
  assert.equal(createProvider("custom", "private").customModel, true);
});

test("list selections stay non-custom and survive manual input, autosave and restart", async () => {
  const { chooseProviderModel, toggleCustomModel } =
    await import("../src/shared/provider-model");
  for (const selected of ["gpt-4.1-mini", "remote/unlisted"]) {
    const c = defaultConfig();
    let p = chooseProviderModel(c.providers[0], selected, false);
    assert.equal(p.customModel, false);
    p = toggleCustomModel(p, true);
    p = chooseProviderModel(p, "private/deployed-model", true);
    c.providers[0] = p;
    const reopened = parseConfig(JSON.stringify(c)).providers[0];
    assert.equal(reopened.model, "private/deployed-model");
    assert.equal(reopened.builtinModel, selected);
    const restored = toggleCustomModel(reopened, false);
    assert.equal(restored.model, selected);
    assert.equal(restored.customModel, false);
    c.providers[0] = chooseProviderModel(reopened, "another/discovered", false);
    const saved = parseConfig(JSON.stringify(c)).providers[0];
    assert.equal(saved.model, "another/discovered");
    assert.equal(saved.customModel, false);
  }
});

test("v12 refresh fills only unconfigured presets and retains chosen, retired and private IDs", () => {
  const old: any = defaultConfig();
  old.schemaVersion = 12;
  old.providers[0].model = "";
  old.providers.push({
    ...createProvider("openai", "chosen"),
    model: "gpt-4.1-mini",
  });
  old.providers.push({
    ...createProvider("openrouter", "retired"),
    model: "google/gemini-3.8-flash",
  });
  old.providers.push({
    ...createProvider("custom", "private"),
    model: "my/model",
  });
  const c = parseConfig(old);
  const malformed = structuredClone(old);
  malformed.providers[0].customModel = "false";
  assert.throws(() => parseConfig(malformed));
  assert.equal(c.providers[0].model, "gpt-6-luna");
  assert.equal(c.providers[1].model, "gpt-4.1-mini");
  assert.equal(c.providers[2].model, "google/gemini-3.8-flash");
  assert.equal(c.providers[2].customModel, true);
  assert.equal(c.providers[3].model, "my/model");
  assert.deepEqual(parseConfig(JSON.stringify(c)), c);
});

test("model capabilities separate text, images and speech, including discovered models and custom deployments", () => {
  const c = defaultConfig(),
    p = c.providers[0];
  assert.equal(providerCanServe(p, "tts"), false);
  const ids = [
    "gpt-4.1-mini",
    "gpt-4o-mini-tts-2025-12-15",
    "mimo-v2.5-tts",
    "private/deployment",
  ];
  const entries = modelOptions(c, p.id, ids);
  assert.deepEqual(
    entries.map((m) => m.kind),
    ["vision", "speech", "speech", "text"],
  );
  for (const id of ids.slice(1, 3)) {
    const speech = { ...p, model: id };
    assert.equal(providerCanServe(speech, "tts"), true);
    assert.equal(providerCanServe(speech, "default"), false);
    assert.equal(providerCanServe(speech, "action:translate"), false);
    assert.equal(supportsImages(speech), false);
  }
  const alias = {
    ...p,
    model: "my-voice",
    modelKind: "speech" as const,
    speechProtocol: "mimo" as const,
  };
  assert.equal(modelKind(alias), "speech");
  assert.equal(speechProtocol(alias), "mimo");
  assert.equal(providerCanServe(alias, "tts"), true);
  assert.equal(
    speechProtocol({ ...alias, speechProtocol: "openai" }),
    "openai",
  );
  assert.equal(createProvider("mimo", "mimo").model, "mimo-v2.6-flash");
});

test("changing a provider to speech removes incompatible bindings and keeps unrelated providers and secrets scoped", () => {
  let c = defaultConfig();
  const primary = c.providers[0];
  c.providers.push(createProvider("openai", "fallback"));
  c = assignProvider(c, "ocr", primary.id);
  c = assignProvider(c, "action:dictionary", primary.id);
  c = assignProvider(c, "languageDetection", primary.id);
  c = updateProviderModel(c, { ...primary, model: "mimo-v2.5-tts" });
  assert.equal(c.defaults.textProfileId, "fallback");
  assert.equal(c.defaults.ocrProfileId, "ocr-offline");
  assert.equal(c.actions.find((a) => a.id === "dictionary")?.providerId, null);
  assert.equal(c.languageDetection.mode, "basic");
  c = assignProvider(c, "tts", primary.id);
  assert.equal(c.tts.onlineProviderId, primary.id);
  assert.deepEqual(parseConfig(JSON.stringify(c)), c);
  c = updateProviderModel(c, primary);
  assert.equal(c.tts.onlineProviderId, null);
});

test("discovered IDs from a custom compatible provider also remain list selections", async () => {
  const { chooseProviderModel, toggleCustomModel } =
    await import("../src/shared/provider-model");
  let p = createProvider("custom", "alias");
  p = chooseProviderModel(p, "deployed-id", false);
  assert.equal(p.customModel, false);
  p = chooseProviderModel(p, "manual-id", true);
  assert.equal(p.customModel, true);
  assert.equal(toggleCustomModel(p, false).model, "deployed-id");
});
