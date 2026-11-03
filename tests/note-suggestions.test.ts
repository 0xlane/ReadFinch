import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { defaultConfig, parseConfig } from "../src/shared/config";
import { assignProvider } from "../src/shared/models";
import {
  parseSuggestions,
  suggestionBinding,
  suggestionMessages,
} from "../src/core/note-suggestions";
import { LocalNotes } from "../src/core/local-notes";
import { CompletionCache } from "../src/core/completion-cache";

const action = defaultConfig().actions[1];
const input = {
  text: "A detour led to a serendipitous encounter.",
  context: "",
  sourceLanguage: "English",
  targetLanguage: "简体中文",
};
const row = {
  term: "detour",
  summary: "绕路",
  result: {
    词条: "detour",
    释义: "一条迂回的路线。",
    句子: input.text,
    音标: "/ˈdiːtʊr/",
    词性: null,
    句中词形: null,
    句子翻译: null,
    记忆技巧: null,
    难度: null,
  },
};
const parse = (notes: unknown[]) =>
  parseSuggestions(JSON.stringify({ notes }), action, input, "Reader", "vocab");

test("v7 upgrades to suggestions using Dictionary and the default provider; independent bindings round-trip", () => {
  const { noteSuggestion, ...old } = defaultConfig();
  const c = parseConfig({ ...old, schemaVersion: 7 });
  assert.deepEqual(c.noteSuggestion, noteSuggestion);
  assert.equal(suggestionBinding(c)?.action.id, "dictionary");
  c.providers[0].model = "";
  assert.equal(suggestionBinding(c), undefined);
  c.providers[0].model = "translator";
  assert.equal(suggestionBinding(c)?.action.id, "dictionary");
  c.providers.push({ ...c.providers[0], id: "vocab", model: "vocab" });
  const separate = assignProvider(c, "noteSuggestion", "vocab");
  separate.noteSuggestion.actionId = "sentence";
  assert.equal(
    suggestionBinding(parseConfig(JSON.stringify(separate)))?.provider.model,
    "vocab",
  );
  assert.equal(separate.defaults.textProfileId, "text-default");
  assert.equal(suggestionBinding(separate)?.action.format, "markdown");
  assert.throws(() =>
    parseConfig({
      ...c,
      noteSuggestion: { ...noteSuggestion, actionId: "unknown" },
    }),
  );
  assert.throws(() =>
    parseConfig({
      ...c,
      noteSuggestion: { ...noteSuggestion, providerId: "unknown" },
    }),
  );
  const unbound = assignProvider(separate, "noteSuggestion", null);
  assert.equal(suggestionBinding(unbound)?.provider.model, "translator");
  unbound.noteSuggestion.enabled = false;
  assert.equal(suggestionBinding(unbound), undefined);
});

test("recommendations use bounded selection, user context, the chosen command and translation target", () => {
  const command = {
    ...action,
    prompt: "Study {{text}} with {{context}} in {{targetLanguage}}.",
  };
  const [, user] = suggestionMessages(command, {
    ...input,
    text: "a".repeat(3000) + "END-TEXT",
    context: "b".repeat(2600) + "END-CONTEXT",
  });
  assert.doesNotMatch(user.content, /END-TEXT|END-CONTEXT|\{\{text\}\}/);
  const data = JSON.parse(user.content);
  assert.equal(data.passage.length, 1500);
  assert.equal(data.context.length, 2500);
  assert.match(data.guidance[1], /Study .*简体中文/s);
});

test("saveable suggestions retain original wording and model provenance and reject invented, incomplete or oversized output", () => {
  const [first] = parse([row, row]);
  assert.equal(parse([row, row]).length, 1);
  assert.equal(first.note.source, row.term);
  assert.equal(first.note.excerpt, input.text);
  assert.equal(first.note.model, "vocab");
  assert.equal(first.note.sourceApp, "Reader");
  assert.equal(first.note.notebook, "生词本");
  assert.equal(JSON.parse(first.note.result).释义, row.result.释义);
  assert.deepEqual(parse([]), []);
  assert.throws(() => parse([{ ...row, term: "invented" }]));
  assert.throws(() => parse([{ ...row, result: {} }]));
  assert.throws(() => parse([row, row, row]));
  const custom = {
    ...action,
    id: "my-command",
    outputSchema: undefined,
    layout: undefined,
    sample: undefined,
    notebook: "My book",
    format: "markdown" as const,
  };
  const source = JSON.stringify({
    notes: [{ ...row, result: "**Use** this word" }],
  });
  const [next] = parseSuggestions(source, custom, input, "", "note-model");
  assert.equal(next.note.notebook, "My book");
  assert.equal(next.note.result, "**Use** this word");
  const [revised] = parseSuggestions(
    JSON.stringify({
      notes: [
        { ...row, result: { revision: "detour", explanation: "名词。" } },
      ],
    }),
    { ...custom, format: "writing" },
    input,
    "",
    "note-model",
  );
  assert.equal(JSON.parse(revised.note.result).revision, "detour");
});

test("invalid suggestion JSON never enters the shared cache; a valid empty result can be reused", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      choices: [
        { message: { content: ++calls === 1 ? "broken" : '{"notes":[]}' } },
      ],
    }),
  );
  const c = new CompletionCache();
  const p = {
    ...defaultConfig().providers[0],
    model: "note-model",
    requiresKey: false,
  };
  const run = () =>
    c.run(
      p,
      [],
      undefined,
      new AbortController().signal,
      () => {},
      false,
      (raw) => {
        parseSuggestions(raw, action, input, "", p.model);
      },
    );
  await assert.rejects(run);
  await run();
  await run();
  assert.equal(calls, 2);
});

test("existing SQLite notes survive excerpt migration and accepting recommendations is atomic and idempotent", async () => {
  const file = path.join(
    await mkdtemp(path.join(os.tmpdir(), "readfinch-excerpts-")),
    "notes.sqlite",
  );
  const legacy = new DatabaseSync(file);
  legacy.exec(
    "CREATE TABLE notes (id TEXT PRIMARY KEY, created INTEGER NOT NULL, notebook TEXT NOT NULL, actionId TEXT NOT NULL, actionName TEXT NOT NULL, format TEXT NOT NULL, source TEXT NOT NULL, result TEXT NOT NULL, sourceApp TEXT NOT NULL, model TEXT NOT NULL, targetLanguage TEXT NOT NULL)",
  );
  legacy.exec(
    "INSERT INTO notes VALUES ('old', 1, 'Legacy', 'dictionary', '词典', 'dictionary', 'legacy word', '{}', '', '', '')",
  );
  legacy.close();
  const db = new LocalNotes(file);
  const entries = parse([row, { ...row, term: "encounter" }]).map(
    (n) => n.note,
  );
  assert.equal(db.get("old")?.source, "legacy word");
  assert.throws(() => db.saveMany([entries[0], { ...entries[1], source: "" }]));
  assert.equal(
    db.list({ offset: 0, notebook: "", search: "serendipitous" }).total,
    0,
  );
  const ids = db.saveMany(entries);
  assert.deepEqual(db.saveMany(entries), ids);
  db.close();
  const again = new LocalNotes(file);
  assert.equal(
    again.list({ offset: 0, notebook: "生词本", search: "serendipitous" })
      .total,
    2,
  );
  assert.equal(again.get(ids[0])?.excerpt, input.text);
  assert.equal(again.get("old")?.excerpt, "");
  again.close();
});
