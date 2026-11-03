import test from "node:test";
import assert from "node:assert/strict";
import { defaultConfig, parseConfig } from "../src/shared/config";
import {
  definition,
  legacyDictionaryLayout,
} from "../src/shared/action-templates";
import { buildActionHelperPrompt } from "../src/shared/action-ai-helper";

test("fresh settings contain one provider and only the four built-in commands; reopening never seeds a blank command", () => {
  const config = defaultConfig();
  assert.equal(config.providers.length, 1);
  assert.deepEqual(
    config.actions.map((a) => a.id),
    ["translate", "dictionary", "sentence", "polish"],
  );
  assert.deepEqual(parseConfig(JSON.stringify(parseConfig(config))), config);
  const translate = config.actions[0];
  translate.enabled = false;
  assert.equal(parseConfig(config).actions[0].enabled, true);
});

test("v11 migration enables translation without stealing a previously active shortcut and preserves provider accounts", () => {
  const config = defaultConfig();
  config.actions[0].enabled = false;
  config.actions[1].shortcut = config.actions[0].shortcut;
  config.providers.push({
    ...config.providers[0],
    id: "second-account",
    name: "Personal",
  });
  const before = structuredClone(config);
  const result = parseConfig({ ...config, schemaVersion: 11 });
  assert.equal(result.actions[0].enabled, true);
  assert.equal(result.actions[0].shortcut, "");
  assert.equal(result.actions[1].shortcut, before.actions[1].shortcut);
  assert.deepEqual(result.providers, before.providers);
  assert.deepEqual(config, before, "migration must not mutate caller data");
});

test("dictionary upgrade replaces only untouched built-in markup, retaining field identities and custom copies", () => {
  const config = defaultConfig(),
    dictionary = config.actions[1];
  dictionary.layout = legacyDictionaryLayout(dictionary.outputSchema!);
  const snapshot = structuredClone(dictionary);
  config.actions.push({
    ...snapshot,
    id: "my-dictionary",
    name: "My dictionary",
    shortcut: "",
  });
  const next = parseConfig({ ...config, schemaVersion: 11 });
  assert.match(next.actions[1].layout!, /dictionary-v2/);
  assert.match(next.actions[1].layout!, /memory-tips/);
  assert.doesNotMatch(next.actions[1].layout!, /<details/);
  assert.deepEqual(next.actions[1].outputSchema, snapshot.outputSchema);
  assert.equal(next.actions.at(-1)!.layout, snapshot.layout);
  dictionary.layout += "<p>My extra footer</p>";
  assert.equal(
    parseConfig({ ...config, schemaVersion: 11 }).actions[1].layout,
    dictionary.layout,
  );
});

test("AI guide captures current edits and mappings with no provider or note account secrets", () => {
  const action = {
    ...defaultConfig().actions[1],
    ...definition("blank"),
    name: "Latest unsaved name",
    system: "Nested fence: ````\ntext",
    providerId: "private-provider-id",
    noteConnection: {
      providerId: "private-account",
      notebaseId: "private-library",
      mappings: { result: "private-column" },
    },
    apiKey: "sentinel-secret-never-copy",
  };
  const prompt = buildActionHelperPrompt({
    action,
    otherActionNames: ["Already used"],
    targetLanguage: "Japanese",
    uiLocale: "en",
  });
  assert.match(prompt, /Latest unsaved name/);
  assert.match(prompt, /Already used/);
  assert.match(prompt, /Japanese/);
  assert.match(prompt, /Current mapped fields: \["结果"\]/);
  assert.match(prompt, /no parse_json or annotate filter/);
  assert.match(prompt, /context I explicitly supply/);
  assert.match(prompt, /at most three questions/);
  assert.doesNotMatch(
    prompt,
    /sentinel-secret|private-provider-id|private-account|private-library|private-column/,
  );
  assert.match(prompt, /`````json/);
});
