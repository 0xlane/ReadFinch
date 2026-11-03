import { useEffect, useRef, useState } from "react";
import {
  Copy,
  GripVertical,
  Pencil,
  Pin,
  Play,
  Plus,
  Settings2,
  Table2,
  Trash2,
} from "lucide-react";
import { actionLabel, t } from "../shared/i18n";
import { type Action, type Config } from "../shared/config";
import {
  builtinId,
  definition,
  templateIds,
  templateInfo,
  type TemplateId,
} from "../shared/action-templates";
import { NotebaseConnection } from "./NotebaseConnection";
import { LanguageSelect } from "./ui";
import { CommandIconPicker } from "./CommandIconPicker";
import { ActionIcon, Field } from "./ui";
import { ProviderSelect } from "./ProviderSelect";
import { ProviderSwitch } from "./provider-ui";
import { ActionDialog, ActionFields, TextTokens } from "./ActionFields";
import { ActionLayoutEditor } from "./ActionLayoutEditor";
import { ActionAIHelper } from "./ActionAIHelper";
import "./commands.css";

export function Actions({
  config,
  onChange,
  test,
  createRequest = 0,
  focusId,
  focusRequest,
}: {
  config: Config;
  onChange: (c: Config) => void;
  test: (id: string) => Promise<void>;
  createRequest?: number;
  focusId?: string;
  focusRequest?: number;
}) {
  const [selected, setSelected] = useState("dictionary"),
    [tab, setTab] = useState<"config" | "notes">("config");
  const [dialog, setDialog] = useState<"templates" | "delete" | null>(null),
    [error, setError] = useState("");
  const consumed = useRef(0),
    nameInput = useRef<HTMLInputElement>(null),
    dragging = useRef(""),
    top = useRef<HTMLDivElement>(null);
  const translate = config.actions.find((a) => a.id === "translate");
  const items = config.actions.filter((a) => a.id !== "translate"),
    current =
      config.actions.find((a) => a.id === selected) ?? items[0] ?? translate;
  const locked =
    current &&
    builtinId(current.id) &&
    !current.legacyEditable &&
    !!current.outputSchema;
  const full = config.actions.length >= 100;
  function select(id: string) {
    setSelected(id);
    setTab("config");
    setError("");
    setDialog(null);
    requestAnimationFrame(() => {
      if (top.current && top.current.getBoundingClientRect().top < 50)
        top.current.scrollIntoView({ block: "start" });
    });
  }
  function change(id: string, patch: Partial<Action>) {
    onChange({
      ...config,
      actions: config.actions.map((a) =>
        a.id === id ? { ...a, ...patch } : a,
      ),
    });
  }
  const update = (patch: Partial<Action>) => change(current.id, patch);
  function create(kind: TemplateId, copy?: Action) {
    if (full) return;
    const base = copy
      ? actionLabel(copy) + t(" · 副本")
      : kind === "blank"
        ? t("新指令")
        : t(templateInfo[kind].name);
    const names = new Set(items.map((a) => a.name));
    let name = base;
    for (let n = 2; names.has(name); n++) name = base + " " + n;
    const next: Action = {
      providerId: null,
      enabled: true,
      ...(copy ? structuredClone(copy) : definition(kind)),
      id: crypto.randomUUID(),
      legacyEditable: undefined,
      noteConnection: undefined,
      notebook: undefined,
      noteLabels: undefined,
      noteTitleField: undefined,
      name,
      shortcut: "",
      pinned: false,
    };
    onChange({ ...config, actions: [...config.actions, next] });
    select(next.id);
    requestAnimationFrame(() => {
      nameInput.current?.focus({ preventScroll: true });
      nameInput.current?.select();
    });
  }
  useEffect(() => {
    if (createRequest && consumed.current !== createRequest) {
      consumed.current = createRequest;
      setDialog("templates");
    }
  }, [createRequest]);
  useEffect(() => {
    if (focusId && config.actions.some((a) => a.id === focusId))
      select(focusId);
  }, [focusId, focusRequest]);
  function move(id: string, to: string) {
    if (id === to || builtinId(id) || builtinId(to)) return;
    const actions = [...config.actions],
      i = actions.findIndex((a) => a.id === id),
      j = actions.findIndex((a) => a.id === to);
    if (i < 0 || j < 0) return;
    actions.splice(j, 0, ...actions.splice(i, 1));
    onChange({ ...config, actions });
  }
  function rail(a: Action) {
    const custom = !builtinId(a.id) && a.id !== "translate";
    return (
      <div
        key={a.id}
        className="command-choice"
        data-selected={a.id === current?.id}
        data-enabled={a.enabled}
        onDragOver={(e) => {
          if (custom && dragging.current) e.preventDefault();
        }}
        onDrop={(e) => {
          if (custom && dragging.current) {
            e.preventDefault();
            move(dragging.current, a.id);
            dragging.current = "";
          }
        }}
      >
        {custom && (
          <span
            className="command-grip"
            draggable
            tabIndex={0}
            role="button"
            aria-label={t("移动指令「{0}」", actionLabel(a))}
            title={t("拖动或使用上下方向键排序")}
            onDragStart={(e) => {
              dragging.current = a.id;
              e.dataTransfer.setData("text/plain", a.id);
            }}
            onDragEnd={() => (dragging.current = "")}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                const list = items.filter((i) => !builtinId(i.id)),
                  other =
                    list[
                      list.findIndex((i) => i.id === a.id) +
                        (e.key === "ArrowUp" ? -1 : 1)
                    ];
                if (other) move(a.id, other.id);
              }
            }}
          >
            <GripVertical size={14} />
          </span>
        )}
        <button
          aria-label={actionLabel(a)}
          aria-pressed={a.id === current?.id}
          onClick={() => select(a.id)}
        >
          <ActionIcon icon={a.icon} size={20} />
          <span>{actionLabel(a)}</span>
        </button>
        {a.id !== "translate" && (
          <ProviderSwitch
            label={t("启用 ") + actionLabel(a)}
            checked={a.enabled}
            onChange={(enabled) => change(a.id, { enabled })}
          />
        )}
      </div>
    );
  }
  return (
    <>
      <div className="command-section-heading">
        <h2>{t("指令配置")}</h2>
        <p>{t("为选中的文字添加结构化 AI 指令。")}</p>
      </div>
      <section aria-label={t("指令配置")} className="commands-workspace">
        <aside className="command-rail">
          <button
            className="provider-add"
            disabled={full}
            onClick={() => setDialog("templates")}
          >
            <Plus size={16} />
            {t("添加 AI 指令")}
          </button>
          {translate && (
            <>
              <h2>{t("划词工具")}</h2>
              {rail(translate)}
            </>
          )}
          {items.some((a) => !builtinId(a.id)) && (
            <>
              <h2>{t("我的指令")}</h2>
              {items.filter((a) => !builtinId(a.id)).map(rail)}
            </>
          )}
          {items.some((a) => builtinId(a.id)) && (
            <>
              <h2>{t("内置指令")}</h2>
              {items.filter((a) => builtinId(a.id)).map(rail)}
            </>
          )}
        </aside>
        {current ? (
          <div className="command-editor" key={current.id} ref={top}>
            <div
              className="command-tabs"
              role="tablist"
              aria-label={t("编辑指令")}
              onKeyDown={(e) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
                  return;
                e.preventDefault();
                const next =
                  e.key === "Home"
                    ? "config"
                    : e.key === "End"
                      ? "notes"
                      : tab === "config"
                        ? "notes"
                        : "config";
                setTab(next);
                document.getElementById("cmd-" + next + "-tab")?.focus();
              }}
            >
              <button
                role="tab"
                id="cmd-config-tab"
                aria-selected={tab === "config"}
                aria-controls="cmd-config"
                onClick={() => setTab("config")}
              >
                <Settings2 size={15} />
                {t("配置")}
              </button>
              <button
                role="tab"
                id="cmd-notes-tab"
                aria-selected={tab === "notes"}
                aria-controls="cmd-notes"
                onClick={() => setTab("notes")}
              >
                <Table2 size={15} />
                {t("笔记库")}
              </button>
            </div>
            <div
              hidden={tab !== "config"}
              role="tabpanel"
              id="cmd-config"
              aria-labelledby="cmd-config-tab"
            >
              {current.id === "translate" ? (
                <div className="command-fields">
                  <p className="hint">
                    {t("划词工具栏和翻译快捷键共用这些设置。")}
                  </p>
                  <Field label={t("翻译提供商")}>
                    <ProviderSelect
                      config={config}
                      value={current.providerId}
                      emptyLabel={t("默认提供商")}
                      label={t("翻译提供商")}
                      onChange={(id) => update({ providerId: id })}
                    />
                  </Field>
                  <Field label={t("目标语言")}>
                    <LanguageSelect
                      label={t("目标语言")}
                      value={config.defaults.targetLanguage}
                      onChange={(targetLanguage) =>
                        onChange({
                          ...config,
                          defaults: { ...config.defaults, targetLanguage },
                        })
                      }
                    />
                  </Field>
                  <button
                    className="text-button"
                    onClick={() =>
                      void window.readfinch.call("settingsOpen", {
                        tab: "shortcuts",
                      })
                    }
                  >
                    {t("配置快捷键")}
                    {current.shortcut && " · " + current.shortcut}
                  </button>
                </div>
              ) : (
                <div className="command-fields">
                  <div className="field">
                    <div className="section-line">
                      <label htmlFor="cmd-name">{t("名称")}</label>
                      {locked ? (
                        <button
                          className="secondary compact"
                          disabled={full}
                          onClick={() => create("blank", current)}
                        >
                          <Pencil size={13} />
                          {t("定制化")}
                        </button>
                      ) : (
                        <ActionAIHelper action={current} config={config} />
                      )}
                    </div>
                    <input
                      id="cmd-name"
                      aria-label={t("指令名称")}
                      ref={nameInput}
                      readOnly={locked}
                      value={locked ? actionLabel(current) : current.name}
                      maxLength={80}
                      onChange={(e) => update({ name: e.target.value })}
                      onBlur={() => {
                        if (!current.name.trim()) update({ name: t("新指令") });
                      }}
                    />
                  </div>
                  <fieldset disabled={locked} className="plain-fieldset">
                    <CommandIconPicker
                      value={current.icon}
                      onChange={(icon) => update({ icon })}
                    />
                  </fieldset>
                  <div className="field">
                    <span className="field-label">
                      {t("提供商（需支持结构化输出）")}
                    </span>
                    <ProviderSelect
                      config={config}
                      value={current.providerId}
                      label={t("指令使用的提供商")}
                      emptyLabel={t("跟随默认提供商")}
                      onChange={(providerId) => update({ providerId })}
                    />
                  </div>
                  <TextTokens
                    label={t("系统提示词")}
                    value={current.system}
                    locked={locked}
                    change={(system) => update({ system })}
                  />
                  <TextTokens
                    label={t("提示词")}
                    value={current.prompt}
                    locked={locked}
                    change={(prompt) => update({ prompt })}
                    rows={3}
                  />
                  {current.outputSchema ? (
                    <>
                      <ActionFields
                        action={current}
                        locked={locked}
                        update={update}
                      />
                      <ActionLayoutEditor
                        action={current}
                        locked={locked}
                        update={update}
                        customize={() => create("blank", current)}
                        canCustomize={!full}
                      />
                    </>
                  ) : (
                    <section className="legacy-output">
                      <h3>{t("输出 Schema")}</h3>
                      <p className="hint">
                        {t(
                          "这条旧指令沿用原来的输出格式。添加 Schema 后，可逐项定义模型返回的字段。",
                        )}
                      </p>
                      <button
                        className="secondary compact"
                        onClick={() => {
                          const { outputSchema, layout, sample } =
                            definition("blank");
                          update({ outputSchema, layout, sample });
                        }}
                      >
                        <Plus size={14} />
                        {t("配置输出字段")}
                      </button>
                    </section>
                  )}
                </div>
              )}
            </div>
            <div
              hidden={tab !== "notes"}
              role="tabpanel"
              id="cmd-notes"
              aria-labelledby="cmd-notes-tab"
            >
              <NotebaseConnection
                key={current.id}
                action={current}
                config={config}
                onChange={onChange}
              />
            </div>
            {error && (
              <div role="alert" className="alert error">
                {error}
              </div>
            )}
            <footer className="command-footer">
              {current.id !== "translate" && (
                <button
                  className="secondary compact"
                  disabled={full}
                  onClick={() => create("blank", current)}
                >
                  <Copy size={13} />
                  {t("复制")}
                </button>
              )}
              <button
                className="text-button"
                disabled={!current.enabled}
                onClick={() =>
                  void test(current.id).catch((e) => setError(e.message))
                }
              >
                <Play size={13} />
                {t("试用指令")}
              </button>
              <span className="grow" />
              <button
                className="icon-button"
                title={t("固定到工具栏")}
                aria-label={t("固定到工具栏")}
                aria-pressed={current.pinned}
                onClick={() => update({ pinned: !current.pinned })}
              >
                <Pin size={15} />
              </button>
              {current.id !== "translate" && !builtinId(current.id) && (
                <button
                  className="secondary compact danger"
                  aria-label={t("删除指令")}
                  onClick={() => setDialog("delete")}
                >
                  <Trash2 size={13} />
                  {t("删除")}
                </button>
              )}
            </footer>
          </div>
        ) : (
          <div className="notes-empty">
            <h2>{t("添加第一条指令")}</h2>
          </div>
        )}
        {dialog === "templates" && (
          <ActionDialog title={t("添加指令")} close={() => setDialog(null)}>
            <p className="hint">{t("选择一个模板作为起点。")}</p>
            <div className="template-choices">
              {templateIds.map((k) => (
                <button
                  key={k}
                  aria-label={t(templateInfo[k].name)}
                  onClick={() => create(k)}
                >
                  <span className="template-icon">
                    {k === "blank" ? (
                      <Plus size={18} />
                    ) : (
                      <ActionIcon icon={templateInfo[k].icon} size={22} />
                    )}
                  </span>
                  <span>
                    <strong>{t(templateInfo[k].name)}</strong>
                    <small>{t(templateInfo[k].description)}</small>
                  </span>
                </button>
              ))}
            </div>
          </ActionDialog>
        )}
        {dialog === "delete" && (
          <ActionDialog title={t("删除指令？")} close={() => setDialog(null)}>
            <p>{actionLabel(current)}</p>
            <footer>
              <button className="secondary" onClick={() => setDialog(null)}>
                {t("取消")}
              </button>
              <button
                className="secondary danger"
                onClick={() => {
                  onChange({
                    ...config,
                    noteSuggestion:
                      config.noteSuggestion.actionId === current.id
                        ? { ...config.noteSuggestion, actionId: null }
                        : config.noteSuggestion,
                    actions: config.actions.filter((a) => a.id !== current.id),
                  });
                  select("dictionary");
                }}
              >
                {t("确认删除")}
              </button>
            </footer>
          </ActionDialog>
        )}
      </section>
    </>
  );
}
