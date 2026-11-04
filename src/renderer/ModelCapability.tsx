import { Image, Text, Volume2 } from "lucide-react";
import type { TextProfile } from "../shared/config";
import {
  inferredModelKind,
  isLegacyOpenAiSpeech,
  bundledDirectory,
  modelKind,
  speechProtocol,
  type ModelKind,
} from "../shared/model-capabilities";
import { t } from "../shared/i18n";
import { Field } from "./ui";
import type { ModelDirectory } from "../shared/model-directory";

export function modelKindLabel(kind?: ModelKind) {
  return kind === "speech"
    ? t("语音合成")
    : kind === "vision"
      ? t("文本与图片")
      : t("文本");
}
export function ModelBadge({
  kind,
  compact = false,
}: {
  kind?: ModelKind;
  compact?: boolean;
}) {
  const Icon = kind === "speech" ? Volume2 : kind === "vision" ? Image : Text;
  return (
    <span
      className="model-capability-badge"
      data-compact={compact}
      data-kind={kind ?? "text"}
    >
      <Icon size={12} />
      {modelKindLabel(kind)}
    </span>
  );
}

type CapabilityProps = {
  provider: TextProfile;
  onChange: (p: TextProfile) => void;
  directory?: ModelDirectory;
};
export function ModelOverride({
  provider,
  onChange,
  directory,
}: CapabilityProps) {
  return (
    <Field
      label={t("模型能力")}
      hint={t("仅在自定义部署需要更正识别结果时修改。")}
    >
      <select
        aria-label={t("模型能力")}
        value={provider.modelKind ?? "auto"}
        onChange={(e) =>
          onChange({
            ...provider,
            modelKind:
              e.target.value === "auto"
                ? undefined
                : (e.target.value as ModelKind),
          })
        }
      >
        <option value="auto">
          {t("自动识别")} ·{" "}
          {modelKindLabel(inferredModelKind(provider, directory))}
        </option>
        <option value="text">{t("文本")}</option>
        <option value="vision">{t("文本与图片")}</option>
        <option value="speech">{t("语音合成")}</option>
      </select>
    </Field>
  );
}
export function ModelSummary({
  provider,
  directory = bundledDirectory,
}: Omit<CapabilityProps, "onChange">) {
  if (!provider.model.trim()) return null;
  const entry = directory.lookup(provider.preset, provider.model);
  const kind = modelKind(provider, directory);
  return (
    <div className="model-capability-line" aria-label={t("模型信息")}>
      <ModelBadge kind={kind} />
      {entry && entry.name !== provider.model && (
        <span className="model-display-name">{entry.name}</span>
      )}
      {entry?.context && (
        <span
          className="model-context"
          title={t("上下文长度：{0} tokens", entry.context.toLocaleString())}
        >
          {t(
            "{0} 上下文",
            new Intl.NumberFormat("en", {
              notation: "compact",
              maximumFractionDigits: 1,
            }).format(entry.context),
          )}
        </span>
      )}
    </div>
  );
}
export function SpeechModelSettings({
  provider,
  onChange,
}: Omit<CapabilityProps, "directory">) {
  const protocol = speechProtocol(provider);
  return (
    <div className="provider-speech-settings">
      <Field
        label={t("语音接口")}
        hint={
          protocol === "mimo"
            ? t("通过 Chat Completions 合成语音，自动解码音频。")
            : t("通过 Audio Speech 合成语音。兼容接口可使用自定义模型和音色。")
        }
      >
        <select
          aria-label={t("语音接口")}
          value={provider.speechProtocol ?? "auto"}
          onChange={(e) =>
            onChange({
              ...provider,
              speechProtocol:
                e.target.value === "auto"
                  ? undefined
                  : (e.target.value as "openai" | "mimo"),
            })
          }
        >
          <option value="auto">
            {t("自动识别")} ·{" "}
            {speechProtocol({ ...provider, speechProtocol: undefined }) ===
            "mimo"
              ? "Xiaomi MiMo"
              : provider.preset === "azure"
                ? "Azure OpenAI"
                : "OpenAI"}
          </option>
          <option value="openai">OpenAI · Audio Speech</option>
          <option value="mimo">Xiaomi MiMo · Chat Completions</option>
        </select>
      </Field>
      {!(protocol === "openai" && isLegacyOpenAiSpeech(provider)) &&
        protocol !== "azure" && (
          <Field
            label={t("朗读风格")}
            hint={t(
              "可选，例如：语气温和、吐字清晰。音色与语速在「文本转语音」中配置。",
            )}
          >
            <textarea
              aria-label={t("朗读风格")}
              rows={2}
              maxLength={2000}
              value={provider.speechInstructions ?? ""}
              placeholder={t("使用模型默认风格")}
              onChange={(e) =>
                onChange({
                  ...provider,
                  speechInstructions: e.target.value || undefined,
                })
              }
            />
          </Field>
        )}
    </div>
  );
}
