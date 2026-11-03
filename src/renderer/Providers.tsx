import { t } from "../shared/i18n";
import { RequestHeaders } from "./RequestHeaders";
import { ProviderProxySettings } from "./ProviderProxySettings";
import { useRef, useState, type ReactNode } from "react";
import { Plus, ChevronRight } from "lucide-react";
import {
  createProvider,
  OFFLINE_OCR_ID,
  type Config,
  type TextProfile,
} from "../shared/config";
import {
  modelPurposes,
  providerCanServe,
  type ModelPurpose,
} from "../shared/models";
import {
  providerPreset,
  isTranslationOnly,
  requiresApiKey,
} from "../shared/provider-presets";
import { modelKind } from "../shared/model-capabilities";
import { ModelBadge } from "./ModelCapability";
import { ProviderSpecificSettings } from "./ProviderSpecificSettings";
import { ConnectionTestButton } from "./ConnectionTestButton";
import { Field } from "./ui";
import { ProviderIcon, ProviderSwitch } from "./provider-ui";
import { ProviderModels } from "./ProviderModels";
import { ProviderCatalog } from "./ProviderCatalog";
import { FeatureProviders } from "./FeatureProviders";
import type { ModelCatalogAccess } from "./ModelPicker";

type ProviderProps = ModelCatalogAccess & {
  config: Config;
  onChange: (config: Config) => void;
  savedEndpoints: Record<string, string>;
  duplicate: (id: string) => Promise<string | undefined>;
  credential: (id: string, action: ReactNode) => ReactNode;
  test: (id: string) => Promise<{ durationMs: number }>;
  credentialState: Record<string, { available: boolean; version: number }>;
  busy: boolean;
};

