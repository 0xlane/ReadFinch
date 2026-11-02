import { z } from "zod";
import {
  OutputViewSchema,
  parseOutput,
  snapshotOutput,
  renameLayoutField,
  fieldNameError,
} from "./action-output";
import type { Action } from "./config";
import {
  connectedBook,
  legacyBookName,
  noteFields,
  LOCAL_NOTES,
} from "./notebases";
import type { Config } from "./config";
import { t } from "./i18n";
import type { Interaction } from "./api";

export function noteSourceApp(session: Interaction | null) {
  if (session?.selection) return session.selection.app;
  if (session?.source === "image") return t("导入的图片");
  if (session?.source === "capture") return t("屏幕截图");
  if (session?.source === "clipboard") return t("剪贴板");
  return "";
}

export const notebookKey = legacyBookName;
export function notebookName(action: Action) {
  return t(notebookKey(action));
}
export const NoteInputSchema = z
  .object({
    notebook: z.string().trim().min(1).max(80),
    notebaseId: z.string().min(1).max(640).optional(),
    cells: z
      .record(
        z.string().max(100),
        z.union([z.string().max(1000000), z.number(), z.null()]),
      )
      .optional(),
    actionId: z.string().min(1).max(100),
    actionName: z.string().min(1).max(100),
    format: z.enum(["markdown", "dictionary", "writing"]),
    outputView: OutputViewSchema.optional(),
    title: z.string().max(250).optional(),
    source: z.string().min(1).max(100000),
    excerpt: z.string().max(100000).optional(),
    result: z.string().min(1).max(1000000),
    sourceApp: z.string().max(250),
    model: z.string().max(200),
    targetLanguage: z.string().max(80),
  })
  .strict();
export type NoteInput = z.infer<typeof NoteInputSchema>;
export function noteOutput(
  action: Action,
  source: string,
  raw: string,
): Pick<NoteInput, "result" | "outputView" | "title"> {
  const view = snapshotOutput(action);
  if (!view) return { result: raw };
  const values = parseOutput(raw, view.outputSchema);
  const titleField = view.outputSchema.find(
    (f) => f.id === action.noteTitleField,
  );
  const title =
    titleField &&
    (titleField.source === "selection" ? source : values[titleField.name]);
  const names = view.outputSchema.map(
    (f) => action.noteLabels?.[f.id] || f.name,
  );
  if (
    new Set(names).size !== names.length ||
    names.some((n) => fieldNameError(n))
  )
    throw Error(t("笔记字段名必须有效且唯一"));
  const fields = view.outputSchema.map((f, i) => ({ ...f, name: names[i] }));
  let layout = view.layout;
  const changes = view.outputSchema
    .map((f, i) => ({ from: f.name, to: names[i], temp: "_texthop_" + f.id }))
    .filter((c) => c.from !== c.to);
  if (layout) {
    for (const c of changes) {
      while (
        view.outputSchema.some((f) => f.name === c.temp) ||
        names.includes(c.temp) ||
        layout.includes(c.temp)
      )
        c.temp += "_";
      layout = renameLayoutField(layout, c.from, c.temp);
    }
    for (const c of changes) layout = renameLayoutField(layout, c.temp, c.to);
  }
  return {
    title:
      title === null || title === undefined
        ? undefined
        : String(title).slice(0, 250),
    outputView: { outputSchema: fields, layout },
    result: JSON.stringify(
      Object.fromEntries(
        view.outputSchema.flatMap((f, i) =>
          f.source === "model" ? [[names[i], values[f.name]]] : [],
        ),
      ),
    ),
  };
}
export function mapNoteToBook(
  config: Config,
  action: Action,
  input: NoteInput,
): NoteInput {
  const binding = action.noteConnection;
  if (!binding || binding.providerId !== LOCAL_NOTES)
    throw Error(t("请先连接可用的本地笔记库"));
  const book = connectedBook(config, action);
  if (!book) throw Error(t("连接的笔记库不可用，请重新选择"));
  const fields = noteFields(action);
  const values = action.outputSchema
    ? parseOutput(input.result, fields)
    : undefined;
  if (
    Object.entries(binding.mappings).some(
      ([id, col]) => col && !fields.some((f) => f.id === id),
    )
  )
    throw Error(t("字段映射已失效，请重新选择笔记库字段"));
  const mapped = fields.flatMap((f) => {
    const id = binding.mappings[f.id];
    if (!id) return [];
    const column = book.columns.find((c) => c.id === id);
    if (!column || column.type !== f.type)
      throw Error(t("字段映射已失效，请重新选择笔记库字段"));
    return [
      {
        field: f,
        column,
        value:
          f.source === "selection"
            ? input.source
            : values
              ? values[f.name]
              : input.result,
      },
    ];
  });
  if (!mapped.length) throw Error(t("至少映射一个要保存的字段"));
  if (new Set(mapped.map((m) => m.column.id)).size !== mapped.length)
    throw Error(t("同一笔记库字段只能映射一次"));
  const cells = Object.fromEntries(mapped.map((m) => [m.column.id, m.value]));
  const primary =
    mapped.find((m) => m.field.id === action.noteTitleField) ??
    mapped.find((m) => m.column.id === book.columns[0].id);
  const title =
    primary?.value == null ? undefined : String(primary.value).slice(0, 250);
  const labels = Object.fromEntries(
    mapped.map((m) => [m.field.id, m.column.name]),
  );
  const view =
    action.outputSchema && mapped.length === fields.length
      ? noteOutput(
          { ...action, noteLabels: labels },
          input.source,
          input.result,
        )
      : !action.outputSchema && mapped.length === fields.length
        ? { result: input.result, outputView: undefined }
        : {
            outputView: {
              outputSchema: mapped.map(({ field, column }) => ({
                ...field,
                name: column.name,
                source: "model" as const,
              })),
            },
            result: JSON.stringify(
              Object.fromEntries(mapped.map((m) => [m.column.name, m.value])),
            ),
          };
  return {
    ...input,
    ...view,
    title,
    notebook: book.name,
    notebaseId: book.id,
    cells,
  };
}
export const MAX_SUGGESTIONS = 2;
export type SuggestionCardData = {
  id: string;
  notebook: string;
  needsConnection?: boolean;
  items: { term: string; summary: string }[];
};
export type LocalNote = NoteInput & { id: string; created: number };
export type NoteSummary = Pick<
  LocalNote,
  "id" | "created" | "source" | "actionName" | "notebook"
>;
export type NoteQuery = {
  search: string;
  notebook: string;
  offset: number;
  notebaseId?: string;
  focusId?: string;
};
export type NotePage = {
  notes: NoteSummary[];
  total: number;
  notebooks: string[];
  destinations: { id: string; name: string }[];
  offset: number;
};
export const NOTE_PAGE_SIZE = 30;
