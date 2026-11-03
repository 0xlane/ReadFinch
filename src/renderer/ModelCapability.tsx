import { useState } from "react";
import { Image, Text, Volume2, CircleHelp, ChevronDown } from "lucide-react";
import type { TextProfile } from "../shared/config";
import {
  inferredModelKind,
  modelKind,
  speechProtocol,
  type ModelKind,
} from "../shared/model-capabilities";
import { t } from "../shared/i18n";
import { Field } from "./ui";

export function modelKindLabel(kind?: ModelKind) {
  return kind === "speech"
    ? t("语音合成")
    : kind === "vision"
      ? t("文本与图片")
      : kind === "text"
        ? t("文本")
        : t("能力待确认");
}
export function ModelBadge({
  kind,
  compact = false,
}: {
  kind?: ModelKind;
  compact?: boolean;
}) {
  const Icon =
    kind === "speech"
      ? Volume2
      : kind === "vision"
        ? Image
        : kind === "text"
          ? Text
          : CircleHelp;
  return (
    <span
      className="model-capability-badge"
      data-compact={compact}
      data-kind={kind ?? "unknown"}
    >
      <Icon size={12} />
      {modelKindLabel(kind)}
    </span>
  );
}

export function ModelCapability({
  provider,
  onChange,
}: {
  provider: TextProfile;
  onChange: (p: TextProfile) => void;
}) {
  const [editing, setEditing] = useState(false);
  const kind = modelKind(provider),
    protocol = speechProtocol(provider);
  return (
    <div className="model-capability-settings">
      <div className="model-capability-line">
        <ModelBadge kind={kind} />
        <button
          type="button"
          className="model-capability-edit"
          aria-expanded={editing}
          onClick={() => setEditing(!editing)}
        >
          {t(provider.modelKind ? "手动指定" : "自动识别")}
          <ChevronDown size={12} />
        </button>
      </div>
      {editing && (
        <Field
          label={t("模型能力")}
          hint={t(
            "自定义部署名称无法识别时，可在这里指定。图片指图片理解，可用于 OCR。",
          )}
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
              {t("自动识别")} · {modelKindLabel(inferredModelKind(provider))}
            </option>
            <option value="text">{t("文本")}</option>
            <option value="vision">{t("文本与图片")}</option>
            <option value="speech">{t("语音合成")}</option>
          </select>
        </Field>
      )}
      {kind === "speech" && (
        <div className="provider-speech-settings">
          <Field
            label={t("语音接口")}
            hint={
              protocol === "mimo"
                ? t("通过 Chat Completions 合成语音，自动解码音频。")
                : t(
                    "通过 Audio Speech 合成语音。兼容接口可使用自定义模型和音色。",
                  )
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
          {!(
            protocol === "openai" &&
            /(?:^|\/)tts-1(?:-hd)?$/.test(provider.model)
          ) &&
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
      )}
    </div>
  );
}
