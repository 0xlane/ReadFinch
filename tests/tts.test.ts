import test from "node:test";
import assert from "node:assert/strict";
import { defaultConfig, parseConfig } from "../src/shared/config";
import { assignProvider, modelPurposes } from "../src/shared/models";
import {
  defaultSpeech,
  onlineProsody,
  onlineVoices,
  speechChunks,
  systemProsody,
  voiceForLanguage,
} from "../src/shared/tts";

const voices = [
  {
    id: "system:en",
    name: "English",
    local: true,
    lang: "en-US",
    preferred: true,
  },
  { id: "system:tw", name: "TW", lang: "zh-TW", local: true },
  { id: "system:cn", name: "CN", lang: "zh-CN", local: true },
];
test("migrated settings start with local speech; voice mappings survive export and remain independent of the text model", () => {
  const config = defaultConfig();
  const { tts, ...legacy } = config;
  const migrated = parseConfig({ ...legacy, schemaVersion: 10 });
  assert.deepEqual(migrated.tts, defaultSpeech());
  const online = assignProvider(migrated, "tts", config.providers[0].id);
  assert.equal(
    modelPurposes(online).find((p) => p.id === "tts")?.providerId,
    config.providers[0].id,
  );
  online.tts.languageVoices.en = "api:namespace/model:voice-01";
  online.tts.customVoices = ["namespace/model:voice-01"];
  online.tts.pitch = 62;
  assert.deepEqual(parseConfig(JSON.stringify(online)).tts, online.tts);
  assert.throws(() =>
    parseConfig({ ...online, tts: { ...online.tts, rate: 101 } }),
  );
  assert.throws(() =>
    parseConfig({
      ...online,
      tts: { ...online.tts, onlineProviderId: "missing" },
    }),
  );
});
test("voice routing follows exact, script, base-language and explicit fallback before automatic local matching", () => {
  const cfg = defaultSpeech();
  assert.equal(voiceForLanguage(voices, cfg, "繁體中文")?.id, "system:tw");
  cfg.defaultVoice = "system:cn";
  cfg.onlineProviderId = "voice-source";
  cfg.languageVoices = { en: "api:alloy", "zh-Hant": "system:tw" };
  const all = [...voices, ...onlineVoices(cfg)];
  assert.equal(voiceForLanguage(all, cfg, "eng")?.id, "api:alloy");
  assert.equal(voiceForLanguage(all, cfg, "zh-HK")?.id, "system:tw");
  assert.equal(voiceForLanguage(all, cfg, "fr")?.id, "system:cn");
  assert.equal(voiceForLanguage(voices, cfg, "en")?.id, "system:cn");
  assert.equal(
    voiceForLanguage(onlineVoices(cfg), defaultSpeech(), "und"),
    undefined,
  );
});
test("long speech preserves characters and bounds individual requests; online pitch and speed compose independently", () => {
  const phrase = "🦊这是一个测试。 This is a sentence! ";
  const text = phrase.repeat(90).trim();
  const chunks = speechChunks(text, 90);
  assert.equal(chunks.join(""), text);
  assert.ok(chunks.every((c) => c.length <= 90 && !/^[\uDC00-\uDFFF]/.test(c)));
  const cfg = defaultSpeech();
  cfg.pitch = 100;
  cfg.rate = -100;
  cfg.volume = -100;
  const p = onlineProsody(cfg);
  assert.equal(p.speed * p.playbackRate, 0.5);
  assert.equal(p.volume, 0);
  assert.equal(systemProsody(cfg).pitch, 2);
  assert.equal(systemProsody(cfg).volume, 0);
});
