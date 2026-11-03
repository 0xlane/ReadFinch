import { SlidersHorizontal, AudioLines } from "lucide-react";
import type { ProviderPreset } from "../shared/provider-presets";

export function ProviderIcon({ preset }: { preset: ProviderPreset }) {
  return (
    <span
      className={"provider-icon provider-icon-" + preset}
      aria-hidden="true"
    >
      {preset === "mimo" ? (
        <AudioLines size={19} className="mimo-mark" />
      ) : preset === "custom" || preset === "open-responses" ? (
        <SlidersHorizontal
          size={16}
          style={{ color: preset === "open-responses" ? "#5484ec" : undefined }}
        />
      ) : (
        <>
          {["light", "dark"].map((theme) => (
            <img
              key={theme}
              className={"provider-mark-" + theme}
              src={
                "./provider-icons/" +
                preset +
                "-" +
                theme +
                (preset === "jalapenocloud"
                  ? ".png"
                  : preset === "tensdaq"
                    ? ".svg"
                    : ".webp")
              }
              alt=""
              draggable={false}
            />
          ))}
        </>
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
