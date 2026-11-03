import { t } from "../shared/i18n";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  reasoningEfforts,
  type Config,
  type TextProfile,
} from "../shared/config";
import {
  assignProvider,
  providerCanServe,
  modelOptions,
  supportsImages,
  type ModelPurpose,
} from "../shared/models";
import { ModelPicker, type ModelCatalogAccess } from "./ModelPicker";
import { ProviderSwitch } from "./provider-ui";
import { Field } from "./ui";
import { isTranslationOnly } from "../shared/provider-presets";

export function ProviderModels({
  config,
  provider,
  purposes,
  onChange,
  ...catalog
}: ModelCatalogAccess & {
  config: Config;
  provider: TextProfile;
  purposes: ModelPurpose[];
  onChange: (config: Config) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const model = provider.model;
  const translationOnly = isTranslationOnly(provider);
  const capability = modelOptions(config, provider.id).find(
    (option) => option.id === model,
  )?.vision;
  const assigned = (purpose: ModelPurpose) =>
    purpose.providerId === provider.id;
  const count = purposes.filter(assigned).length;
  return (
    <div className="provider-model-control">
      {!translationOnly && (
        <>
          <ModelPicker
            config={config}
            label={t("模型")}
            placeholder={t("选择或输入模型 ID")}
            provider={provider}
            onChange={(updated) => {
              const changed = {
                ...config,
                providers: config.providers.map((p) =>
                  p.id === provider.id ? updated : p,
                ),
              };
              onChange(
                config.defaults.ocrProfileId === provider.id &&
                  !supportsImages(updated)
                  ? assignProvider(changed, "ocr", null)
                  : changed,
              );
            }}
            {...catalog}
          />
          <Field label={t("推理强度")}>
            <select
              aria-label={t("推理强度")}
              value={provider.reasoningEffort ?? ""}
              onChange={(e) => {
                const effort = reasoningEfforts.find(
                  (item) => item === e.currentTarget.value,
                );
                onChange({
                  ...config,
                  providers: config.providers.map((p) =>
                    p.id === provider.id
                      ? { ...p, reasoningEffort: effort }
                      : p,
                  ),
                });
              }}
            >
              <option value="">{t("提供商默认")}</option>
              {reasoningEfforts.map((effort) => (
                <option key={effort}>{effort}</option>
              ))}
            </select>
          </Field>
        </>
      )}
      <button
        className="provider-disclosure"
        aria-expanded={expanded}
        aria-controls="model-features"
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronRight size={15} /> {t("功能提供商")}
        {count > 0 && (
          <small>
            {count} {t("项")}
          </small>
        )}
      </button>
      {expanded && (
        <div
          className="model-assignment-list"
          id="model-features"
          aria-label={t("模型用途")}
        >
          {!model && !translationOnly ? (
            <p>{t("选择模型后即可分配功能。")}</p>
          ) : (
            <>
              {purposes
                .filter(
                  (purpose) =>
                    providerCanServe(provider, purpose.id) ||
                    (purpose.id === "ocr" && !translationOnly),
                )
                .map((purpose) => {
                  const checked = assigned(purpose);
                  const textOnly =
                    purpose.id === "ocr" && !supportsImages(provider);
                  return (
                    <label
                      key={purpose.id}
                      title={textOnly ? t("此模型仅支持文字输入") : undefined}
                    >
                      <ProviderSwitch
                        label={
                          t("将 ") +
                          (model || provider.name) +
                          t(" 用于 ") +
                          purpose.name
                        }
                        checked={checked}
                        disabled={
                          !provider.enabled ||
                          textOnly ||
                          (checked && purpose.id === "default")
                        }
                        title={
                          checked && purpose.id === "default"
                            ? t("在其他模型上开启此项可更换默认模型")
                            : undefined
                        }
                        onChange={(on) =>
                          onChange(
                            assignProvider(
                              config,
                              purpose.id,
                              on ? provider.id : null,
                            ),
                          )
                        }
                      />
                      <span>{purpose.name}</span>
                    </label>
                  );
                })}
              <p>{t("未单独指定的指令使用默认模型。")}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
