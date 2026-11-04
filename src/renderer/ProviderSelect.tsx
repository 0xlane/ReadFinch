import { t } from "../shared/i18n";
import { ChevronDown, Layers2 } from "lucide-react";
import type { Config } from "../shared/config";
import { providerCanServe } from "../shared/models";
import { isTranslationOnly } from "../shared/provider-presets";
import { ProviderIcon } from "./provider-ui";

export function ProviderSelect({
  config,
  value,
  label,
  emptyLabel,
  onChange,
  vision = false,
  purpose = "default",
  showModel = true,
}: {
  config: Config;
  value: string | null;
  label: string;
  emptyLabel?: string;
  vision?: boolean;
  purpose?: string;
  showModel?: boolean;
  onChange: (id: string | null) => void;
}) {
  const choices = config.providers.filter(
    (p) =>
      p.enabled &&
      providerCanServe(p, vision ? "ocr" : purpose) &&
      (p.model || isTranslationOnly(p) || p.id === value),
  );
  const selected = choices.find((p) => p.id === value);
  const optionLabel = (p: (typeof choices)[number]) =>
    showModel && p.model ? p.name + " · " + p.model : p.name;
  return (
    <div className="assignment-select">
      {selected ? (
        <ProviderIcon preset={selected.preset} />
      ) : (
        <Layers2 size={15} aria-hidden="true" />
      )}
      <select
        aria-label={label}
        value={selected?.id ?? ""}
        title={selected ? optionLabel(selected) : emptyLabel}
        onChange={(e) => onChange(e.target.value || null)}
      >
        {(emptyLabel || !selected) && (
          <option value="" disabled={!emptyLabel}>
            {emptyLabel ?? t("选择提供商")}
          </option>
        )}
        {choices.map((p) => (
          <option key={p.id} value={p.id}>
            {optionLabel(p)}
          </option>
        ))}
      </select>
      <ChevronDown size={14} aria-hidden="true" />
    </div>
  );
}
