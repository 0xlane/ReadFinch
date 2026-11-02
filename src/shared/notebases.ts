import { z } from "zod";
import type { Action, Config } from "./config";
import { OutputFieldSchema, type OutputField } from "./action-output";
import { actionLabel, t } from "./i18n";

const bookId = z
  .string()
  .min(1)
  .max(640)
  .regex(/^[\w-]+$/);
const column = OutputFieldSchema.pick({ id: true, name: true, type: true });
export const LocalNotebaseSchema = z.strictObject({
  id: bookId,
  name: z.string().trim().min(1).max(80),
  columns: z
    .array(column)
    .min(1)
    .max(6400)
    .refine(
      (cs) =>
        new Set(cs.map((c) => c.id)).size === cs.length &&
        new Set(cs.map((c) => c.name)).size === cs.length,
    ),
});
export const NoteConnectionSchema = z.strictObject({
  // A future remote account has its own provider namespace and catalog.
  providerId: z.string().min(1).max(100),
  notebaseId: bookId,
  mappings: z.record(
    OutputFieldSchema.shape.id,
    OutputFieldSchema.shape.id.nullable(),
  ),
});
export type LocalNotebase = z.infer<typeof LocalNotebaseSchema>;
export type NoteConnection = z.infer<typeof NoteConnectionSchema>;
export const LOCAL_NOTES = "local";

export function noteFields(action: Action): OutputField[] {
  return (
    action.outputSchema ?? [
      {
        id: "selection",
        name: t("原文"),
        type: "string",
        source: "selection",
        description: "",
      },
      {
        id: "result",
        name: t(action.id === "translate" ? "译文" : "结果"),
        type: "string",
        source: "model",
        description: "",
      },
    ]
  );
}
export const normalizeColumn = (s: string) =>
  s.normalize("NFKC").trim().toLowerCase();

export function connectNotebase(
  action: Action,
  book: LocalNotebase,
): NoteConnection {
  const used = new Set<string>();
  const mappings: NoteConnection["mappings"] = {};
  for (const field of noteFields(action)) {
    const match = book.columns.find(
      (c) =>
        !used.has(c.id) &&
        c.type === field.type &&
        normalizeColumn(c.name) === normalizeColumn(field.name),
    );
    if (match) {
      mappings[field.id] = match.id;
      used.add(match.id);
    }
  }
  return { providerId: LOCAL_NOTES, notebaseId: book.id, mappings };
}
export function createNotebase(
  config: Config,
  action: Action,
  requestedName?: string,
  columnNames: Record<string, string> = {},
  titleFieldId?: string,
) {
  const base = (requestedName ?? actionLabel(action)).trim().slice(0, 80);
  if (!base) throw Error(t("请输入笔记库名称"));
  let name = base;
  for (
    let i = 2;
    config.localNotebases.some(
      (b) => normalizeColumn(b.name) === normalizeColumn(name),
    );
    i++
  ) {
    if (requestedName !== undefined) throw Error(t("已有同名笔记库"));
    const suffix = " " + i;
    name = base.slice(0, 80 - suffix.length) + suffix;
  }
  const fields = noteFields(action);
  const columns = fields.map((f) => ({
    id: crypto.randomUUID(),
    name: (columnNames[f.id] ?? f.name).trim(),
    type: f.type,
  }));
  if (
    new Set(columns.map((c) => c.name)).size !== columns.length ||
    columns.some((c) => !column.safeParse(c).success)
  )
    throw Error(t("笔记字段名必须有效且唯一"));
  const primaryIndex = fields.findIndex((f) => f.id === titleFieldId);
  const book = { id: crypto.randomUUID(), name, columns: [...columns] };
  if (primaryIndex > 0)
    book.columns.unshift(...book.columns.splice(primaryIndex, 1));
  const connection: NoteConnection = {
    providerId: LOCAL_NOTES,
    notebaseId: book.id,
    mappings: Object.fromEntries(fields.map((f, i) => [f.id, columns[i].id])),
  };
  return {
    ...config,
    localNotebases: [...config.localNotebases, book],
    actions: config.actions.map((a) =>
      a.id === action.id
        ? { ...a, noteConnection: connection, noteTitleField: undefined }
        : a,
    ),
  };
}
export function connectedBook(config: Config, action: Action) {
  const binding = action.noteConnection;
  return binding?.providerId === LOCAL_NOTES
    ? config.localNotebases.find((b) => b.id === binding.notebaseId)
    : undefined;
}
export function legacyBookName(action: Action) {
  return (
    action.notebook?.trim() ||
    (action.id === "dictionary"
      ? "生词本"
      : action.format === "writing"
        ? "写作摘录"
        : action.id === "translate"
          ? "翻译摘录"
          : "阅读摘录")
  );
}
export function legacyBookId(name: string) {
  return (
    "v9-" +
    Array.from(new TextEncoder().encode(name), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join("")
  );
}
export function migrateNoteConnections(actions: Action[]) {
  const books = new Map<string, LocalNotebase>();
  const migrated = actions.map((action) => {
    const name = legacyBookName(action);
    const book =
      books.get(name) ??
      ({ id: legacyBookId(name), name, columns: [] } as LocalNotebase);
    books.set(name, book);
    const binding: NoteConnection = {
      providerId: LOCAL_NOTES,
      notebaseId: book.id,
      mappings: {},
    };
    for (const f of noteFields(action)) {
      const label = action.noteLabels?.[f.id] || f.name;
      let c = book.columns.find((c) => c.name === label && c.type === f.type);
      if (!c) {
        let unique = label;
        for (let i = 2; book.columns.some((c) => c.name === unique); i++)
          unique = label.slice(0, 74) + " " + i;
        c = {
          id: "column-" + (book.columns.length + 1),
          name: unique,
          type: f.type,
        };
        book.columns.push(c);
      }
      binding.mappings[f.id] = c.id;
    }
    return { ...action, noteConnection: binding };
  });
  return { localNotebases: [...books.values()], actions: migrated };
}
