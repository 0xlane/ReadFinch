import { t } from "../shared/i18n";
import { ChevronDown, Layers2 } from "lucide-react";
import type { Config } from "../shared/config";
import { supportsImages } from "../shared/models";
import { ProviderIcon } from "./provider-ui";

export function ProviderSelect({
  config,
  value,
  label,
  emptyLabel,
  onChange,
  vision = false,
}: {
  config: Config;
  value: string | null;
  label: string;
  emptyLabel?: string;
  vision?: boolean;
  onChange: (id: string | null) => void;
}) {
  const choices = config.providers.filter(
    (p) =>
      p.enabled && (vision ? supportsImages(p) : p.model || p.id === value),
  );
  const selected = choices.find((p) => p.id === value);
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
        title={selected ? selected.name + " · " + selected.model : emptyLabel}
        onChange={(e) => onChange(e.target.value || null)}
      >
        {(emptyLabel || !selected) && (
          <option value="" disabled={!emptyLabel}>
            {emptyLabel ?? t("选择提供商")}
          </option>
        )}
        {choices.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.model && " · " + p.model}
          </option>
        ))}
      </select>
      <ChevronDown size={14} aria-hidden="true" />
    </div>
  );
}
