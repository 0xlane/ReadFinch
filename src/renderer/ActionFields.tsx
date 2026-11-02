import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import { t } from "../shared/i18n";
import type { Action } from "../shared/config";
import {
  fieldNameError,
  renameLayoutField,
  type OutputField,
} from "../shared/action-output";

export function ActionDialog({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => node.close();
  }, []);
  return (
    <dialog
      className="action-dialog"
      aria-labelledby={id}
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) {
          const b = dialog.current.getBoundingClientRect();
          if (
            e.clientX < b.left ||
            e.clientX > b.right ||
            e.clientY < b.top ||
            e.clientY > b.bottom
          )
            close();
        }
      }}
    >
      <header>
        <h2 id={id}>{title}</h2>
        <button className="icon-button" aria-label={t("关闭")} onClick={close}>
          <X size={16} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
const tokens = [
  ["selection", "选中的文字"],
  ["paragraphs", "补充上下文"],
  ["targetLanguage", "目标语言"],
  ["sourceLanguage", "源语言"],
  ["sourceApp", "来源应用"],
  ["explanationLanguage", "解释语言"],
] as const;
export function TextTokens({
  label,
  value,
  change,
  locked = false,
  rows = 4,
  limit = 16000,
}: {
  label: string;
  value: string;
  change: (s: string) => void;
  locked?: boolean;
  rows?: number;
  limit?: number;
}) {
  const area = useRef<HTMLTextAreaElement>(null),
    id = useId();
  return (
    <div className="action-prompt">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        ref={area}
        rows={rows}
        value={value}
        maxLength={limit}
        readOnly={locked}
        spellCheck={false}
        onChange={(e) => change(e.target.value)}
      />
      {!locked && (
        <div className="prompt-tokens">
          {tokens.map(([key, description]) => (
            <button
              key={key}
              type="button"
              title={t(description)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const a = area.current!,
                  token = "{{" + key + "}}",
                  start = a.selectionStart,
                  end = a.selectionEnd;
                if (value.length - (end - start) + token.length > limit) return;
                change(value.slice(0, start) + token + value.slice(end));
                requestAnimationFrame(() => {
                  a.focus();
                  a.setSelectionRange(
                    start + token.length,
                    start + token.length,
                  );
                });
              }}
            >
              {"{{" + key + "}}"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
export function ActionFields({
  action,
  locked,
  update,
}: {
  action: Action;
  locked: boolean;
  update: (changes: Partial<Action>) => void;
}) {
  const fields = action.outputSchema!;
  const [draft, setDraft] = useState<OutputField | null>(null),
    [deleting, setDeleting] = useState<OutputField | null>(null);
  const dragging = useRef(""),
    [dragOver, setDragOver] = useState("");
  const before = fields.find((f) => f.id === draft?.id);
  const validation =
    draft &&
    (fieldNameError(draft.name) ||
      (fields.some((f) => f.id !== draft.id && f.name === draft.name.trim())
        ? t("已有同名字段")
        : draft.source === "selection" &&
            !fields.some((f) => f.id !== draft.id && f.source === "model")
          ? t("至少保留一个由 AI 生成的字段")
          : ""));
  function commit() {
    if (!draft || validation) return;
    const next = {
      ...draft,
      name: draft.name.trim(),
      description: draft.source === "selection" ? "" : draft.description.trim(),
    };
    const outputSchema = before
      ? fields.map((f) => (f.id === next.id ? next : f))
      : [...fields, next];
    let sample = action.sample;
    if (
      sample &&
      (before?.type !== next.type || before?.source !== next.source)
    )
      sample = {
        ...sample,
        values: {
          ...sample.values,
          [next.id]: next.type === "number" ? 0 : "",
        },
      };
    update({
      outputSchema,
      sample,
      layout:
        before && action.layout && before.name !== next.name
          ? renameLayoutField(action.layout, before.name, next.name)
          : action.layout,
    });
    setDraft(null);
  }
  function move(id: string, index: number) {
    const from = fields.findIndex((f) => f.id === id);
    if (from < 0 || from === index || index < 0 || index >= fields.length)
      return;
    const next = [...fields];
    next.splice(index, 0, ...next.splice(from, 1));
    update({ outputSchema: next });
  }
  return (
    <section className="output-fields">
      <div className="section-line">
        <h3>{t("输出 Schema")}</h3>
        {!locked && (
          <button
            className="secondary compact"
            disabled={fields.length >= 64}
            onClick={() =>
              setDraft({
                id: crypto.randomUUID(),
                name: "",
                type: "string",
                source: "model",
                description: "",
              })
            }
          >
            <Plus size={14} />
            {t("添加字段")}
          </button>
        )}
      </div>
      <div className="schema-rows">
        {fields.map((f, i) => (
          <div
            className="schema-row"
            key={f.id}
            data-drag-over={dragOver === f.id}
            onDragOver={(e) => {
              if (dragging.current) {
                e.preventDefault();
                setDragOver(f.id);
              }
            }}
            onDrop={(e) => {
              if (!dragging.current) return;
              e.preventDefault();
              move(dragging.current, i);
              dragging.current = "";
              setDragOver("");
            }}
          >
            {!locked && (
              <span
                className="field-grip"
                role="button"
                tabIndex={0}
                draggable
                title={t("拖动或使用上下方向键排序")}
                aria-label={t("移动字段「{0}」", f.name)}
                onDragStart={(e) => {
                  dragging.current = f.id;
                  e.dataTransfer.setData("text/plain", f.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  dragging.current = "";
                  setDragOver("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                    e.preventDefault();
                    move(f.id, i + (e.key === "ArrowUp" ? -1 : 1));
                  }
                }}
              >
                <GripVertical size={15} />
              </span>
            )}
            <div className="schema-copy">
              <div>
                <strong>{f.name}</strong>
                <span className="type-tag">
                  {t(
                    f.source === "selection"
                      ? "选中的文字"
                      : f.type === "number"
                        ? "数字"
                        : "字符串",
                  )}
                </span>
              </div>
              <small title={f.description}>
                {f.source === "selection"
                  ? t("原样保存选中的文字。")
                  : f.description || t("暂无描述")}
              </small>
            </div>
            {!locked && (
              <div className="row-buttons">
                <button
                  className="icon-button"
                  aria-label={t("编辑字段「{0}」", f.name)}
                  onClick={() => setDraft({ ...f })}
                >
                  <Pencil size={14} />
                </button>
                <button
                  className="icon-button"
                  title={t("删除字段")}
                  aria-label={t("删除字段「{0}」", f.name)}
                  disabled={
                    f.source === "model" &&
                    fields.filter((f) => f.source === "model").length === 1
                  }
                  onClick={() => setDeleting(f)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {draft && (
        <ActionDialog
          title={t(before ? "编辑输出字段" : "添加输出字段")}
          close={() => setDraft(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              commit();
            }}
          >
            <label className="field">
              {t("字段名")}
              <input
                autoFocus
                maxLength={80}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder={t("字段名")}
              />
            </label>
            <label className="field">
              {t("字段类型")}
              <select
                aria-label={t("字段类型")}
                value={draft.source === "selection" ? "selection" : draft.type}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    source:
                      e.target.value === "selection" ? "selection" : "model",
                    type: e.target.value === "number" ? "number" : "string",
                  })
                }
              >
                <option value="string">{t("字符串")}</option>
                <option value="number">{t("数字")}</option>
                <option value="selection">{t("选中的文字")}</option>
              </select>
            </label>
            {draft.source === "selection" ? (
              <p className="hint">{t("原样保存选中的文字。")}</p>
            ) : (
              <TextTokens
                label={t("描述")}
                value={draft.description}
                limit={2000}
                change={(description) => setDraft({ ...draft, description })}
              />
            )}
            {validation && (draft.name || before) && (
              <small role="alert" className="form-error">
                {validation}
              </small>
            )}
            <footer>
              <button
                type="button"
                className="secondary"
                onClick={() => setDraft(null)}
              >
                {t("取消")}
              </button>
              <button className="primary" disabled={!!validation} type="submit">
                {t("保存")}
              </button>
            </footer>
          </form>
        </ActionDialog>
      )}
      {deleting && (
        <ActionDialog
          title={t("删除输出字段？")}
          close={() => setDeleting(null)}
        >
          <p>{t("将从本指令移除「{0}」。", deleting.name)}</p>
          <footer>
            <button className="secondary" onClick={() => setDeleting(null)}>
              {t("取消")}
            </button>
            <button
              className="secondary danger"
              onClick={() => {
                const values = { ...action.sample?.values },
                  noteLabels = { ...action.noteLabels };
                delete values[deleting.id];
                delete noteLabels[deleting.id];
                update({
                  outputSchema: fields.filter((f) => f.id !== deleting.id),
                  sample: action.sample && { ...action.sample, values },
                  noteLabels,
                  noteTitleField:
                    action.noteTitleField === deleting.id
                      ? undefined
                      : action.noteTitleField,
                });
                setDeleting(null);
              }}
            >
              {t("删除")}
            </button>
          </footer>
        </ActionDialog>
      )}
    </section>
  );
}
