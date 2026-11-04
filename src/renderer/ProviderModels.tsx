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
  supportsImages,
  type ModelPurpose,
  updateProviderModel,
} from "../shared/models";
import { ModelPicker, type ModelCatalogAccess } from "./ModelPicker";
import { ProviderSwitch } from "./provider-ui";
import { Field } from "./ui";
import { isTranslationOnly } from "../shared/provider-presets";
import { modelKind } from "../shared/model-capabilities";
import { SpeechModelSettings } from "./ModelCapability";

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
  const speech = modelKind(provider) === "speech";
  const assigned = (purpose: ModelPurpose) =>
    purpose.providerId === provider.id;
  const count = purposes.filter(
    (p) => assigned(p) && providerCanServe(provider, p.id),
  ).length;
  return (
    <div className="provider-model-control">
      {!translationOnly && (
        <>
          <ModelPicker
            config={config}
            label={t("模型")}
            placeholder={t("选择或输入模型 ID")}
            provider={provider}
            onChange={(updated) =>
              onChange(updateProviderModel(config, updated))
            }
            {...catalog}
          />
          {speech && (
            <SpeechModelSettings
              provider={provider}
              onChange={(p) => onChange(updateProviderModel(config, p))}
            />
          )}
          {speech && config.defaults.textProfileId === provider.id && (
            <p className="model-fetch-note">
              {t("语音合成模型只能用于在线朗读，请为文本功能选择其他提供商。")}
            </p>
          )}
          {!speech && (
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
          )}
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
                    (purpose.id === "ocr" && !translationOnly && !speech),
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
              <p>
                {speech
                  ? t("在「文本转语音」中选择音色并试听。")
                  : t("未单独指定的指令使用默认模型。")}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