export function Providers(props: ProviderProps) {
  const { config, onChange } = props;
  const [selected, setSelected] = useState(config.defaults.textProfileId);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState("");
  const addButton = useRef<HTMLButtonElement>(null);
  const provider =
    config.providers.find((p) => p.id === selected) ?? config.providers[0];
  const purposes = modelPurposes(config);
  function select(id: string) {
    setSelected(id);
    setNotice("");
  }
  function closeCatalog() {
    setAdding(false);
    requestAnimationFrame(() => {
      if (document.activeElement === document.body)
        addButton.current?.focus({ preventScroll: true });
    });
  }
  function add(preset: string) {
    const next = createProvider(preset, crypto.randomUUID());
    const names = new Set(config.providers.map((p) => p.name));
    for (let n = 2; names.has(next.name); n++)
      next.name = providerPreset(preset).name + " " + n;
    onChange({ ...config, providers: [...config.providers, next] });
    select(next.id);
    closeCatalog();
  }
  async function copy() {
    const id = await props.duplicate(provider.id);
    if (id) select(id);
  }
  const remaining = config.providers.filter((p) => p.id !== provider.id);
  const fallback = remaining.find(
    (p) => p.enabled && providerCanServe(p, "default"),
  );
  function remove() {
    if (!fallback) return;
    const id = provider.id;
    onChange({
      ...config,
      providers: remaining,
      tts:
        config.tts.onlineProviderId === id
          ? { ...config.tts, onlineProviderId: null }
          : config.tts,
      noteSuggestion:
        config.noteSuggestion.providerId === id
          ? { ...config.noteSuggestion, providerId: null }
          : config.noteSuggestion,
      defaults: {
        ...config.defaults,
        textProfileId:
          config.defaults.textProfileId === id
            ? fallback.id
            : config.defaults.textProfileId,
        ocrProfileId:
          config.defaults.ocrProfileId === id
            ? OFFLINE_OCR_ID
            : config.defaults.ocrProfileId,
      },
      languageDetection:
        config.languageDetection.mode === "llm" &&
        config.languageDetection.providerId === id
          ? { mode: "basic" }
          : config.languageDetection,
      actions: config.actions.map((a) =>
        a.providerId === id ? { ...a, providerId: null } : a,
      ),
    });
    select(fallback.id);
  }
  return (
    <>
      <section aria-labelledby="provider-config-title" id="provider-config">
        <div className="provider-section-intro">
          <h2 id="provider-config-title">{t("提供商配置")}</h2>
          <p>
            {t(
              "接入常用 AI 与翻译服务，也可添加兼容 Chat Completions 或 Responses 的自定义 API。",
            )}
          </p>
        </div>
        <div className="provider-layout">
          <nav className="provider-list" aria-label={t("已添加的提供商")}>
            <button
              className="provider-add"
              ref={addButton}
              onClick={() => setAdding(true)}
            >
              <Plus size={16} />
              {t("添加提供商")}
            </button>
            {config.providers.map((item) => {
              const bindings = purposes.filter(
                (use) => use.providerId === item.id,
              );
              const assigned =
                item.model || isTranslationOnly(item)
                  ? bindings.filter((use) => providerCanServe(item, use.id))
                  : [];
              return (
                <div
                  className="provider-list-item"
                  data-selected={item.id === provider.id}
                  data-enabled={item.enabled}
                  key={item.id}
                >
                  <button
                    className="provider-select"
                    title={item.name}
                    aria-label={item.name}
                    aria-current={item.id === provider.id ? "true" : undefined}
                    onClick={() => select(item.id)}
                  >
                    <ProviderIcon preset={item.preset} />
                    <span className="provider-list-name">
                      <span>{item.name || t("未命名提供商")}</span>
                      {!isTranslationOnly(item) && (
                        <ModelBadge kind={modelKind(item)} compact />
                      )}
                    </span>
                  </button>
                  {assigned.length > 0 && (
                    <span
                      className="provider-count"
                      tabIndex={0}
                      title={assigned.map((use) => use.name).join("、")}
                    >
                      {assigned.length} {t("个功能")}
                    </span>
                  )}
                  <ProviderSwitch
                    label={t("启用 ") + item.name}
                    title={
                      item.enabled && bindings.length
                        ? t("请先将已绑定的功能分配给其他提供商")
                        : undefined
                    }
                    checked={item.enabled}
                    onChange={(enabled) => {
                      if (!enabled && bindings.length) {
                        setNotice(
                          "「" +
                            item.name +
                            t("」正在用于") +
                            bindings.map((use) => use.name).join("、") +
                            t("。更换这些功能的提供商后即可停用。"),
                        );
                        return;
                      }
                      setNotice("");
                      onChange({
                        ...config,
                        providers: config.providers.map((p) =>
                          p.id === item.id ? { ...p, enabled } : p,
                        ),
                      });
                    }}
                  />
                </div>
              );
            })}
          </nav>
          <div className="provider-form-column">
            {notice && (
              <p className="provider-notice" role="status">
                {notice}
              </p>
            )}
            <ProviderEditor
              key={provider.id}
              {...props}
              provider={provider}
              purposes={purposes}
              copy={copy}
              remove={remove}
              canRemove={!!fallback}
            />
          </div>
        </div>
      </section>
      <FeatureProviders
        config={config}
        purposes={purposes}
        onChange={onChange}
      />
      {adding && <ProviderCatalog onSelect={add} onClose={closeCatalog} />}
    </>
  );
}

