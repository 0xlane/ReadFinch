import { iconPosition, type legacyIcons } from "../shared/icons";
import { t } from "../shared/i18n";
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
    <svg
      className="brand-mark"
      viewBox="0 0 128 128"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M46 58H57Q59 58 59 60V77C59 92 48 102 34 103C37 98 38 95 38 92C28 91 22 84 22 76C22 66 32 58 46 58Z" />
      <path d="M91 27H104Q106 27 106 29V49C106 66 94 77 78 78C82 72 83 69 83 65C72 64 65 57 65 47C65 36 77 27 91 27Z" />
    </svg>
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
export const languages = [
  "简体中文",
  "English",
  "繁體中文",
  "日本語",
  "한국어",
  "Français",
  "Deutsch",
  "Español",
];
export function LanguageSelect({
  value,
  onChange,
  auto = false,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  auto?: boolean;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {auto && <option value="auto">{t("自动检测语言")}</option>}
      {!languages.includes(value) && value !== "auto" && (
        <option>{value}</option>
      )}
      {languages.map((l) => (
        <option key={l}>{l}</option>
      ))}
    </select>
  );
}
