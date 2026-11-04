import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { defaultConfig, parseConfig } from "../src/shared/config";
import {
  canonicalizeBuiltinConfig,
  localizeBuiltinConfig,
  matchingBuiltinOutput,
} from "../src/shared/action-language";
import {
  initialTargetLanguage,
  resultLanguageName,
} from "../src/shared/languages";
import { setLocale } from "../src/shared/i18n";
import languages from "../src/shared/target-languages.json";
import history from "../src/shared/action-default-history.json";
import { actionMessages } from "../src/core/providers";
import { localizedSample } from "../src/shared/action-samples";
import {
  suggestionBinding,
  suggestionMessages,
} from "../src/core/note-suggestions";
import { ConfigStore } from "../src/core/store";
import { buildActionHelperPrompt } from "../src/shared/action-ai-helper";

test("first use selects a concrete target from supported OS language preferences", () => {
  for (const language of languages) {
    assert.equal(initialTargetLanguage([language.code]), language.name);
    assert.equal(resultLanguageName(language.code), language.name);
  }
  for (const region of ["zh-TW", "zh-Hant", "zh_HK", "zh-MO"])
    assert.equal(initialTargetLanguage([region]), "繁體中文");
  assert.equal(initialTargetLanguage(["ja-JP", "en-US"]), "日本語");
  assert.equal(
    initialTargetLanguage(["not_a_valid_tag!", "pt-BR", "fr-FR"]),
    "Français",
  );
  assert.equal(initialTargetLanguage(["xx-XX"]), "English");
  assert.equal(initialTargetLanguage(["zh-Hans-HK"]), "简体中文");
  assert.equal(resultLanguageName("Italiano"), "Italiano");
});

test("fresh defaults do not depend on global UI initialization order", () => {
  try {
    setLocale("zh-CN");
    const chinese = defaultConfig();
    setLocale("en");
    const english = defaultConfig();
    assert.deepEqual(chinese, english);
    assert.equal(english.defaults.targetLanguage, "English");
    assert.equal(english.defaults.sourceLanguage, "auto");
    assert.ok(!("explanationLanguage" in english.defaults));
  } finally {
    setLocale("zh-CN");
  }
});

test("first-run and v14 follow-mode initialization is written once; restarts, imports and UI switches preserve explicit choices", async () => {
  for (const old of [
    undefined,
    ["system", "system", "日本語"],
    ["en", "system", "English"],
    ["system", "Français", "Français"],
  ] as const) {
    const dir = await mkdtemp(
      path.join(os.tmpdir(), "readfinch-first-language-"),
    );
    const file = path.join(dir, "config.json");
    const data = defaultConfig();
    const legacy = old && {
      ...data,
      schemaVersion: 14,
      appearance: { ...data.appearance, language: old[0] },
      defaults: {
        ...data.defaults,
        sourceLanguage: "Deutsch",
        targetLanguage: old[1],
        explanationLanguage: "한국어",
      },
    };
    if (legacy) await writeFile(file, JSON.stringify(legacy));
    let reads = 0;
    const store = new ConfigStore(dir, canonicalizeBuiltinConfig, () => {
      reads++;
      return ["ja-JP"];
    });
    await store.init();
    const stored = JSON.parse(await readFile(file, "utf8"));
    assert.equal(stored.defaults.targetLanguage, old ? old[2] : "日本語");
    assert.equal(stored.defaults.sourceLanguage, old ? "Deutsch" : "auto");
    assert.equal(stored.schemaVersion, 15);
    assert.ok(!("explanationLanguage" in stored.defaults));
    assert.equal(
      reads,
      !old || (old[0] === "system" && old[1] === "system") ? 1 : 0,
    );
    if (legacy)
      assert.deepEqual(
        JSON.parse(await readFile(file + ".bak", "utf8")),
        legacy,
      );
    const noDetect = () => {
      throw Error("Target language re-detected");
    };
    const restarted = new ConfigStore(dir, canonicalizeBuiltinConfig, noDetect);
    await restarted.init();
    assert.equal(
      restarted.config.defaults.targetLanguage,
      stored.defaults.targetLanguage,
    );
    const chosen = restarted.config;
    chosen.appearance.language = "zh-CN";
    chosen.defaults.targetLanguage = "Español";
    chosen.defaults.sourceLanguage = "Français";
    await restarted.save(chosen);
    assert.deepEqual(
      parseConfig(await readFile(file, "utf8"), [], noDetect).defaults,
      chosen.defaults,
    );
    assert.equal(
      restarted.parse({
        ...chosen,
        schemaVersion: 14,
        appearance: { ...chosen.appearance, language: "system" },
        defaults: { ...chosen.defaults, targetLanguage: "system" },
      }).defaults.targetLanguage,
      "Español",
    );
    for (const targetLanguage of ["auto", "system"])
      assert.throws(() =>
        parseConfig({
          ...chosen,
          defaults: { ...chosen.defaults, targetLanguage },
        }),
      );
  }
});

test("English built-ins contain no Chinese instructions, field descriptions, layouts or sample data", () => {
  const config = defaultConfig();
  config.appearance.language = "en";
  const view = localizeBuiltinConfig(config, "en");
  for (const action of view.actions) {
    assert.doesNotMatch(
      JSON.stringify({
        system: action.system,
        prompt: action.prompt,
        fields: action.outputSchema,
        layout: action.layout,
        sample: action.sample,
      }),
      /[\u3400-\u9fff]/,
      action.id,
    );
    if (action.outputSchema)
      assert.deepEqual(
        action.outputSchema.map((f) => f.id),
        config.actions
          .find((a) => a.id === action.id)!
          .outputSchema!.map((f) => f.id),
      );
  }
});

