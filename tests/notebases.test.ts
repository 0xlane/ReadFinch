import test from "node:test";
import assert from "node:assert/strict";
import { defaultConfig, parseConfig, type Action } from "../src/shared/config";
import {
  connectNotebase,
  connectedBook,
  createNotebase,
  legacyBookId,
  type LocalNotebase,
} from "../src/shared/notebases";
import { mapNoteToBook, type NoteInput } from "../src/shared/notes";
import { LocalNotes } from "../src/core/local-notes";
import { snapshotOutput } from "../src/shared/action-output";

const base = defaultConfig();
const action: Action = {
  ...base.actions[1],
  id: "example",
  name: "精读",
  outputSchema: [
    {
      id: "term",
      name: "原文",
      type: "string",
      source: "selection",
      description: "",
    },
    {
      id: "meaning",
      name: "释义",
      type: "string",
      source: "model",
      description: "",
    },
    {
      id: "score",
      name: "分数",
      type: "number",
      source: "model",
      description: "",
    },
  ],
  layout: undefined,
  sample: undefined,
  shortcut: "",
};
const cfg = { ...base, actions: [...base.actions, action] };
const result: NoteInput = {
  actionId: action.id,
  actionName: action.name,
  outputView: snapshotOutput(action),
  notebook: "旧名称",
  format: "markdown",
  source: "read",
  result: '{"释义":"阅读","分数":0}',
  sourceApp: "Reader",
  model: "fixture",
  targetLanguage: "中文",
};

test("new books bind stable typed columns, preserve zero and allow multiple actions to share one destination", () => {
  const next = createNotebase(
    cfg,
    action,
    "阅读",
    { score: "评分" },
    "meaning",
  );
  const current = next.actions.at(-1)!,
    book = connectedBook(next, current)!;
  assert.equal(book.columns[0].name, "释义");
  const saved = mapNoteToBook(next, current, result);
  assert.equal(saved.title, "阅读");
  assert.equal(saved.cells![current.noteConnection!.mappings.score!], 0);
  const renamed = {
    ...book,
    name: "读书札记",
    columns: book.columns.map((c) => ({
      ...c,
      name: c.name === "评分" ? "等级" : c.name,
    })),
  };
  const renamedCfg = { ...next, localNotebases: [renamed] };
  const updated = mapNoteToBook(renamedCfg, current, result);
  assert.equal(updated.notebaseId, saved.notebaseId);
  assert.equal(updated.notebook, "读书札记");
  assert.equal(JSON.parse(updated.result).等级, 0);
  const second = {
    ...action,
    id: "copy",
    noteConnection: connectNotebase(action, renamed),
  };
  assert.equal(second.noteConnection.mappings.score, undefined);
  assert.equal(mapNoteToBook(renamedCfg, second, result).notebaseId, book.id);
  assert.throws(() => createNotebase(next, action, "阅读"));
  assert.equal(
    createNotebase(createNotebase(cfg, action), action).localNotebases.at(-1)!
      .name,
    "精读 2",
  );
});

test("mappings skip unselected fields and reject stale columns, duplicate targets and foreign accounts", () => {
  const next = createNotebase(cfg, action);
  const a = next.actions.at(-1)!,
    bind = a.noteConnection!,
    map = bind.mappings;
  const withMap = (mappings: typeof map) => ({
    ...a,
    noteConnection: { ...bind, mappings },
  });
  const partial = mapNoteToBook(
    next,
    withMap({ term: map.term, score: null }),
    result,
  );
  assert.deepEqual(Object.values(partial.cells!), ["read"]);
  assert.deepEqual(JSON.parse(partial.result), { 原文: "read" });
  for (const mappings of [
    { ...map, score: map.term },
    { ...map, term: "removed" },
    { ...map, meaning: map.term },
    { ...map, deleted: "a" },
    {},
  ])
    assert.throws(() => mapNoteToBook(next, withMap(mappings), result));
  const foreign = {
    ...a,
    noteConnection: { ...bind, providerId: "future-account" },
  };
  assert.equal(connectedBook(next, foreign), undefined);
  assert.throws(() => mapNoteToBook(next, foreign, result));
  const catalog: LocalNotebase = {
    ...next.localNotebases[0],
    columns: [
      { id: "unusable", name: "分数", type: "string" },
      { id: "matched", name: "  原文 ", type: "string" },
    ],
  };
  assert.deepEqual(connectNotebase(a, catalog).mappings, { term: "matched" });
});

test("freeform translation preserves its readable result and stores original and translation as separate cells", () => {
  const tr = cfg.actions.find((a) => a.id === "translate")!,
    next = createNotebase(cfg, tr),
    current = next.actions.find((a) => a.id === tr.id)!;
  const input = {
    ...result,
    actionId: "translate",
    outputView: undefined,
    result: "阅读",
  };
  const saved = mapNoteToBook(next, current, input);
  assert.equal(saved.result, "阅读");
  assert.equal(saved.outputView, undefined);
  assert.deepEqual(Object.values(saved.cells!), ["read", "阅读"]);
  const db = new LocalNotes(":memory:");
  try {
    const [id, duplicate] = db.saveMany([saved, saved]);
    assert.equal(id, duplicate);
    assert.deepEqual(db.get(id)?.cells, saved.cells);
  } finally {
    db.close();
  }
});

test("version 9 names and field aliases migrate; notes from deleted actions remain addressable by their original IDs", () => {
  const { localNotebases: _, ...old } = cfg;
  const customized = {
    ...action,
    notebook: "旧笔记",
    noteLabels: { score: "熟悉度" },
    noteTitleField: "meaning",
  };
  const legacyActions = base.actions.map((a) =>
    a.id === "dictionary"
      ? {
          ...a,
          layout: a.layout?.replace(
            /<button data-speak="[^<]*>♪<\/button>(?=<small>)/,
            "",
          ),
        }
      : a,
  );
  const upgraded = parseConfig({
    ...old,
    schemaVersion: 9,
    actions: [...legacyActions, customized],
  });
  assert.equal(
    upgraded.actions.find((a) => a.id === "dictionary")?.layout,
    base.actions.find((a) => a.id === "dictionary")?.layout,
  );
  const a = upgraded.actions.at(-1)!,
    book = connectedBook(upgraded, a)!;
  assert.equal(book.id, legacyBookId("旧笔记"));
  assert.equal(
    book.columns.find((c) => c.id === a.noteConnection!.mappings.score)?.name,
    "熟悉度",
  );
  assert.equal(mapNoteToBook(upgraded, a, result).title, "阅读");
  const db = new LocalNotes(":memory:");
  try {
    const id = db.save({ ...result, notebook: "已删除指令的旧库" });
    const recovered = db.legacyBooks(upgraded);
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0].columns.length, 3);
    db.indexLegacyBooks([...upgraded.localNotebases, ...recovered]);
    const query = {
      search: "",
      notebook: "",
      notebaseId: recovered[0].id,
      offset: 0,
    };
    assert.equal(db.list(query).notes[0].id, id);
    assert.equal(db.get(id)?.result, result.result);
    assert.deepEqual(db.legacyBooks(upgraded), []);
  } finally {
    db.close();
  }
});
