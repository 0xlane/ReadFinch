import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { defaultConfig, parseConfig } from "../src/shared/config";
import {
  canonicalizeBuiltinConfig,
  localizeBuiltinConfig,
  matchingBuiltinOutput,
} from "../src/shared/action-language";
import {
  preferredResultLanguage,
  resolveResultLanguage,
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

test("follow-language defaults recognize every offered output language, OS regions and fallback preferences", () => {
  for (const language of languages) {
    assert.equal(
      preferredResultLanguage("system", [language.code]),
      language.name,
    );
    assert.equal(
      resolveResultLanguage(language.name, "en", ["ja"]),
      language.name,
    );
  }
  for (const region of ["zh-TW", "zh-Hant", "zh_HK", "zh-MO"])
    assert.equal(preferredResultLanguage("system", [region]), "繁體中文");
  assert.equal(preferredResultLanguage("system", ["ja-JP", "en-US"]), "日本語");
  assert.equal(
    preferredResultLanguage("system", ["pt-BR", "fr-FR"]),
    "Français",
  );
  assert.equal(preferredResultLanguage("system", ["xx-XX"]), "English");
  assert.equal(preferredResultLanguage("en", ["zh-CN"]), "English");
  assert.equal(preferredResultLanguage("zh-CN", ["en-US"]), "简体中文");
  assert.equal(resolveResultLanguage("system", "system", ["ko-KR"]), "한국어");
  assert.equal(resolveResultLanguage("Italiano", "en", []), "Italiano");
});

test("fresh defaults do not depend on global UI initialization order", () => {
  try {
    setLocale("zh-CN");
    const chinese = defaultConfig();
    setLocale("en");
    const english = defaultConfig();
    assert.deepEqual(chinese, english);
    assert.equal(english.defaults.targetLanguage, "system");
    assert.equal(english.defaults.explanationLanguage, "system");
  } finally {
    setLocale("zh-CN");
  }
});

test("English built-ins contain no Chinese instructions, field descriptions, layouts or sample data", () => {
  const config = defaultConfig();
  config.appearance.language = "en";
  const view = localizeBuiltinConfig(config, "en", ["zh-CN"]);
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

test("all output languages expand explicitly and independently of UI language; dictionary explanations use their own preference", () => {
  for (const locale of ["en", "zh-CN"] as const)
    for (const language of languages) {
      const config = defaultConfig();
      config.appearance.language = locale;
      config.defaults.targetLanguage = language.name;
      config.defaults.explanationLanguage = "日本語";
      const view = localizeBuiltinConfig(config, locale, ["de-DE"]);
      const vars = {
        text: "blossom",
        context: "",
        sourceLanguage: "en",
        sourceApp: "Reader",
        targetLanguage: language.name,
        explanationLanguage: "日本語",
      };
      for (const action of view.actions) {
        const messages = actionMessages(action, vars);
        assert.doesNotMatch(
          JSON.stringify(messages),
          /\{\{\s*(?:targetLanguage|explanationLanguage)/,
        );
        if (action.id === "translate" || action.id === "sentence")
          assert.ok(messages[0].content.includes(language.name), action.id);
        if (action.id !== "translate")
          assert.ok(messages[0].content.includes("日本語"), action.id);
        if (action.sample) {
          assert.equal(action.sample.targetLanguage, language.name);
          assert.equal(action.sample.explanationLanguage, "日本語");
        }
      }
      const sample = view.actions[1].sample!;
      assert.equal(
        sample.values["dictionary-definition"],
        localizedSample("dictionary", "English", "日本語").values[
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
      const viewed = localizeBuiltinConfig(config, locale, [language.code]);
      assert.deepEqual(canonicalizeBuiltinConfig(viewed), config);
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
  const upgraded = localizeBuiltinConfig(config, "en", []);
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
  const view = localizeBuiltinConfig(config, "en", []);
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
  const before = localizeBuiltinConfig(config, "en", ["en"]).actions[1];
  const after = localizeBuiltinConfig(config, "zh-CN", ["zh-CN"]).actions[1];
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
  const view = localizeBuiltinConfig(store.config, "en", ["ja-JP"]);
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

test("note suggestions and the AI setup helper preserve separate translation and explanation languages", () => {
  const config = defaultConfig();
  config.appearance.language = "en";
  const action = localizeBuiltinConfig(config, "en", []).actions[1];
  const messages = suggestionMessages(action, {
    text: "blossom",
    context: "",
    sourceLanguage: "en",
    targetLanguage: "Français",
    explanationLanguage: "日本語",
  });
  const body = JSON.parse(messages[1].content);
  assert.equal(body.explanationLanguage, "日本語");
  assert.equal(body.targetLanguage, "Français");
  assert.match(body.guidance.join("\n"), /日本語/);
  const before = suggestionBinding(config)!.key;
  config.defaults.explanationLanguage = "한국어";
  assert.notEqual(suggestionBinding(config)!.key, before);
  const guide = buildActionHelperPrompt({
    action,
    otherActionNames: [],
    uiLocale: "en",
    targetLanguage: "Français",
    explanationLanguage: "日本語",
  });
  assert.match(guide, /translations is currently "Français"/);
  assert.match(guide, /explanations use "日本語"/);
  assert.match(guide, /- System prompt/);
});
