import {
  lazy,
  Suspense,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Braces,
  ChevronRight,
  Moon,
  Pencil,
  Play,
  RotateCcw,
  Sun,
} from "lucide-react";
import type { Action } from "../shared/config";
import {
  defaultLayout,
  fieldExpression,
  type OutputSample,
} from "../shared/action-output";
import {
  definition,
  presetLayout,
  templateIds,
  templateInfo,
  type TemplateId,
} from "../shared/action-templates";
import { t } from "../shared/i18n";
import { localizedSample } from "../shared/action-samples";
import { SchemaResult } from "./SchemaResult";
import { ActionDialog } from "./ActionFields";
import type { LiquidHandle } from "./LiquidEditor";
import { unusedFields } from "./action-layout";
const LiquidEditor = lazy(() => import("./LiquidEditor"));

function resetSample(action: Action): OutputSample {
  const fields = action.outputSchema!;
  const kind =
    templateIds.find(
      (k) =>
        k !== "blank" &&
        fields.some((f) => f.id === definition(k).outputSchema[0].id),
    ) ?? "blank";
  const sample = action.sample
    ? localizedSample(
        kind,
        action.sample.targetLanguage,
        action.sample.explanationLanguage,
      )
    : definition(kind).sample;
  return {
    ...sample,
    values: Object.fromEntries(
      fields
        .filter((f) => f.source === "model")
        .map((f) => [
          f.id,
          f.type === "number" ? 1 : (sample.values[f.id] ?? t("示例文字")),
        ]),
    ),
  };
}
function Preview({
  action,
  update,
  locked,
}: {
  action: Action;
  update: (s: OutputSample) => void;
  locked: boolean;
}) {
  const [width, setWidth] = useState(500),
    [theme, setTheme] = useState<"light" | "dark" | null>(null),
    [replay, setReplay] = useState(0),
    [count, setCount] = useState<number | null>(null),
    [edit, setEdit] = useState(false);
  const [localSample, setLocalSample] = useState<OutputSample | null>(null),
    [draft, setDraft] = useState<OutputSample | null>(null);
  const fields = action.outputSchema!,
    sample = (locked && localSample) || action.sample || resetSample(action);
  const resolved =
    theme ??
    (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  const values = Object.fromEntries(
    fields
      .filter((f) => f.source === "model")
      .map((f) => [f.name, sample.values[f.id] ?? null]),
  );
  const json = JSON.stringify(values);
  useEffect(() => {
    setCount(null);
    if (!replay) return;
    let n = 0;
    setCount(0);
    const id = setInterval(() => {
      n += Math.max(1, Math.ceil(json.length / 40));
      if (n >= json.length) {
        clearInterval(id);
        setCount(null);
      } else setCount(n);
    }, 40);
    return () => clearInterval(id);
  }, [replay, json]);
  return (
    <div className="layout-preview">
      <div className="preview-controls">
        <span>{t("预览")}</span>
        <div className="mini-segment" aria-label={t("预览宽度")}>
          {[320, 500].map((w) => (
            <button
              key={w}
              aria-pressed={width === w}
              aria-label={w + " px"}
              onClick={() => setWidth(w)}
            >
              {w}
            </button>
          ))}
        </div>
        <div className="mini-segment">
          {(["light", "dark"] as const).map((m) => (
            <button
              key={m}
              aria-label={t(m === "dark" ? "深色预览" : "浅色预览")}
              aria-pressed={resolved === m}
              onClick={() => setTheme(m)}
            >
              {m === "dark" ? <Moon size={13} /> : <Sun size={13} />}
            </button>
          ))}
        </div>
        <button
          className="text-button"
          onClick={() => {
            setDraft(structuredClone(sample));
            setEdit(true);
          }}
        >
          <Braces size={14} />
          {t("示例数据")}
        </button>
        <button
          className="text-button"
          title={t("重放流式输出")}
          onClick={() => setReplay((n) => n + 1)}
        >
          <Play size={13} />
          {t("重放")}
        </button>
      </div>
      <div className="preview-stage" data-theme={resolved}>
        <div style={{ width }} className="preview-card" data-theme={resolved}>
          <SchemaResult
            view={{
              outputSchema: fields,
              layout: useDeferredValue(action.layout),
            }}
            text={count === null ? json : json.slice(0, count)}
            source={sample.selection}
            targetLanguage={sample.targetLanguage}
            finished={count === null}
            theme={resolved}
          />
        </div>
      </div>
      {edit && draft && (
        <ActionDialog title={t("示例数据")} close={() => setEdit(false)}>
          <p className="hint">
            {t(locked ? "用于当前预览。" : "示例随指令保存，用于预览版式。")}
          </p>
          <div className="sample-fields">
            <label className="field">
              {t("选中的文字")}
              <textarea
                aria-label={t("选中的文字")}
                maxLength={6000}
                rows={2}
                value={draft.selection}
                onChange={(e) =>
                  setDraft({ ...draft, selection: e.target.value })
                }
              />
            </label>
            <label className="field">
              {t("目标语言")}
              <input
                aria-label={t("目标语言")}
                maxLength={80}
                value={draft.targetLanguage}
                onChange={(e) =>
                  setDraft({ ...draft, targetLanguage: e.target.value })
                }
              />
            </label>
            {fields
              .filter((f) => f.source === "model")
              .map((f) => (
                <label key={f.id} className="field">
                  {f.name}
                  {f.type === "number" ? (
                    <input
                      aria-label={f.name}
                      type="number"
                      step="any"
                      value={draft.values[f.id] ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          values: {
                            ...draft.values,
                            [f.id]: Number.isFinite(e.target.valueAsNumber)
                              ? e.target.valueAsNumber
                              : null,
                          },
                        })
                      }
                    />
                  ) : (
                    <textarea
                      aria-label={f.name}
                      rows={2}
                      maxLength={6000}
                      value={draft.values[f.id] ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          values: { ...draft.values, [f.id]: e.target.value },
                        })
                      }
                    />
                  )}
                </label>
              ))}
          </div>
          <footer>
            <button
              className="text-button"
              onClick={() => setDraft(resetSample(action))}
            >
              {t("重置示例")}
            </button>
            <span className="grow" />
            <button className="secondary" onClick={() => setEdit(false)}>
              {t("取消")}
            </button>
            <button
              className="primary"
              onClick={() => {
                if (locked) setLocalSample(draft);
                else update(draft);
                setEdit(false);
              }}
            >
              {t("应用")}
            </button>
          </footer>
        </ActionDialog>
      )}
    </div>
  );
}
export function ActionLayoutEditor({
  action,
  locked,
  update,
  customize,
  canCustomize,
}: {
  action: Action;
  locked: boolean;
  update: (changes: Partial<Action>) => void;
  customize: () => void;
  canCustomize: boolean;
}) {
  const [open, setOpen] = useState(false),
    [sourceOpen, setSourceOpen] = useState(false),
    [reset, setReset] = useState<TemplateId | null>(null),
    [help, setHelp] = useState(false);
  const area = useRef<LiquidHandle>(null);
  const value = action.layout ?? defaultLayout,
    fields = action.outputSchema!,
    preview = (
      <Preview
        action={action}
        locked={locked}
        update={(sample) => update({ sample })}
      />
    );
  const unused = useMemo(
    () => (open ? unusedFields(value, fields) : []),
    [open, value, fields],
  );
  function insert(code: string) {
    area.current?.insert(code);
  }
  return (
    <section className="layout-field">
      <div className="section-line">
        <h3>{t("版式")}</h3>
        {!locked && (
          <button className="secondary compact" onClick={() => setOpen(true)}>
            <Pencil size={14} /> {t("编辑版式")}
          </button>
        )}
      </div>
      {locked ? (
        <div className="layout-built-in-hint">
          <span>
            {t("内置指令的版式不可编辑。点击「定制化」复制一份后再修改。")}
          </span>
          <button
            className="secondary compact assist"
            disabled={!canCustomize}
            onClick={customize}
          >
            {t("定制化")}
          </button>
        </div>
      ) : (
        <p className="hint">
          {t("使用 HTML + Liquid 排版，回答时字段会逐步填入。")}
        </p>
      )}
      {preview}
      {locked && (
        <div className="layout-source">
          <button
            className="text-button"
            aria-expanded={sourceOpen}
            onClick={() => setSourceOpen(!sourceOpen)}
          >
            <ChevronRight size={14} className={sourceOpen ? "expanded" : ""} />
            {t("查看源码")}
          </button>
          {sourceOpen && (
            <Suspense
              fallback={<div className="liquid-editor" aria-busy="true" />}
            >
              <LiquidEditor
                handle={area}
                fields={fields}
                locked
                value={value}
                onChange={() => {}}
              />
            </Suspense>
          )}
        </div>
      )}
      {open && (
        <ActionDialog
          title={t(locked ? "版式源码" : "编辑版式")}
          close={() => setOpen(false)}
        >
          <div className="layout-studio">
            <div className="layout-code">
              <div className="section-line">
                <h3>HTML + Liquid</h3>
                <button
                  className="text-button"
                  aria-expanded={help}
                  onClick={() => setHelp(!help)}
                >
                  {t("语法")}
                </button>
              </div>
              {help && (
                <p className="hint syntax-help">
                  {t(
                    "用 {{ 字段名 }} 读取值，用 {% if %} 判断条件。ctx.fields 按顺序提供 name、type 和 value。data-speak 可朗读指定文字。",
                  )}
                </p>
              )}
              {!locked && (
                <div className="layout-snippets">
                  <select
                    aria-label={t("插入字段")}
                    value=""
                    onChange={(e) => {
                      if (e.target.value)
                        insert("{{ " + fieldExpression(e.target.value) + " }}");
                    }}
                  >
                    <option value="">{t("插入字段")}</option>
                    {fields.map((f) => (
                      <option key={f.id}>{f.name}</option>
                    ))}
                  </select>
                  <select
                    aria-label={t("插入片段")}
                    value=""
                    onChange={(e) => {
                      if (e.target.value) insert(e.target.value);
                    }}
                  >
                    <option value="">{t("插入片段")}</option>
                    {[
                      [
                        t("有值时显示"),
                        "{% if " +
                          fieldExpression(fields[0].name) +
                          " %}\n\n{% endif %}",
                      ],
                      [t("所有字段"), defaultLayout],
                      [
                        t("朗读按钮"),
                        '<button data-speak="{{ ' +
                          fieldExpression(fields[0].name) +
                          ' }}">♪</button>',
                      ],
                      [t("选中的文字"), "{{ ctx.selection }}"],
                      [t("目标语言"), "{{ ctx.targetLanguage }}"],
                    ].map(([label, code]) => (
                      <option value={code} key={label}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <Suspense
                fallback={<div className="liquid-editor" aria-busy="true" />}
              >
                <LiquidEditor
                  handle={area}
                  fields={fields}
                  locked={locked}
                  value={value}
                  onChange={(layout) => update({ layout })}
                />
              </Suspense>
              {!!unused.length && (
                <div className="unused-fields">
                  <small>{t("未在版式中显示")}</small>
                  {unused.map((f) => (
                    <button
                      key={f.id}
                      disabled={locked}
                      onClick={() =>
                        insert("{{ " + fieldExpression(f.name) + " }}")
                      }
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              )}
              {!locked && (
                <label className="reset-layout">
                  <RotateCcw size={13} />
                  <select
                    aria-label={t("恢复默认版式")}
                    value=""
                    onChange={(e) => setReset(e.target.value as TemplateId)}
                  >
                    <option value="">{t("恢复默认版式")}</option>
                    {(["blank", "dictionary", "sentence", "polish"] as const)
                      .filter((k) => presetLayout(k, fields))
                      .map((k) => (
                        <option key={k} value={k}>
                          {t(k === "blank" ? "字段列表" : templateInfo[k].name)}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>
            {preview}
          </div>
          {reset && (
            <ActionDialog
              title={t("替换当前版式？")}
              close={() => setReset(null)}
            >
              <footer>
                <button className="secondary" onClick={() => setReset(null)}>
                  {t("取消")}
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    update({ layout: presetLayout(reset, fields) });
                    setReset(null);
                  }}
                >
                  {t("替换")}
                </button>
              </footer>
            </ActionDialog>
          )}
        </ActionDialog>
      )}
    </section>
  );
}
