import { iconPosition, type legacyIcons } from "../shared/icons";
import { t } from "../shared/i18n";
import targetLanguages from "../shared/target-languages.json";
import {
  Languages,
  BookOpen,
  PenLine,
  Sparkles,
  AlignLeft,
  Code2,
  Lightbulb,
  ScanSearch,
} from "lucide-react";
import type { Action } from "../shared/config";
import type { ReactNode } from "react";
export const actionIcons = {
  languages: Languages,
  book: BookOpen,
  pen: PenLine,
  sparkles: Sparkles,
  align: AlignLeft,
  code: Code2,
  lightbulb: Lightbulb,
  scan: ScanSearch,
};
export function ActionIcon({
  icon,
  size = 18,
}: {
  icon: Action["icon"];
  size?: number;
}) {
  if (icon === "book" || icon === "pen")
    return (
      <img
        className="action-reference-icon"
        aria-hidden="true"
        alt=""
        width={size}
        height={size}
        src={
          "./reference-icons/streamline-" +
          (icon === "book"
            ? "dictionary-language-book-flat"
            : "ai-edit-spark-flat") +
          ".svg"
        }
      />
    );
  if (icon === "languages")
    return <ReferenceIcon name="ri-translate" size={size} />;
  if (icon === "scan")
    return <ScanSearch size={size} className="sentence-icon" />;
  const glyph = iconPosition(icon);
  if (glyph) {
    const url =
      "url(./command-icons/" +
      glyph.set +
      "-" +
      Math.floor(glyph.index / 128) +
      ".svg)";
    const col = glyph.index % 16,
      row = Math.floor((glyph.index % 128) / 16);
    const position = (col * 100) / 15 + "% " + (row * 100) / 7 + "%";
    return (
      <span
        className="catalog-glyph"
        data-icon={icon}
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          ...(glyph.set === "streamline-color"
            ? {
                backgroundImage: url,
                backgroundSize: "1600% 800%",
                backgroundPosition: position,
              }
            : {
                maskImage: url,
                maskSize: "1600% 800%",
                maskPosition: position,
                backgroundColor: "currentColor",
              }),
        }}
      />
    );
  }
  const Icon = actionIcons[icon as (typeof legacyIcons)[number]] ?? Sparkles;
  return <Icon size={size} />;
}
export function ReferenceIcon({
  name,
  size = 16,
}: {
  name: string;
  size?: number;
}) {
  return (
    <span
      aria-hidden="true"
      className="reference-icon"
      style={{
        width: size,
        height: size,
        maskImage: `url('./reference-icons/${name}.svg')`,
      }}
    />
  );
}
export function Logo() {
  return (
    <img
      className="logo"
      src="./brand/icon.svg"
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
export function BrandMark() {
  return (
    <span
      className="brand-mark"
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: 21,
        height: 21,
        flexShrink: 0,
        backgroundColor: "currentColor",
        mask: "url(./brand/mark-symbol.svg) center / contain no-repeat",
      }}
    />
  );
}
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={"toggle " + (checked ? "on" : "")}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "amber";
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
export const languages = targetLanguages.map((language) => language.name);
export function LanguageSelect({
  value,
  onChange,
  auto = false,
  followLabel,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  auto?: boolean;
  followLabel?: string;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {auto && <option value="auto">{t("自动检测语言")}</option>}
      {!auto && (
        <option value="system">
          {followLabel
            ? t("跟随应用语言（{0}）", followLabel)
            : t("跟随应用语言")}
        </option>
      )}
      {!languages.includes(value) && value !== "auto" && value !== "system" && (
        <option>{value}</option>
      )}
      {languages.map((l) => (
        <option key={l}>{l}</option>
      ))}
    </select>
  );
}