function ProviderEditor({
  config,
  onChange,
  provider,
  credential,
  test,
  busy,
  purposes,
  copy,
  remove,
  canRemove,
  savedEndpoints,
  credentialState,
  ...catalog
}: ProviderProps & {
  provider: TextProfile;
  purposes: ModelPurpose[];
  copy: () => void;
  remove: () => void;
  canRemove: boolean;
}) {
  const [advanced, setAdvanced] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [headerVersion, setHeaderVersion] = useState(0);
  const model = provider.model;
  const preset = providerPreset(provider.preset);
  const translationOnly = isTranslationOnly(provider);
  function change(patch: Partial<TextProfile>) {
    onChange({
      ...config,
      providers: config.providers.map((p) =>
        p.id === provider.id ? { ...p, ...patch } : p,
      ),
    });
  }
  const testButton = (
    <ConnectionTestButton
      identity={JSON.stringify([
        provider,
        credentialState[provider.id]?.version,
        headerVersion,
      ])}
      disabled={busy || (!model && !translationOnly) || !provider.enabled}
      run={() => test(provider.id)}
    />
  );
  return (
    <section className="provider-editor" aria-label={t("提供商设置")}>
      <header>
        <h3>
          <ProviderIcon preset={provider.preset} />
          {t(preset.name)}
        </h3>
        <button
          className="provider-help-link"
          aria-expanded={showHelp}
          onClick={() => setShowHelp(!showHelp)}
        >
          {t("如何配置？")}
        </button>
      </header>
      {showHelp && (
        <p className="provider-guide">
          {t(preset.hint)} {t("选好模型后，在「功能提供商」中开启用途。")}
        </p>
      )}
      <Field label={t("名称")}>
        <input
          value={provider.name}
          maxLength={80}
          onChange={(e) => change({ name: e.target.value })}
        />
      </Field>
      <Field label={t("描述")}>
        <input
          value={provider.description}
          placeholder={t("填写账户或模型用途")}
          maxLength={500}
          onChange={(e) => change({ description: e.target.value })}
        />
      </Field>
      {credential("text:" + provider.id, testButton)}
      {!requiresApiKey(provider) && (
        <p className="provider-optional-key">
          {t("不需要身份验证时，可将 API Key 留空。")}
        </p>
      )}
      <ProviderSpecificSettings provider={provider} change={change} />
      <Field
        label={
          provider.preset === "open-responses" || provider.preset === "deeplx"
            ? t("接口 URL")
            : "Base URL"
        }
      >
        <input
          type="url"
          aria-label={t("API 基础地址")}
          value={provider.endpoint}
          onChange={(e) => change({ endpoint: e.target.value })}
        />
      </Field>
      <ProviderModels
        config={config}
        provider={provider}
        purposes={purposes}
        onChange={onChange}
        {...catalog}
      />
      <details
        className="provider-advanced"
        onToggle={(e) => setAdvanced(e.currentTarget.open)}
      >
        <summary>
          <ChevronRight size={15} />
          {t("高级选项")}
        </summary>
        {!translationOnly && modelKind(provider) !== "speech" && (
          <Field label={t("温度")} hint={t("留空使用提供商默认值。")}>
            <input
              type="number"
              step="0.01"
              min={0}
              max={2}
              placeholder={t("默认")}
              value={provider.temperature ?? ""}
              onChange={(e) =>
                change({
                  temperature:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </Field>
        )}
        <ProviderProxySettings
          value={provider.proxy}
          onChange={(proxy) => change({ proxy })}
        />
        {advanced && savedEndpoints[provider.id] === provider.endpoint && (
          <RequestHeaders
            onChange={() => setHeaderVersion((v) => v + 1)}
            key={provider.id + "|" + provider.endpoint}
            provider={provider}
          />
        )}
        <Field label={t("请求超时（秒）")}>
          <input
            type="number"
            min={1}
            max={600}
            value={provider.timeoutMs / 1000}
            onChange={(e) =>
              change({ timeoutMs: Number(e.target.value) * 1000 })
            }
          />
        </Field>
      </details>
      <footer>
        <button
          className="provider-small-button"
          disabled={busy}
          onClick={copy}
          title={t("复制连接和模型设置")}
        >
          {t("复制")}
        </button>
        {confirmDelete ? (
          <div className="provider-delete-confirm">
            <span>{t("删除此提供商？")}</span>
            <button
              className="provider-small-button"
              onClick={() => setConfirmDelete(false)}
            >
              {t("取消")}
            </button>
            <button className="provider-delete" onClick={remove}>
              {t("确认删除")}
            </button>
          </div>
        ) : (
          <button
            className="provider-delete"
            disabled={!canRemove}
            title={!canRemove ? t("至少保留一个启用的提供商") : undefined}
            onClick={() => setConfirmDelete(true)}
          >
            {t("删除")}
          </button>
        )}
      </footer>
    </section>
  );
}
