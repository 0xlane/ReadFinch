import { t, actionLabel } from "../shared/i18n";
import { useEffect, useState, useRef, type ReactNode } from "react";
import { catalogKey, suggestionAction, assignProvider } from "../shared/models";
import { ProviderSelect } from "./ProviderSelect";
import { Providers } from "./Providers";
import { SpeechSettings } from "./SpeechSettings";
import { OcrSettings } from "./OcrSettings";
import { ShortcutRecorder } from "./ShortcutRecorder";
import {
  Sun,
  Moon,
  Monitor,
  ShieldCheck,
  Download,
  Upload,
  Cloud,
  RefreshCw,
  Check,
  Trash2,
  KeyRound,
  ArrowRight,
  LoaderCircle,
} from "lucide-react";
import { type Config, ConfigSchema } from "../shared/config";
import { rebaseDraft, sameDraft } from "../shared/draft";
import type {
  Snapshot,
  ImportPreview,
  SyncResult,
  SettingsTab,
  SettingsLocation,
} from "../shared/api";
import { Field, Toggle, Badge, LanguageSelect } from "./ui";
import { LocalNotebook } from "./LocalNotebook";
import { Actions } from "./Actions";
type Tab = SettingsTab;
const cacheDurations = [
  [5, "5 分钟"],
  [30, "30 分钟"],
  [60, "1 小时"],
  [360, "6 小时"],
  [1440, "24 小时"],
] as const;