test("translations, dictionary entries, writing feedback and examples share one target in both interface languages", () => {
  for (const locale of ["en", "zh-CN"] as const)
    for (const language of languages) {
      const config = defaultConfig();
      config.appearance.language = locale;
      config.defaults.targetLanguage = language.name;
      const view = localizeBuiltinConfig(config, locale);
      const vars = {
        text: "blossom",
        context: "",
        sourceLanguage: "en",
        sourceApp: "Reader",
        targetLanguage: language.name,
      };
      for (const action of view.actions) {
        const messages = actionMessages(action, vars);
        assert.doesNotMatch(
          JSON.stringify(messages),
          /\{\{\s*(?:targetLanguage|explanationLanguage)/,
        );
        assert.ok(messages[0].content.includes(language.name), action.id);
        if (action.sample) {
          assert.equal(action.sample.targetLanguage, language.name);
          assert.ok(!("explanationLanguage" in action.sample));
        }
      }
      const sample = view.actions[1].sample!;
      assert.equal(
        sample.values["dictionary-definition"],
        localizedSample("dictionary", language.name).values[
          "dictionary-definition"
        ],
      );
      assert.equal(
        view.actions[3].sample!.values["improve-writing-improved"],
        "She goes to the library every week.",
      );
    }
});

test("language switching is reversible and does not change stored defaults or sync fingerprints", () => {
  const config = canonicalizeBuiltinConfig(defaultConfig());
  for (const locale of ["en", "zh-CN"] as const)
    for (const language of languages) {
      const configured = {
        ...config,
        defaults: { ...config.defaults, targetLanguage: language.name },
      };
      const viewed = localizeBuiltinConfig(configured, locale);
      assert.deepEqual(canonicalizeBuiltinConfig(viewed), configured);
      assert.deepEqual(parseConfig(viewed), viewed);
    }
});

test("earlier untouched built-ins update while user prompts, layouts, samples and stable note mappings survive", () => {
  const config = defaultConfig();
  Object.assign(
    config.actions[1],
    structuredClone(history["zh-CN"].dictionary),
  );
  config.appearance.language = "en";
  const upgraded = localizeBuiltinConfig(config, "en");
  assert.match(upgraded.actions[1].system, /explain|dictionary/i);
  assert.doesNotMatch(upgraded.actions[1].system, /[\u3400-\u9fff]/);
  const custom = structuredClone(upgraded.actions[1]);
  custom.id = "my-dictionary";
  custom.name = "我的自定义词典";
  custom.shortcut = "";
  config.actions.push(custom);
  config.actions[1].system = "My instructions: never rewrite this.";
  config.actions[1].layout = "<article>我的版式</article>";
  config.actions[1].outputSchema![0].name = "My term";
  config.actions[1].sample!.values["dictionary-definition"] = "我的示例";
  config.actions[1].noteConnection = {
    providerId: "local",
    notebaseId: "library",
    mappings: { "dictionary-definition": "definition-column" },
  };
  const view = localizeBuiltinConfig(config, "en");
  assert.equal(view.actions[1].system, config.actions[1].system);
  assert.equal(view.actions[1].layout, config.actions[1].layout);
  assert.equal(view.actions[1].outputSchema![0].name, "My term");
  assert.deepEqual(view.actions[1].sample, config.actions[1].sample);
  assert.deepEqual(
    view.actions[1].noteConnection,
    config.actions[1].noteConnection,
  );
  assert.deepEqual(view.actions.at(-1), custom);
  assert.deepEqual(canonicalizeBuiltinConfig(view).actions.at(-1), custom);
});

test("a result produced before a language switch still matches its built-in command, but schema changes are rejected", () => {
  const config = defaultConfig();
  const before = localizeBuiltinConfig(config, "en").actions[1];
  const after = localizeBuiltinConfig(config, "zh-CN").actions[1];
  assert.deepEqual(
    matchingBuiltinOutput(after, before.outputSchema)?.outputSchema,
    before.outputSchema,
  );
  const changed = structuredClone(before.outputSchema!);
  changed[0].name = "Unrecognized changed field";
  assert.equal(matchingBuiltinOutput(after, changed), undefined);
});

test("persisting a localized settings snapshot and restarting retains a canonical store revision", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "readfinch-language-"));
  const store = new ConfigStore(dir, canonicalizeBuiltinConfig);
  await store.init();
  const revision = store.revision;
  const view = localizeBuiltinConfig(store.config, "en");
  await store.save(view, revision);
  assert.equal(store.revision, revision);
  const restarted = new ConfigStore(dir, canonicalizeBuiltinConfig);
  await restarted.init();
  assert.equal(restarted.revision, revision);
  assert.equal(
    JSON.parse(await readFile(store.file, "utf8")).actions[1].outputSchema[0]
      .name,
    "词条",
  );
});

test("note suggestions, old custom language tokens and the editor helper use the selected target", () => {
  const config = defaultConfig();
  config.appearance.language = "en";
  const action = {
    ...localizeBuiltinConfig(config, "en").actions[1],
    system: "Explain in {{explanationLanguage}}.",
  };
  const messages = suggestionMessages(action, {
    text: "blossom",
    context: "",
    sourceLanguage: "en",
    targetLanguage: "Français",
  });
  const body = JSON.parse(messages[1].content);
  assert.equal(body.targetLanguage, "Français");
  assert.match(body.guidance.join("\n"), /Explain in Français/);
  const before = suggestionBinding(config)!.key;
  config.defaults.targetLanguage = "한국어";
  assert.notEqual(suggestionBinding(config)!.key, before);
  const guide = buildActionHelperPrompt({
    action,
    otherActionNames: [],
    uiLocale: "en",
    targetLanguage: "Français",
  });
  assert.match(
    guide,
    /"Français", for translations, definitions and explanations/,
  );
  assert.match(guide, /- System prompt/);
});
