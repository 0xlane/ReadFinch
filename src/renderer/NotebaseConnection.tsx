import { useState } from "react";
import { ArrowRight, Database, Plus } from "lucide-react";
import type { Action, Config } from "../shared/config";
import {
  connectedBook,
  connectNotebase,
  createNotebase,
  noteFields,
} from "../shared/notebases";
import { t, actionLabel } from "../shared/i18n";
import { ActionDialog } from "./ActionFields";

export function NotebaseConnection({
  action,
  config,
  onChange,
}: {
  action: Action;
  config: Config;
  onChange: (c: Config) => void;
}) {
  const [creating, setCreating] = useState(false),
    [name, setName] = useState(""),
    [error, setError] = useState("");
  const [columnNames, setColumnNames] = useState<Record<string, string>>({}),
    [primary, setPrimary] = useState("");
  const binding = action.noteConnection,
    book = connectedBook(config, action),
    fields = noteFields(action);
  function update(patch: Partial<Action>) {
    onChange({
      ...config,
      actions: config.actions.map((a) =>
        a.id === action.id ? { ...a, ...patch } : a,
      ),
    });
  }
  const missing = !!binding && !book;
  return (
    <div className="command-fields notebook-mapping">
      <div>
        <h3>
          <Database size={16} /> {t("连接笔记库")}
        </h3>
        <p className="hint">
          {t("选择保存结果的笔记库，再为每个输出字段选择对应的列。")}
        </p>
      </div>
      <div className="book-picker-row">
        <select
          aria-label={t("选择笔记库")}
          value={missing ? "unavailable" : (book?.id ?? "")}
          onChange={(e) => {
            const next = config.localNotebases.find(
              (b) => b.id === e.target.value,
            );
            update({
              noteConnection: next ? connectNotebase(action, next) : undefined,
              noteTitleField: undefined,
            });
          }}
        >
          <option value="">{t("未连接")}</option>
          {missing && (
            <option value="unavailable" disabled>
              {t("连接的笔记库不可用，请重新选择")}
            </option>
          )}
          <optgroup label={t("本地笔记库")}>
            {config.localNotebases.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </optgroup>
        </select>
        <button
          className="secondary compact"
          onClick={() => {
            setError("");
            setName(actionLabel(action));
            setColumnNames({});
            setPrimary(fields[0].id);
            setCreating(true);
          }}
        >
          <Plus size={14} />
          {t("新建笔记库")}
        </button>
      </div>
      {!binding && (
        <p className="hint">
          {t("也可以在第一次保存结果时，用这条指令的字段创建笔记库。")}
        </p>
      )}
      {binding && book && (
        <section className="book-mappings">
          <h3>{t("字段映射")}</h3>
          <div className="book-map-line book-map-head">
            <span>{t("指令输出字段")}</span>
            <span />
            <span>{t("笔记库字段")}</span>
          </div>
          {fields.map((f) => {
            const current = binding.mappings[f.id];
            const choices = book.columns.filter(
              (c) =>
                c.type === f.type &&
                !Object.entries(binding.mappings).some(
                  ([id, col]) =>
                    id !== f.id &&
                    fields.some((v) => v.id === id) &&
                    col === c.id,
                ),
            );
            return (
              <label className="book-map-line" key={f.id}>
                <span>
                  {f.name}
                  <small>{t(f.type === "number" ? "数字" : "文本")}</small>
                </span>
                <ArrowRight size={13} />
                <select
                  aria-label={t("映射字段「{0}」", f.name)}
                  value={current === null ? "!skip" : (current ?? "")}
                  onChange={(e) => {
                    const mappings = { ...binding.mappings };
                    const value = e.target.value;
                    if (value)
                      mappings[f.id] = value === "!skip" ? null : value;
                    else delete mappings[f.id];
                    update({ noteConnection: { ...binding, mappings } });
                  }}
                >
                  <option value="">{t("选择字段")}</option>
                  <option value="!skip">{t("不保存此字段")}</option>
                  {current && !choices.some((c) => c.id === current) && (
                    <option value={current} disabled>
                      {t("字段已失效")}
                    </option>
                  )}
                  {choices.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
          {Object.entries(binding.mappings)
            .filter(([id, col]) => col && !fields.some((f) => f.id === id))
            .map(([id, col]) => (
              <div className="book-map-line" key={id}>
                <span>{t("指令字段已删除")}</span>
                <ArrowRight size={13} />
                <button
                  className="text-button"
                  onClick={() => {
                    const mappings = { ...binding.mappings };
                    delete mappings[id];
                    update({ noteConnection: { ...binding, mappings } });
                  }}
                >
                  {t("移除映射")} ·{" "}
                  {book.columns.find((c) => c.id === col)?.name ??
                    t("字段已失效")}
                </button>
              </div>
            ))}
          {fields.some((f) => binding.mappings[f.id] === undefined) && (
            <p className="hint">{t("未映射的字段不会写入笔记。")}</p>
          )}
        </section>
      )}
      {creating && (
        <ActionDialog title={t("新建笔记库")} close={() => setCreating(false)}>
          <label className="field">
            <span>{t("笔记库名称")}</span>
            <input
              autoFocus
              maxLength={80}
              aria-label={t("笔记库名称")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <p className="hint">
            {t("使用当前指令的输出字段建库，并自动连接。")}
          </p>
          <details className="book-create-fields">
            <summary>
              {t("笔记库字段")} · {fields.length}
            </summary>
            {fields.map((f) => (
              <label className="book-map-line" key={f.id}>
                <span>{f.name}</span>
                <ArrowRight size={13} />
                <input
                  maxLength={80}
                  aria-label={t("新建列「{0}」", f.name)}
                  value={columnNames[f.id] ?? f.name}
                  onChange={(e) =>
                    setColumnNames({ ...columnNames, [f.id]: e.target.value })
                  }
                />
              </label>
            ))}
            <label className="field">
              <span>{t("笔记标题")}</span>
              <select
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
              >
                {fields.map((f) => (
                  <option value={f.id} key={f.id}>
                    {columnNames[f.id] ?? f.name}
                  </option>
                ))}
              </select>
            </label>
          </details>
          {error && <p role="alert">{error}</p>}
          <footer>
            <button className="secondary" onClick={() => setCreating(false)}>
              {t("取消")}
            </button>
            <button
              className="primary"
              onClick={() => {
                try {
                  onChange(
                    createNotebase(config, action, name, columnNames, primary),
                  );
                  setCreating(false);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              {t("创建并连接")}
            </button>
          </footer>
        </ActionDialog>
      )}
    </div>
  );
}
