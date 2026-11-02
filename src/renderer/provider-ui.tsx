import { SlidersHorizontal } from "lucide-react";
import type { ProviderPreset } from "../shared/provider-presets";

export function ProviderIcon({ preset }: { preset: ProviderPreset }) {
  return (
    <span
      className={"provider-icon provider-icon-" + preset}
      aria-hidden="true"
    >
      {preset === "custom" ? (
        <SlidersHorizontal size={16} />
      ) : (
        <img
          src={"./provider-icons/" + preset + ".svg"}
          alt=""
          draggable={false}
        />
      )}
    </span>
  );
}

export function ProviderSwitch({
  label,
  checked,
  disabled,
  title,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  title?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <input
      className="provider-switch"
      type="checkbox"
      role="switch"
      aria-label={label}
      title={title}
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}
