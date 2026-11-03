import { t } from "../shared/i18n";
import { useLayoutEffect, useRef } from "react";
import { X } from "lucide-react";
import {
  providerPreset,
  PROVIDER_PRESETS,
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
    presets: PROVIDER_PRESETS.filter((p) => p.group === "llm").map((p) => p.id),
  },
  {
    title: "兼容 API 提供商",
    description:
      "兼容 Chat Completions 与 Open Responses 的自定义服务和模型平台。",
    presets: PROVIDER_PRESETS.filter((p) => p.group === "compatible").map(
      (p) => p.id,
    ),
  },
  {
    title: "纯翻译提供商",
    description: "专注于翻译，不用于词典、写作改进或图片识别。",
    presets: PROVIDER_PRESETS.filter((p) => p.group === "translation").map(
      (p) => p.id,
    ),
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
              <button
                key={id}
                data-provider-preset={id}
                onClick={() => onSelect(id)}
              >
                <ProviderIcon preset={id} />
                <span>{t(providerPreset(id).name)}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </dialog>
  );
}