export function Settings({
  snapshot,
  onSnapshot,
  initialTab = "general",
  navigation,
}: {
  snapshot: Snapshot;
  onSnapshot: (s: Snapshot) => void;
  initialTab?: Tab;
  navigation?: SettingsLocation;
}) {
  const tab = initialTab;
  useEffect(() => {
    if (navigation?.target === "toolbar-settings")
      requestAnimationFrame(() =>
        document.getElementById("toolbar-settings")?.scrollIntoView(),
      );
  }, [navigation]);
  const [draft, setDraft] = useState(snapshot.config);
  const [busy, setBusy] = useState(false);
  const [catalogs, setCatalogs] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [visibleDraftKey, setVisibleDraftKey] = useState("");
  const keyScopes = useRef<Record<string, string>>({});
  const [imported, setImported] = useState<ImportPreview | null>(null);
  const [sync, setSync] = useState({ ...snapshot.sync, password: "" });
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [visionResult, setVisionResult] = useState({
    text: "",
    complete: false,
  });
  const visionJob = useRef("");
  const previousConfig = useRef(snapshot.config);
  const latest = useRef({ draft, snapshot, keys, sync });
  latest.current = { draft, snapshot, keys, sync };
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const [autoState, setAutoState] = useState("已保存");
  const [autoError, setAutoError] = useState("");
  const ocrSignature = JSON.stringify([
    draft.defaults.ocrProfileId,
    draft.providers.find((p) => p.id === draft.defaults.ocrProfileId),
  ]);
  useEffect(() => {
    if (visionJob.current) {
      void window.texthop.call("cancel", { id: visionJob.current });
      visionJob.current = "";
      setBusy(false);
    }
    setVisionResult({ text: "", complete: false });
  }, [ocrSignature]);
  useEffect(() => {
    const previous = previousConfig.current;
    setDraft((current) => rebaseDraft(current, previous, snapshot.config));
    previousConfig.current = snapshot.config;
  }, [snapshot.config]);
  useEffect(() => {
    setError("");
    setMessage("");
  }, [tab]);
  useEffect(
    () =>
      window.texthop.on("job", (event) => {
        if (event.id !== visionJob.current) return;
        if (event.text !== undefined || event.status === "done")
          setVisionResult((current) => ({
            text: event.text ?? current.text,
            complete: event.status === "done",
          }));
        if (event.status === "done") {
          visionJob.current = "";
          setBusy(false);
        }
        if (event.status === "error") {
          visionJob.current = "";
          setBusy(false);
          setError(event.message ?? t("图片能力测试失败"));
        }
      }),
    [],
  );
  async function perform<T>(
    fn: () => Promise<T>,
    success?: string,
  ): Promise<T | undefined> {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const value = await fn();
      if (success) setMessage(success);
      return value;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function save() {
    const operation = saveQueue.current
      .catch(() => {})
      .then(async () => {
        const { draft: value, snapshot: state } = latest.current;
        if (sameDraft(value, state.config)) return state;
        const valid = ConfigSchema.safeParse(value);
        if (!valid.success)
          throw Error(t("请补全设置：") + t(valid.error.issues[0].message));
        setAutoState("保存中…");
        setAutoError("");
        const result = await window.texthop.call("saveConfig", {
          config: value,
          revision: state.revision,
        });
        latest.current.snapshot = result;
        onSnapshot(result);
        setAutoState("已保存");
        return result;
      });
    saveQueue.current = operation;
    return operation;
  }
  const dirty = !sameDraft(draft, snapshot.config);
  const selectedSuggestionAction = suggestionAction(draft);
  useEffect(() => {
    if (!dirty) {
      setAutoState("已保存");
      setAutoError("");
      return;
    }
    setAutoState("待保存…");
    const timer = setTimeout(
      () =>
        void save().catch((error) => {
          setAutoState("待完善");
          setAutoError(error.message);
        }),
      400,
    );
    return () => clearTimeout(timer);
  }, [draft, snapshot.revision, dirty]);
  useEffect(() => {
    const pending = Object.entries(keys)
      .filter(([, value]) => value.length > 0)
      .map(([id, value]) => [id, value, keyScopes.current[id]] as const);
    if (!pending.length) return;
    setAutoState("待保存…");
    const timer = setTimeout(
      () =>
        void (async () => {
          await save();
          for (const [id, value, expectedScope] of pending) {
            const result = await window.texthop.call("saveCredential", {
              id,
              value,
              expectedScope,
            });
            onSnapshot(result);
            setKeys((current) =>
              current[id] === value ? { ...current, [id]: "" } : current,
            );
          }
          setAutoState("已保存");
          setAutoError("");
        })().catch((error) => {
          setAutoState("保存失败");
          setAutoError(error.message);
        }),
      650,
    );
    return () => clearTimeout(timer);
  }, [keys]);
  async function credential(id: string) {
    const value = latest.current.keys[id] ?? "";
    const result = await window.texthop.call("saveCredential", {
      id,
      value,
      expectedScope: keyScopes.current[id],
    });
    onSnapshot(result);
    setKeys((k) => (k[id] === value ? { ...k, [id]: "" } : k));
  }
  async function flushCredentials() {
    for (const [id, value] of Object.entries(latest.current.keys))
      if (value) await credential(id);
  }
  function keyField(id: string, testButton: ReactNode) {
    const saved = snapshot.credentialIds.includes(id);
    return (
      <div className="provider-key-field">
        <div className="provider-field-heading">
          <label htmlFor="provider-key">API Key</label>
          {testButton}
        </div>
        <div className="provider-key-input">
          <input
            id="provider-key"
            type={visibleDraftKey === id ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            aria-label={id + " API Key"}
            placeholder={saved ? "••••••••••••••••••••••••" : t("输入 API Key")}
            value={keys[id] ?? ""}
            onChange={(e) => {
              keyScopes.current[id] =
                draft.providers
                  .find((p) => "text:" + p.id === id)
                  ?.endpoint.replace(/\/+$/, "") ?? "missing";
              setKeys({ ...keys, [id]: e.target.value });
            }}
          />
          {saved && (
            <button
              className="icon-button"
              aria-label={t("移除凭据")}
              title={t("移除本机保存的密钥")}
              onClick={() =>
                void perform(async () => {
                  onSnapshot(
                    await window.texthop.call("saveCredential", {
                      id,
                      value: "",
                    }),
                  );
                  setKeys((current) => ({ ...current, [id]: "" }));
                })
              }
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
        <div className="provider-key-meta">
          <label title={t("仅显示本次输入的内容")}>
            <input
              type="checkbox"
              checked={visibleDraftKey === id}
              onChange={(e) => setVisibleDraftKey(e.target.checked ? id : "")}
            />
            {t("显示输入的密钥")}
          </label>
          {saved && <small>{t("已加密保存")}</small>}
        </div>
      </div>
    );
  }
  async function saveDav() {
    const source = latest.current.sync;
    const value = {
      enabled: source.enabled,
      url: source.url,
      username: source.username,
      remotePath: source.remotePath,
      ...(source.password ? { password: source.password } : {}),
    };
    const result = await window.texthop.call("saveSync", value);
    onSnapshot(result);
    setSync((current) =>
      rebaseDraft(current, source, { ...result.sync, password: "" }),
    );
    setAutoState("已保存");
    setAutoError("");
  }
  const syncDirty =
    sync.enabled !== snapshot.sync.enabled ||
    sync.url !== snapshot.sync.url ||
    sync.username !== snapshot.sync.username ||
    sync.remotePath !== snapshot.sync.remotePath ||
    !!sync.password;
  useEffect(() => {
    if (!syncDirty) return;
    setAutoState("待保存…");
    const timer = setTimeout(
      () =>
        void saveDav().catch((error) => {
          setAutoState("待完善");
          setAutoError(error.message);
        }),
      500,
    );
    return () => clearTimeout(timer);
  }, [sync, syncDirty]);
  const modelCatalog = {
    catalogs,
    fetchModels: async (id: string) => {
      const profile = latest.current.draft.providers.find((p) => p.id === id);
      if (!profile) throw Error(t("服务商不存在"));
      const key = catalogKey(profile);
      await save();
      await flushCredentials();
      const result = await window.texthop.call("listModels", { profileId: id });
      setCatalogs((current) => ({ ...current, [key]: result }));
      return result;
    },
  };
  const titles: Record<Tab, [string, string]> = {
    tts: [t("文本转语音"), t("选择不同语言使用的声音，并试听朗读效果。")],
    general: [t("通用"), t("调整外观、语言与划词方式。")],
    text: [
      t("API 提供商"),
      t("接入伴读雀调用的 AI 服务，并为每项功能指定使用哪一个。"),
    ],
    ocr: [t("截图识别"), t("内置离线识别，也可选择自己的视觉服务。")],
    actions: [
      t("自定义 AI 指令"),
      t("为划词工具栏配置 AI 指令，自定义提示词、输出字段和结果版式。"),
    ],
    notes: [t("本地笔记库"), ""],
    shortcuts: [t("快捷键"), t("为取词、截图和每个指令设置全局快捷键。")],
    config: [t("配置管理"), t("导入、导出、恢复备份与 WebDAV 同步。")],
  };
  if (tab === "notes")
    return (
      <LocalNotebook
        books={snapshot.config.localNotebases}
        key={navigation?.request}
        noteId={navigation?.noteId}
      />
    );
  return (
    <div
      className={
        "page settings-page" +
        (tab === "text" ||
        tab === "tts" ||
        tab === "ocr" ||
        tab === "shortcuts" ||
        tab === "actions"
          ? " providers-page"
          : "")
      }
    >
      <header className="page-heading">
        <div>
          <h1>{titles[tab][0]}</h1>
          <p>{titles[tab][1]}</p>
        </div>
        <span className="autosave-state" role="status">
          {autoState.includes("中") ? (
            <LoaderCircle size={13} className="spin" />
          ) : autoState === "已保存" ? (
            <Check size={13} />
          ) : null}
          {t(autoState)}
        </span>
      </header>
      <div aria-live="polite">
        {autoError &&
          !(tab === "shortcuts" && autoError.includes("快捷键")) && (
            <div className="alert error">{autoError}</div>
          )}
        {error && <div className="alert error">{t(error)}</div>}
        {message && <div className="alert success">{message}</div>}
      </div>
      {tab === "tts" && (
        <SpeechSettings
          config={draft}
          flush={save}
          value={draft.tts}
          onChange={(tts) => setDraft((c) => ({ ...c, tts }))}
        />
      )}
      {tab === "actions" && (
        <Actions
          config={draft}
          focusId={navigation?.actionId}
          focusRequest={navigation?.request}
          onChange={setDraft}
          createRequest={
            navigation?.target === "new-action" ? navigation.request : 0
          }
          test={async (actionId) => {
            await save();
            await window.texthop.call("panelOpen", {
              source: "action-test",
              actionId,
            });
          }}
        />
      )}
      {tab === "general" && (
        <>
          <section className="settings-card">
            <div className="section-heading">
              <div>
                <h3>{t("外观")}</h3>
                <p>{t("设置、划词工具栏和指令浮窗使用同一主题。")}</p>
              </div>
            </div>
            <div className="theme-options">
              {(
                [
                  ["light", t("浅色"), Sun],
                  ["dark", t("深色"), Moon],
                  ["system", t("跟随系统"), Monitor],
                ] as const
              ).map(([value, name, Icon]) => (
                <button
                  key={value}
                  className={
                    "theme-option " +
                    value +
                    (draft.appearance.theme === value ? " chosen" : "")
                  }
                  aria-pressed={draft.appearance.theme === value}
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      await save().catch(() => {});
                      const result = await window.texthop.call("setTheme", {
                        theme: value,
                      });
                      setDraft((current) => ({
                        ...current,
                        appearance: { ...current.appearance, theme: value },
                      }));
                      onSnapshot(result);
                    })
                  }
                >
                  <span className="theme-preview">
                    <i />
                    <span>
                      <b />
                      <b />
                      <b />
                    </span>
                  </span>
                  <span>
                    <Icon size={16} />
                    {name}
                    {draft.appearance.theme === value && <Check size={15} />}
                  </span>
                </button>
              ))}
            </div>
            <Field label={t("阅读字号 · ") + draft.appearance.fontSize + " px"}>
              <input
                type="range"
                min="12"
                max="22"
                value={draft.appearance.fontSize}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    appearance: {
                      ...draft.appearance,
                      fontSize: Number(e.target.value),
                    },
                  })
                }
              />
            </Field>
          </section>
          <section className="settings-card">
            <h3>{t("语言偏好")}</h3>
            <Field label={t("界面语言")}>
              <select
                value={draft.appearance.language}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    appearance: {
                      ...draft.appearance,
                      language: e.target
                        .value as Config["appearance"]["language"],
                    },
                  })
                }
              >
                <option value="system">{t("跟随系统")}</option>
                <option value="zh-CN">简体中文</option>
                <option value="en">English</option>
              </select>
            </Field>
            <div className="form-grid">
              <Field label={t("默认目标语言")}>
                <LanguageSelect
                  label={t("默认目标语言")}
                  value={draft.defaults.targetLanguage}
                  onChange={(v) =>
                    setDraft({
                      ...draft,
                      defaults: { ...draft.defaults, targetLanguage: v },
                    })
                  }
                />
              </Field>
              <Field label={t("修改说明与词义语言")}>
                <LanguageSelect
                  label={t("解释语言")}
                  value={draft.defaults.explanationLanguage}
                  onChange={(v) =>
                    setDraft({
                      ...draft,
                      defaults: { ...draft.defaults, explanationLanguage: v },
                    })
                  }
                />
              </Field>
            </div>
          </section>
          <section className="settings-card cache-settings">
            <div className="setting-row">
              <div>
                <h3>{t("AI 结果缓存")}</h3>
                <p>
                  {t(
                    "相同请求在有效期内复用结果。缓存仅保存在内存中，退出应用后清空。",
                  )}
                </p>
              </div>
              <Toggle
                label={t("启用结果缓存")}
                checked={draft.cache.enabled}
                onChange={(enabled) =>
                  setDraft({ ...draft, cache: { ...draft.cache, enabled } })
                }
              />
            </div>
            <div className="cache-controls">
              <Field label={t("缓存时长")}>
                <select
                  aria-label={t("缓存时长")}
                  disabled={!draft.cache.enabled}
                  value={draft.cache.minutes}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      cache: {
                        ...draft.cache,
                        minutes: Number(e.target.value),
                      },
                    })
                  }
                >
                  {!cacheDurations.some(([n]) => n === draft.cache.minutes) && (
                    <option value={draft.cache.minutes} disabled>
                      {t("{0} 分钟（旧设置）", draft.cache.minutes)}
                    </option>
                  )}
                  {cacheDurations.map(([n, label]) => (
                    <option key={n} value={n}>
                      {t(label)}
                    </option>
                  ))}
                </select>
              </Field>
              <button
                className="secondary"
                onClick={() =>
                  void perform(
                    () => window.texthop.call("clearCache"),
                    t("结果缓存已清空"),
                  )
                }
              >
                <Trash2 size={14} />
                {t("清空缓存")}
              </button>
            </div>
          </section>
          <section className="settings-card" id="toolbar-settings">
            <div className="setting-row">
              <div>
                <h3>{t("划词工具栏")}</h3>
                <p>{t("应用提供可读取的选中文字时出现；点击指令才会处理。")}</p>
              </div>
              <Toggle
                label={t("自动显示划词工具栏")}
                checked={draft.selection.automatic}
                onChange={(v) =>
                  setDraft({
                    ...draft,
                    selection: { ...draft.selection, automatic: v },
                  })
                }
              />
            </div>
            {snapshot.toolbarPausedUntil > Date.now() && (
              <div className="setting-row">
                <span>
                  {t("暂停至")}{" "}
                  {new Date(snapshot.toolbarPausedUntil).toLocaleTimeString(
                    [],
                    { hour: "2-digit", minute: "2-digit" },
                  )}
                </span>
                <button
                  className="secondary"
                  onClick={() =>
                    void perform(async () =>
                      onSnapshot(await window.texthop.call("resumeToolbar")),
                    )
                  }
                >
                  {t("立即恢复")}
                </button>
              </div>
            )}
            {draft.selection.disabledToolbarApps.map((app) => (
              <div className="setting-row" key={app}>
                <span>{app}</span>
                <button
                  className="secondary"
                  aria-label={t("重新启用 ") + app}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      selection: {
                        ...draft.selection,
                        disabledToolbarApps:
                          draft.selection.disabledToolbarApps.filter(
                            (a) => a !== app,
                          ),
                      },
                    })
                  }
                >
                  {t("重新启用")}
                </button>
              </div>
            ))}
            <Field
              label={t("不启用划词的应用")}
              hint={t("每行一个进程名或应用标识，按名称包含匹配。")}
            >
              <textarea
                rows={3}
                value={draft.selection.excludedApps.join("\n")}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    selection: {
                      ...draft.selection,
                      excludedApps: e.target.value.split("\n").filter(Boolean),
                    },
                  })
                }
              />
            </Field>
            <p className="helper">{t(snapshot.nativeStatus)}</p>
            <p className="helper">
              {t(
                "图片、扫描 PDF 或无法划选的界面，使用“框选屏幕文字”快捷键或托盘入口。暂停自动划词仍可手动框选。",
              )}
            </p>
          </section>
          <section className="settings-card" aria-label={t("猜你想存")}>
            <div className="setting-row">
              <div>
                <h3>{t("猜你想存")}</h3>
                <p>
                  {t(
                    "翻译时，向推荐提供商请求最多两个值得复习的词或短语。勾选保存到指令对应的本地笔记本。",
                  )}
                </p>
              </div>
              <Toggle
                label={t("显示猜你想存")}
                checked={draft.noteSuggestion.enabled}
                onChange={(enabled) =>
                  setDraft({
                    ...draft,
                    noteSuggestion: { ...draft.noteSuggestion, enabled },
                  })
                }
              />
            </div>
            <div className="suggestion-settings">
              <Field label={t("推荐指令")}>
                <select
                  aria-label={t("推荐指令")}
                  value={selectedSuggestionAction?.id ?? ""}
                  disabled={!selectedSuggestionAction}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      noteSuggestion: {
                        ...draft.noteSuggestion,
                        actionId: e.target.value,
                      },
                    })
                  }
                >
                  {!selectedSuggestionAction && (
                    <option value="">{t("请先添加自定义 AI 指令")}</option>
                  )}
                  {draft.actions
                    .filter((a) => a.id !== "translate")
                    .map((action) => (
                      <option key={action.id} value={action.id}>
                        {actionLabel(action)}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label={t("推荐提供商")}>
                <ProviderSelect
                  config={draft}
                  label={t("推荐提供商")}
                  value={draft.noteSuggestion.providerId}
                  emptyLabel={t("跟随默认提供商")}
                  onChange={(id) =>
                    setDraft(assignProvider(draft, "noteSuggestion", id))
                  }
                />
              </Field>
            </div>
          </section>
        </>
      )}
      {tab === "shortcuts" && (
        <>
          <section className="settings-card shortcuts-page">
            <h3>{t("全局快捷键")}</h3>
            {autoError.includes("快捷键") && (
              <div className="alert error" role="alert">
                {autoError}
              </div>
            )}
            <p className="helper">
              {t(
                "选中文字后按快捷键，直接在浮窗中处理。暂停自动划词时仍可使用。",
              )}
            </p>
            <div className="shortcut-section-label">{t("取词与入口")}</div>
            {Object.entries(draft.shortcuts).map(([key, value]) => (
              <div className="setting-row shortcut-row" key={key}>
                <strong>
                  {{
                    selection: t("选区指令菜单"),
                    capture: t("框选屏幕文字（OCR）"),
                    clipboard: t("读取剪贴板"),
                  }[key] ?? key}
                </strong>
                <ShortcutRecorder
                  label={
                    ({
                      selection: t("选区指令菜单"),
                      capture: t("框选屏幕文字（OCR）"),
                      clipboard: t("读取剪贴板"),
                    }[key] ?? key) +
                    (snapshot.interfaceLocale === "en" ? " shortcut" : "快捷键")
                  }
                  value={value}
                  onChange={(shortcut) =>
                    setDraft((current) => ({
                      ...current,
                      shortcuts: { ...current.shortcuts, [key]: shortcut },
                    }))
                  }
                />
              </div>
            ))}
            <div className="shortcut-section-label">{t("直接执行指令")}</div>
            {draft.actions.map((action) => (
              <div className="setting-row shortcut-row" key={action.id}>
                <div>
                  <strong>{actionLabel(action)}</strong>
                  {!action.enabled && <p>{t("指令已停用，快捷键不生效")}</p>}
                </div>
                <ShortcutRecorder
                  label={
                    actionLabel(action) +
                    (snapshot.interfaceLocale === "en" ? " shortcut" : "快捷键")
                  }
                  value={action.shortcut}
                  onChange={(shortcut) =>
                    setDraft((current) => ({
                      ...current,
                      actions: current.actions.map((item) =>
                        item.id === action.id ? { ...item, shortcut } : item,
                      ),
                    }))
                  }
                />
              </div>
            ))}
            <p className="helper">
              {t(
                "点击输入框后按组合键即可自动保存。清空可停用快捷键。图片或不可选择的文字使用 OCR 框选。",
              )}
            </p>
            {snapshot.shortcutErrors.map((e) => (
              <div className="alert error" key={e}>
                {e}
              </div>
            ))}
          </section>
        </>
      )}
      {tab === "text" && (
        <Providers
          config={draft}
          onChange={setDraft}
          savedEndpoints={Object.fromEntries(
            snapshot.config.providers.map((p) => [p.id, p.endpoint]),
          )}
          duplicate={async (id) =>
            perform(async () => {
              const state = await save();
              await flushCredentials();
              const result = await window.texthop.call("duplicateProvider", {
                id,
                revision: state.revision,
              });
              latest.current.snapshot = result.snapshot;
              onSnapshot(result.snapshot);
              setDraft(result.snapshot.config);
              return result.id;
            })
          }
          credential={keyField}
          busy={busy}
          {...modelCatalog}
          test={(id, model) =>
            void perform(async () => {
              await save();
              await flushCredentials();
              setMessage(
                model +
                  " · " +
                  (await window.texthop.call("testText", {
                    profileId: id,
                  })),
              );
            })
          }
        />
      )}
      {tab === "ocr" && (
        <OcrSettings
          config={draft}
          onChange={setDraft}
          ready={snapshot.ocrReady}
          busy={busy}
          result={visionResult.text}
          complete={visionResult.complete}
          test={async (profileId) => {
            setError("");
            setBusy(true);
            setVisionResult({ text: "", complete: false });
            try {
              await save();
              await flushCredentials();
              const id = crypto.randomUUID();
              visionJob.current = id;
              await window.texthop.call("testVision", { id, profileId });
            } catch (e) {
              setBusy(false);
              setError((e as Error).message);
            }
          }}
        />
      )}
      {tab === "config" && (
        <>
          <div className="info-strip">
            <Cloud size={23} />
            <div>
              <strong>{t("让配置跟随你，而内容留在本机。")}</strong>
              <p>
                {t(
                  "只同步服务定义、指令和偏好。API Key、图片、选中文字和模型文件不会上传。",
                )}
              </p>
            </div>
          </div>
          <section className="settings-card">
            <div className="setting-row">
              <div>
                <h3>{t("启用 WebDAV 同步")}</h3>
                <p>{t("按需手动同步，默认关闭。")}</p>
              </div>
              <Toggle
                label={t("启用 WebDAV 同步")}
                checked={sync.enabled}
                onChange={(v) => setSync({ ...sync, enabled: v })}
              />
            </div>
            <Field
              label={t("服务器地址")}
              hint={t("使用 HTTPS。服务器上的父目录需要预先建立。")}
            >
              <input
                placeholder="https://dav.example.com/"
                value={sync.url}
                onChange={(e) => setSync({ ...sync, url: e.target.value })}
              />
            </Field>
            <div className="form-grid">
              <Field label={t("用户名")}>
                <input
                  autoComplete="off"
                  value={sync.username}
                  onChange={(e) =>
                    setSync({ ...sync, username: e.target.value })
                  }
                />
              </Field>
              <Field label={t("密码 / 应用密码")}>
                <input
                  type="password"
                  autoComplete="off"
                  placeholder={
                    snapshot.sync.hasPassword
                      ? t("已保存，留空保持不变")
                      : t("输入应用密码")
                  }
                  value={sync.password}
                  onChange={(e) =>
                    setSync({ ...sync, password: e.target.value })
                  }
                />
              </Field>
            </div>
            <Field label={t("远程配置路径")}>
              <input
                value={sync.remotePath}
                onChange={(e) =>
                  setSync({ ...sync, remotePath: e.target.value })
                }
              />
            </Field>
            <div className="inline">
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await saveDav();
                    setMessage(await window.texthop.call("testSync"));
                  })
                }
              >
                {t("测试连接")}
              </button>
              <button
                className="primary"
                disabled={busy || !sync.enabled}
                onClick={() =>
                  void perform(async () => {
                    await saveDav();
                    const result = await window.texthop.call("sync", {});
                    setSyncResult(result);
                    setMessage(result.message);
                  })
                }
              >
                <RefreshCw size={16} className={busy ? "spin" : ""} />
                {t("立即同步")}
              </button>
            </div>
            <p className="helper">
              {t("上次成功同步：")}
              {snapshot.sync.lastSync
                ? new Date(snapshot.sync.lastSync).toLocaleString()
                : t("尚未同步")}
            </p>
          </section>
          {syncResult?.status === "conflict" && (
            <section className="settings-card conflict">
              <Badge tone="amber">{t("需要选择")}</Badge>
              <h3>{t("两份配置，都已保留。")}</h3>
              <p>{syncResult.message}</p>
              <div className="conflict-columns">
                <div>
                  <h4>{t("这台设备")}</h4>
                  <p>
                    {syncResult.local?.actions.length} {t("个指令 ·")}{" "}
                    {syncResult.local?.providers.length} {t("个服务商")}
                  </p>
                  <pre>{JSON.stringify(syncResult.local, null, 2)}</pre>
                </div>
                <div>
                  <h4>{t("远程设备")}</h4>
                  <p>
                    {syncResult.remoteDeleted
                      ? t("远程文件已删除")
                      : t(
                          "{0} 个指令 · {1} 个服务商",
                          syncResult.remote?.actions.length,
                          syncResult.remote?.providers.length,
                        )}
                  </p>
                  <pre>{JSON.stringify(syncResult.remote, null, 2)}</pre>
                </div>
              </div>
              <div className="inline">
                {(["local", "remote"] as const).map((choice) => (
                  <button
                    className={choice === "local" ? "primary" : "secondary"}
                    key={choice}
                    disabled={
                      busy || (choice === "remote" && syncResult.remoteDeleted)
                    }
                    onClick={() =>
                      void perform(async () => {
                        const result = await window.texthop.call("sync", {
                          resolution: choice,
                          token: syncResult.token,
                        });
                        setSyncResult(result);
                        setMessage(result.message);
                      })
                    }
                  >
                    {choice === "local" ? t("保留本机配置") : t("使用远程配置")}
                  </button>
                ))}
              </div>
              <p className="helper">
                {t(
                  "应用前会重新检查远程版本。备份可在本机数据目录的 backups 中找到。",
                )}
              </p>
            </section>
          )}
        </>
      )}
      {tab === "config" && (
        <>
          <section className="settings-card">
            <h3>{t("导入与导出")}</h3>
            <p>{t("版本化 JSON 包含指令、提示词、模型配置、外观和快捷键。")}</p>
            <div className="transfer-grid">
              <div>
                <Download size={25} />
                <h3>{t("导出配置")}</h3>
                <p>{t("可阅读、可备份。凭据和本机路径不会导出。")}</p>
                <button
                  className="secondary"
                  onClick={() =>
                    void perform(async () => {
                      const file = await window.texthop.call("exportConfig");
                      if (file) setMessage(t("已导出到 ") + file);
                    })
                  }
                >
                  {t("导出 JSON")}
                  <ArrowRight size={15} />
                </button>
              </div>
              <div>
                <Upload size={25} />
                <h3>{t("导入配置")}</h3>
                <p>{t("先检查内容和快捷键，再决定合并或替换。")}</p>
                <button
                  className="secondary"
                  onClick={() =>
                    void perform(async () =>
                      setImported(await window.texthop.call("previewImport")),
                    )
                  }
                >
                  {t("选择文件")}
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </section>
          {imported && (
            <section className="settings-card">
              <h3>
                {t("导入预览 · schema v")}
                {imported.config.schemaVersion}
              </h3>
              <p>
                {imported.config.actions.length} {t("个指令 ·")}{" "}
                {imported.config.providers.length} {t("个服务商")}
              </p>
              {imported.shortcuts.map((s) => (
                <div className="setting-row compact-row" key={s.name}>
                  <span>{s.name}</span>
                  <kbd>{s.key}</kbd>
                </div>
              ))}
              <div className="alert">
                {imported.missing.map((m) => (
                  <p key={m}>{m}</p>
                ))}
              </div>
              <p className="helper">
                {t(
                  "合并：相同 ID 使用导入值，保留其他项目。替换：完整采用导入内容，并创建恢复备份。系统快捷键占用情况将在应用后检测。",
                )}
              </p>
              <div className="inline">
                {(["merge", "replace"] as const).map((mode) => (
                  <button
                    className={mode === "merge" ? "primary" : "secondary"}
                    key={mode}
                    disabled={busy}
                    onClick={() =>
                      void perform(async () => {
                        onSnapshot(
                          await window.texthop.call("applyImport", {
                            token: imported.token,
                            mode,
                            revision: snapshot.revision,
                          }),
                        );
                        setImported(null);
                      }, t("配置导入成功，旧配置已备份"))
                    }
                  >
                    {mode === "merge" ? t("合并配置") : t("备份并替换")}
                  </button>
                ))}
              </div>
            </section>
          )}
          <section className="settings-card">
            <div className="setting-row">
              <div>
                <h3>{t("本机存储与恢复")}</h3>
                <p>
                  {t(
                    "凭据、同步基线和配置备份保存在本机；离线 OCR 随应用内置。",
                  )}
                </p>
              </div>
              <button
                className="secondary"
                onClick={() => void window.texthop.call("openData")}
              >
                {t("打开数据目录")}
              </button>
            </div>
          </section>
        </>
      )}
      {tab !== "actions" && (
        <footer className="settings-footnote">
          <KeyRound size={14} />
          {snapshot.secureStorage
            ? t("凭据由操作系统加密保存在本机")
            : t("系统安全存储不可用：新凭据仅在当前会话保留，退出后需重新输入")}
        </footer>
      )}
    </div>
  );
}
