import { t } from "../shared/i18n";
import { useLayoutEffect, useRef } from "react";
import { X } from "lucide-react";
import {
  providerPreset,
  type ProviderPreset,
} from "../shared/provider-presets";
import { ProviderIcon } from "./provider-ui";

const groups: {
  title: string;
  description: string;
  presets: ProviderPreset[];
}[] = [
  {
    title: "内置 LLM 提供商",
    description: "已预填 API 地址和默认模型，添加后可直接调整。",
    presets: ["openai", "deepseek", "gemini", "qwen"],
  },
  {
    title: "兼容 API 提供商",
    description: "通过 Chat Completions 接入自定义服务或模型平台。",
    presets: ["custom", "openrouter", "siliconflow"],
  },
];
export function ProviderCatalog({
  onSelect,
  onClose,
}: {
  onSelect: (preset: ProviderPreset) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="provider-dialog"
      aria-labelledby="provider-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target !== dialog.current) return;
        const rect = e.currentTarget.getBoundingClientRect();
        if (
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom
        )
          onClose();
      }}
    >
      <header>
        <h2 id="provider-dialog-title">{t("添加新提供商")}</h2>
        <button
          className="icon-button"
          aria-label={t("关闭添加提供商")}
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </header>
      {groups.map((group) => (
        <section key={group.title} aria-label={t(group.title)}>
          <h3>{t(group.title)}</h3>
          <p>{t(group.description)}</p>
          <div className="provider-catalog">
            {group.presets.map((id) => (
              <button key={id} onClick={() => onSelect(id)}>
                <ProviderIcon preset={id} />
                <span>
                  {id === "custom"
                    ? t("自定义接口")
                    : id === "gemini"
                      ? "Gemini"
                      : t(providerPreset(id).name)}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </dialog>
  );
}
