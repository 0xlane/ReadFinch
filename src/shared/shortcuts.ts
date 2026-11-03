import { t } from "./i18n";
import type { Config } from "./config";

export const DEFAULT_ACTION_SHORTCUTS: Record<string, string> = {
  translate: "Alt+T",
  dictionary: "Alt+Shift+D",
  polish: "Alt+Shift+W",
};
const modifiers: Record<string, string> = {
  ctrl: "Control",
  control: "Control",
  alt: "Alt",
  option: "Alt",
  shift: "Shift",
  cmd: "Command",
  command: "Command",
  commandorcontrol: "CommandOrControl",
  cmdorctrl: "CommandOrControl",
  meta: "Super",
  super: "Super",
  win: "Super",
  windows: "Super",
};
const keyNames = [
  "Space",
  "Tab",
  "Enter",
  "Escape",
  "Backspace",
  "Delete",
  "Insert",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Left",
  "Right",
  "Up",
  "Down",
  "Plus",
];
const aliases: Record<string, string> = {
  esc: "Escape",
  return: "Enter",
  del: "Delete",
  arrowleft: "Left",
  arrowright: "Right",
  arrowup: "Up",
  arrowdown: "Down",
};
const order = [
  "CommandOrControl",
  "Command",
  "Control",
  "Super",
  "Alt",
  "Shift",
];
export function normalizeShortcut(value: string): string {
  if (!value.trim()) return "";
  const parts = value.split("+").map((part) => part.trim());
  const mods: string[] = [];
  const keys: string[] = [];
  for (const part of parts) {
    const mod = modifiers[part.toLowerCase()];
    if (mod) {
      if (mods.includes(mod)) throw Error(t("修饰键重复"));
      mods.push(mod);
      continue;
    }
    const key =
      aliases[part.toLowerCase()] ??
      keyNames.find((key) => key.toLowerCase() === part.toLowerCase()) ??
      (/^(?:[a-z0-9]|F(?:[1-9]|1\d|2[0-4]))$/i.test(part)
        ? part.toUpperCase()
        : /^[,./;'\[\]\\\-=]$/.test(part)
          ? part
          : undefined);
    if (!key) throw Error(t("不支持的按键"));
    keys.push(key);
  }
  if (keys.length !== 1 || !mods.some((mod) => mod !== "Shift"))
    throw Error(t("请使用 Ctrl、Alt、⌘ 或 Win 加一个普通按键"));
  return [...order.filter((mod) => mods.includes(mod)), keys[0]].join("+");
}
export function currentShortcutPlatform(): string {
  if (typeof process !== "undefined" && process.platform)
    return process.platform;
  return typeof navigator !== "undefined" && /Mac/i.test(navigator.platform)
    ? "darwin"
    : "win32";
}
export function shortcutIdentity(
  value: string,
  platform = currentShortcutPlatform(),
) {
  const normalized = normalizeShortcut(value);
  if (!normalized) return "";
  const parts = normalized
    .split("+")
    .map((part) =>
      part === "CommandOrControl"
        ? platform === "darwin"
          ? "Command"
          : "Control"
        : part === "Super" && platform === "darwin"
          ? "Command"
          : part,
    );
  return [...new Set(parts.slice(0, -1))]
    .sort()
    .concat(parts.at(-1)!)
    .join("+");
}
export function formatShortcut(
  value: string,
  platform = currentShortcutPlatform(),
) {
  if (!value) return t("未设置");
  return normalizeShortcut(value)
    .split("+")
    .map((part) => {
      if (part === "CommandOrControl")
        return platform === "darwin" ? "⌘" : "Ctrl";
      return (
        (
          {
            Control: platform === "darwin" ? "⌃" : "Ctrl",
            Command: "⌘",
            Super: platform === "darwin" ? "⌘" : "Win",
            Alt: platform === "darwin" ? "⌥" : "Alt",
            Shift: platform === "darwin" ? "⇧" : "Shift",
            Space: "Space",
          } as Record<string, string>
        )[part] ?? part
      );
    })
    .join(" + ");
}
type KeyEvent = {
  key: string;
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  isComposing?: boolean;
};
export function shortcutFromEvent(
  event: KeyEvent,
  platform = currentShortcutPlatform(),
): string | null {
  if (
    event.isComposing ||
    ["Dead", "Process", "Unidentified"].includes(event.key)
  )
    return null;
  const key = /^[a-z0-9]$/i.test(event.key)
    ? event.key
    : /^(Key[A-Z]|Digit[0-9])$/.test(event.code)
      ? event.code.replace(/^(Key|Digit)/, "")
      : event.code === "Space"
        ? "Space"
        : event.key === "+"
          ? "Plus"
          : event.key;
  try {
    return normalizeShortcut(
      [
        event.metaKey ? (platform === "darwin" ? "Command" : "Super") : "",
        event.ctrlKey ? "Control" : "",
        event.altKey ? "Alt" : "",
        event.shiftKey ? "Shift" : "",
        key,
      ]
        .filter(Boolean)
        .join("+"),
    );
  } catch {
    return null;
  }
}
export type ShortcutBinding = {
  id: string;
  label: string;
  key: string;
  actionId?: string;
};
export function shortcutBindings(
  config: Pick<Config, "shortcuts" | "actions">,
  includeDisabled = false,
): ShortcutBinding[] {
  return [
    {
      id: "selection",
      label: t("选区指令菜单"),
      key: config.shortcuts.selection,
    },
    {
      id: "capture",
      label: t("框选屏幕文字（OCR）"),
      key: config.shortcuts.capture,
    },
    {
      id: "clipboard",
      label: t("读取剪贴板"),
      key: config.shortcuts.clipboard,
    },
    ...config.actions
      .filter((action) => includeDisabled || action.enabled)
      .map((action) => ({
        id: "action:" + action.id,
        label: action.name,
        key: action.shortcut,
        actionId: action.id,
      })),
  ].filter((binding) => !!binding.key);
}
export function shortcutConflict(
  config: Pick<Config, "shortcuts" | "actions">,
  platform = currentShortcutPlatform(),
) {
  const seen = new Map<string, string>();
  for (const binding of shortcutBindings(config)) {
    const key = shortcutIdentity(binding.key, platform);
    if (seen.has(key))
      return t("「{0}」与「{1}」的快捷键冲突", binding.label, seen.get(key));
    seen.set(key, binding.label);
  }
  return "";
}
