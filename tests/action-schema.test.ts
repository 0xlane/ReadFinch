import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultConfig, parseConfig } from "../src/shared/config";
import { definition } from "../src/shared/action-templates";
import {
  defaultLayout,
  displayFields,
  jsonContract,
  OutputSchema,
  parseOutput,
  renameLayoutField,
  streamingValues,
  type OutputField,
} from "../src/shared/action-output";
import { noteOutput } from "../src/shared/notes";
import { LocalNotes } from "../src/core/local-notes";
import { actionMessages } from "../src/core/providers";
import { parseSuggestions } from "../src/core/note-suggestions";
import { CompletionCache } from "../src/core/completion-cache";
const fields: OutputField[] = [
  {
    id: "quote",
    name: "原 文",
    type: "string",
    source: "selection",
    description: "",
  },
  {
    id: "gloss",
    name: '解"释',
    type: "string",
    source: "model",
    description: "Use {{targetLanguage}}",
  },
  {
    id: "score",
    name: "分数",
    type: "number",
    source: "model",
    description: "Accuracy",
  },
];
const raw = JSON.stringify({ '解"释': "line\n<&> “好”", 分数: 0 });
const command = {
  ...defaultConfig().actions[2],
  id: "reader",
  name: "Reader",
  outputSchema: fields,
  layout: defaultLayout,
};
test("templates ship their actual fields; upgrades preserve customized legacy commands and old free-form replies", () => {
  const cfg = defaultConfig();
  assert.deepEqual(
    cfg.actions.map((a) => a.outputSchema?.length),
    [undefined, 9, 3, 5],
  );
  const old = {
    ...cfg,
    schemaVersion: 8,
    actions: [
      {
        ...cfg.actions[1],
        outputSchema: undefined,
        layout: undefined,
        sample: undefined,
        system: "my own v8 instructions",
      },
    ],
  };
  const upgraded = parseConfig(old).actions[0];
  assert.equal(upgraded.system, old.actions[0].system);
  assert.equal(upgraded.legacyEditable, true);
  assert.equal(upgraded.outputSchema, undefined);
  assert.deepEqual(parseConfig(JSON.stringify(cfg)), cfg);
  assert.equal(definition("blank").outputSchema.length, 1);
});
test("contracts validate localized names, numbers, nullable fields and the untouched selection; placeholders expand only once", () => {
  const vars = {
    text: "{{targetLanguage}}",
    context: "manual",
    targetLanguage: "English",
  };
  const [system, user] = actionMessages(
    { ...command, prompt: "{{selection}} · {{paragraphs}}" },
    vars,
  );
  assert.equal(user.content, "{{targetLanguage}} · manual");
  assert.match(system.content, /Use English/);
  assert.deepEqual(jsonContract(fields).required, ['解"释', "分数"]);
  const parsed = parseOutput(raw, fields);
  assert.deepEqual(
    displayFields(fields, parsed, "<img> literal").map((f) => f.value),
    ["<img> literal", "line\n<&> “好”", 0],
  );
  for (const wrong of [
    {},
    { '解"释': 0, 分数: 1 },
    { '解"释': null, 分数: "0" },
    { '解"释': null, 分数: 0, "原 文": "fake" },
  ])
    assert.throws(() => parseOutput(JSON.stringify(wrong), fields));
  assert.doesNotThrow(() =>
    parseOutput('{"解\\"释":null,"分数":null}', fields),
  );
  for (const change of [
    [fields[0]],
    [...fields, fields[1]],
    [{ ...fields[1], name: "ctx" }],
    [{ ...fields[1], name: "__proto__" }],
  ])
    assert.equal(OutputSchema.safeParse(change).success, false);
});
test("partial JSON retains Unicode and escaped strings before closing quotes; nested keys cannot masquerade as fields", () => {
  assert.deepEqual({ ...streamingValues(raw) }, JSON.parse(raw));
  assert.equal(streamingValues('{"解\\"释":"先\\n好\\u4')['解"释'], "先\n好");
  assert.equal(streamingValues('{"解\\"释":"先\\')['解"释'], "先");
  assert.equal(
    streamingValues('{"解\\"释":"文字 \\"分数\\":42","分数":0').分数,
    0,
  );
  assert.deepEqual({ ...streamingValues('{"unwanted":{"分数":999}') }, {});
});
test("renames rewrite references without touching literals, member names or plain text", () => {
  const before =
    'Title: Word {{ Word }} {{ ["Word"] }} {% if Word != "Word" %}{{ f.Word }}{% endif %}';
  assert.equal(
    renameLayoutField(before, "Word", 'a "b"'),
    'Title: Word {{ ["a \\"b\\""] }} {{ ["a \\"b\\""] }} {% if ["a \\"b\\""] != "Word" %}{{ f.Word }}{% endif %}',
  );
});
test("mapped local notes and recommendations snapshot numeric data and original text after command removal", () => {
  const action = {
    ...command,
    noteTitleField: "score",
    noteLabels: { score: "等级" },
  };
  const projection = noteOutput(action, "unchanged", raw);
  assert.equal(projection.title, "0");
  assert.equal(JSON.parse(projection.result).等级, 0);
  const [entry] = parseSuggestions(
    JSON.stringify({
      notes: [
        { term: "unchanged", summary: "一条记录", result: JSON.parse(raw) },
      ],
    }),
    action,
    { text: "Keep unchanged here.", targetLanguage: "中文" },
    "Reader",
    "m",
  );
  const vault = new LocalNotes(":memory:");
  try {
    const id = vault.save(entry.note);
    const note = vault.get(id)!;
    assert.deepEqual(note.outputView, projection.outputView);
    assert.equal(note.source, "unchanged");
    assert.equal(note.excerpt, "Keep unchanged here.");
    assert.equal(
      vault.list({ offset: 0, search: "", notebook: "" }).notes[0].source,
      "0",
    );
  } finally {
    vault.close();
  }
});
test("native JSON Schema is requested; only an explicit format rejection falls back, and malformed output never enters cache", async (t) => {
  const bodies: Record<string, unknown>[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      const b = JSON.parse(String(init.body));
      bodies.push(b);
      if (b.response_format)
        return new Response("unsupported response_format", { status: 400 });
      return Response.json({
        choices: [{ message: { content: bodies.length === 2 ? "{}" : raw } }],
      });
    },
  );
  const cache = new CompletionCache(),
    profile = {
      ...defaultConfig().providers[0],
      model: "fixture",
      requiresKey: false,
      outputContract: jsonContract(fields),
    };
  const run = () =>
    cache.run(
      profile,
      actionMessages(command, {}),
      undefined,
      new AbortController().signal,
      () => {},
      false,
      (r) => {
        parseOutput(r, fields);
      },
    );
  await assert.rejects(run);
  assert.equal(await run(), raw);
  assert.equal(await run(), raw);
  assert.equal(bodies.length, 4);
  assert.deepEqual(bodies[0].response_format, {
    type: "json_schema",
    json_schema: {
      name: "action_result",
      strict: true,
      schema: profile.outputContract,
    },
  });
  assert.equal(bodies[1].response_format, undefined);
});
