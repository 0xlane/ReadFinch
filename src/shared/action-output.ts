import { z } from "zod";
import { t } from "./i18n";

const fieldId = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[\w-]+$/);
export function fieldNameError(name: string) {
  if (!name.trim()) return t("请输入字段名");
  if (
    ["ctx", "forloop", "__proto__", "constructor", "prototype"].includes(
      name.trim(),
    )
  )
    return t("此名称已被版式保留");
  return "";
}
export const OutputFieldSchema = z.strictObject({
  id: fieldId,
  name: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine((name) => !fieldNameError(name)),
  type: z.enum(["string", "number"]),
  source: z.enum(["model", "selection"]),
  description: z.string().max(2000),
});
export type OutputField = z.infer<typeof OutputFieldSchema>;
export const OutputSchema = z
  .array(OutputFieldSchema)
  .min(1)
  .max(64)
  .superRefine((fields, ctx) => {
    if (
      new Set(fields.map((f) => f.id)).size !== fields.length ||
      new Set(fields.map((f) => f.name)).size !== fields.length
    )
      ctx.addIssue({ code: "custom", message: t("字段名和 ID 必须唯一") });
    if (!fields.some((f) => f.source === "model"))
      ctx.addIssue({
        code: "custom",
        message: t("至少保留一个由 AI 生成的字段"),
      });
    if (fields.some((f) => f.source === "selection" && f.type !== "string"))
      ctx.addIssue({ code: "custom", message: t("原文字段必须是字符串") });
  });
export const LayoutSchema = z.string().max(32768);
export const SampleSchema = z.strictObject({
  selection: z.string().max(6000),
  targetLanguage: z.string().max(80),
  values: z.record(
    fieldId,
    z.union([z.string().max(6000), z.number(), z.null()]),
  ),
});
export type OutputSample = z.infer<typeof SampleSchema>;
export const OutputViewSchema = z.strictObject({
  outputSchema: OutputSchema,
  layout: LayoutSchema.optional(),
});
export type OutputView = z.infer<typeof OutputViewSchema>;
export type FieldValues = Record<string, string | number | null>;

export function jsonContract(
  fields: OutputField[],
  expand: (s: string) => string = (s) => s,
) {
  const model = fields.filter((f) => f.source === "model");
  return {
    type: "object",
    additionalProperties: false,
    required: model.map((f) => f.name),
    properties: Object.fromEntries(
      model.map((f) => [
        f.name,
        { type: [f.type, "null"], description: expand(f.description) },
      ]),
    ),
  };
}
export function validateOutput(
  value: unknown,
  fields: OutputField[],
): FieldValues {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error(t("模型须返回一个 JSON 对象"));
  const data = value as Record<string, unknown>;
  const model = fields.filter((f) => f.source === "model");
  for (const f of model) {
    if (!Object.hasOwn(data, f.name))
      throw Error(t("模型结果缺少字段「{0}」", f.name));
    const v = data[f.name];
    if (
      v !== null &&
      (typeof v !== f.type || (typeof v === "number" && !Number.isFinite(v)))
    )
      throw Error(t("字段「{0}」的类型应为 {1}", f.name, f.type));
  }
  if (Object.keys(data).length !== model.length)
    throw Error(t("模型返回了 Schema 以外的字段"));
  return data as FieldValues;
}
function jsonBody(text: string) {
  return text
    .trimStart()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "");
}
export function parseOutput(text: string, fields: OutputField[]) {
  let value: unknown;
  try {
    value = JSON.parse(jsonBody(text));
  } catch {
    throw Error(t("模型未返回完整的 JSON 对象，请重试或检查提示词"));
  }
  return validateOutput(value, fields);
}
// Only consume consecutive top-level key/value pairs. A half-written escape must
// never make the visible prefix disappear or create a spurious nested field.
export function streamingValues(text: string): FieldValues {
  const body = jsonBody(text);
  if (!body.startsWith("{")) return {};
  const output: FieldValues = Object.create(null);
  const pair =
    /\s*"((?:[^"\\]|\\.)*)"\s*:\s*(?:"((?:[^"\\]|\\.)*)("|\\?$)|(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?)|(?:null))/iy;
  pair.lastIndex = 1;
  let match: RegExpExecArray | null;
  while ((match = pair.exec(body))) {
    try {
      const name = JSON.parse('"' + match[1] + '"');
      let part = match[2];
      if (part !== undefined && match[3] !== '"')
        part = part.replace(/(?<!\\)(?:\\\\)*\\u[\da-f]{0,3}$/i, (m) =>
          m.slice(0, m.lastIndexOf("\\u")),
        );
      output[name] =
        part !== undefined
          ? JSON.parse('"' + part + '"')
          : match[4]
            ? Number(match[4])
            : null;
    } catch {
      break;
    }
    const comma = /^\s*,/.exec(body.slice(pair.lastIndex));
    if (!comma) break;
    pair.lastIndex += comma[0].length;
  }
  return output;
}
export function displayFields(
  fields: OutputField[],
  values: FieldValues,
  selection: string,
) {
  return fields.map((f) => ({
    ...f,
    value:
      f.source === "selection"
        ? selection
        : Object.hasOwn(values, f.name)
          ? values[f.name]
          : null,
  }));
}
export function snapshotOutput(action: {
  outputSchema?: OutputField[];
  layout?: string;
}): OutputView | undefined {
  return action.outputSchema
    ? { outputSchema: action.outputSchema, layout: action.layout }
    : undefined;
}
export function fieldExpression(name: string) {
  return "[" + JSON.stringify(name) + "]";
}
export const defaultLayout = `{% for f in ctx.fields %}{% if f.value != nil and f.value != "" %}
<section><small>{{ f.name }}</small><p>{{ f.value }}</p></section>
{% endif %}{% endfor %}`;
export function renameLayoutField(
  layout: string,
  oldName: string,
  newName: string,
) {
  // Change variable references inside Liquid tags only. Leave HTML, quoted
  // comparison literals and local loop keys (f.name) alone.
  return layout.replace(/{{[\s\S]*?}}|{%[\s\S]*?%}/g, (tag) =>
    tag.replace(
      /\[\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\s*\]|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[\p{L}_][\p{L}\p{N}_-]*/gu,
      (token, quoted: string | undefined, index: number) => {
        if (quoted) {
          let key: string;
          try {
            key =
              quoted[0] === '"'
                ? JSON.parse(quoted)
                : quoted.slice(1, -1).replace(/\\(['\\])/g, "$1");
          } catch {
            return token;
          }
          return key === oldName && !/[\w.)\]]/.test(tag[index - 1] ?? "")
            ? fieldExpression(newName)
            : token;
        }
        return token === oldName &&
          tag[index - 1] !== "." &&
          !/[|.:]\s*$/.test(tag.slice(0, index))
          ? fieldExpression(newName)
          : token;
      },
    ),
  );
}
