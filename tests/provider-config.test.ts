import { parseHeaders } from "../src/shared/headers";
import { actionLabel, resolveLocale, setLocale } from "../src/shared/i18n";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  defaultConfig,
  parseConfig,
  createProvider,
  ocrProfiles,
  OFFLINE_OCR_ID,
  upgradeProviders,
} from "../src/shared/config";
import {
  PROVIDER_PRESETS,
  isTranslationOnly,
} from "../src/shared/provider-presets";
import { supportsImages } from "../src/shared/models";
import { ConfigStore } from "../src/core/store";
import { legacyConfig } from "./legacy-config";

test("all presets create valid generic providers while offline OCR is always the default", () => {
  for (const preset of PROVIDER_PRESETS) {
    const config = defaultConfig();
    const provider = createProvider(preset.id, "provider");
    config.providers.push(provider);
    if (!isTranslationOnly(provider))
      config.defaults.textProfileId = "provider";
    assert.equal(
      parseConfig(config).providers.at(-1)!.endpoint,
      preset.endpoint,
    );
    assert.equal(config.defaults.ocrProfileId, OFFLINE_OCR_ID);
    assert.equal(ocrProfiles(config)[0].id, OFFLINE_OCR_ID);
    provider.model = "vision-model";
    const remote = ocrProfiles(config).find((p) => p.id === provider.id);
    assert.equal(!!remote, supportsImages(provider) !== false);
    if (remote) {
      assert.equal(remote.model, "vision-model");
      assert.equal(remote.endpoint, provider.endpoint);
    }
    assert.equal(config.defaults.ocrProfileId, OFFLINE_OCR_ID);
  }
});
test("v2 text and OCR providers with colliding IDs retain separate models and credential mappings", () => {
  const old = legacyConfig();
  old.textProfiles[0].model = "words";
  old.ocrProfiles.push({
    ...old.ocrProfiles[0],
    id: old.textProfiles[0].id,
    name: "Vision account",
    kind: "openai",
    model: "vision",
    endpoint: "https://vision.example.com/v1",
    requiresKey: true,
  });
  old.defaults.ocrProfileId = old.textProfiles[0].id;
  const result = parseConfig(old),
    moves = upgradeProviders(old).credentials;
  assert.equal(result.providers.length, 2);
  assert.equal(result.providers[0].model, "words");
  assert.equal(result.providers[1].model, "vision");
  assert.notEqual(result.providers[0].id, result.providers[1].id);
  assert.equal(result.defaults.ocrProfileId, result.providers[1].id);
  assert.deepEqual(moves[1], {
    from: "ocr:" + old.textProfiles[0].id,
    to: "text:" + result.providers[1].id,
    endpoint: "https://vision.example.com/v1",
  });
  assert.deepEqual(parseConfig(JSON.stringify(result)), result);
});
test("retired native Ollama configurations return to built-in OCR, without any implicit endpoint conversion", () => {
  const old = legacyConfig();
  old.ocrProfiles.push({
    ...old.ocrProfiles[0],
    id: "old-local",
    kind: "ollama",
    model: "local-vision",
    endpoint: "http://localhost:11434",
  });
  old.defaults.ocrProfileId = "old-local";
  const result = parseConfig(old);
  assert.equal(result.providers.length, 1);
  assert.equal(result.defaults.ocrProfileId, OFFLINE_OCR_ID);
  assert.equal(JSON.stringify(result).includes("11434"), false);
});
test("legacy migration still rejects unknown fields, secrets and broken OCR references", () => {
  for (const mutate of [
    (c: any) => (c.ocrProfiles[0].apiKey = "private"),
    (c: any) => (c.textProfiles[0].unknown = true),
    (c: any) => (c.providers = []),
    (c: any) => (c.defaults.ocrProfileId = "missing"),
  ]) {
    const old = legacyConfig();
    mutate(old);
    assert.throws(() => parseConfig(old));
  }
});
test("local upgrade preserves original config until saving and supplies only endpoint-scoped credential moves", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "readfinch-upgrade-"));
  const old = legacyConfig();
  old.ocrProfiles.push({
    ...old.ocrProfiles[0],
    id: "vision",
    kind: "openai",
    model: "image-model",
    requiresKey: true,
  });
  const file = path.join(dir, "config.json");
  await writeFile(file, JSON.stringify(old));
  const store = new ConfigStore(dir);
  await store.init();
  assert.equal(store.config.schemaVersion, 17);
  assert.equal(JSON.parse(await readFile(file, "utf8")).schemaVersion, 2);
  assert.ok(
    store.credentialMoves.some(
      (move) => move.from === "ocr:vision" && move.to === "text:vision",
    ),
  );
  await store.save(store.config);
  assert.equal(
    JSON.parse(await readFile(file + ".bak", "utf8")).schemaVersion,
    2,
  );
  const restarted = new ConfigStore(dir);
  await restarted.init();
  assert.equal(restarted.credentialMoves.length, 0);
});

test("interface locale honors system preferences and keeps custom action names intact", () => {
  assert.equal(resolveLocale("system", ["zh-Hans-CN", "en-US"], "en-US"), "en");
  assert.equal(resolveLocale("system", ["en-US"], "zh-Hans-CN"), "zh-CN");
  assert.equal(resolveLocale("system", ["zh_CN.UTF-8"], "de-DE"), "zh-CN");
  assert.equal(resolveLocale("system", [], "ja-JP"), "en");
  assert.equal(resolveLocale("zh-CN", ["en-US"], "en-US"), "zh-CN");
  assert.equal(resolveLocale("en", ["zh-CN"], "zh-CN"), "en");
  assert.equal(resolveLocale("system", ["zh-Hant-TW", "en-US"]), "zh-CN");
  assert.equal(resolveLocale("system", ["de-DE", "en-GB"]), "en");
  assert.equal(resolveLocale("zh-CN", ["en-US"]), "zh-CN");
  setLocale("en");
  try {
    assert.equal(actionLabel({ id: "dictionary", name: "词典" }), "Dictionary");
    assert.equal(actionLabel({ id: "mine", name: "词典" }), "词典");
  } finally {
    setLocale("zh-CN");
  }
});
test("only valid string headers can reach provider requests", () => {
  assert.deepEqual(parseHeaders('{"X-Project":"fixture"}'), {
    "X-Project": "fixture",
  });
  for (const invalid of [
    "[]",
    '{"a":1}',
    '{"a":"1","A":"2"}',
    '{"Host":"example.com"}',
    JSON.stringify({ a: "a\rb" }),
  ])
    assert.throws(() => parseHeaders(invalid));
});
