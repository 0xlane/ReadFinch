import { app } from "electron";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { t } from "../shared/i18n";

export const LOGIN_ARG = "--autostart";
const args = () =>
  app.isPackaged ? [LOGIN_ARG] : [app.getAppPath(), LOGIN_ARG];
// Retain the registration key so existing startup preferences are not duplicated.
const windowsName = () => (app.isPackaged ? "TextHop" : "TextHop Development");
const windowsCommand = () => ({
  path:
    (app.isPackaged && process.env.PORTABLE_EXECUTABLE_FILE) ||
    process.execPath,
  args: args(),
});
const desktopFile = () =>
  path.join(
    app.getPath("appData"),
    "autostart",
    app.isPackaged
      ? "app.texthop.TextHop.desktop"
      : "app.texthop.TextHop-dev.desktop",
  );

export function startsInTray(argv: string[]) {
  return (
    argv.includes(LOGIN_ARG) ||
    (process.platform === "darwin" &&
      app.isPackaged &&
      app.getLoginItemSettings().wasOpenedAtLogin)
  );
}

export function loginEnabled() {
  if (process.platform === "win32") {
    const state = app.getLoginItemSettings(windowsCommand());
    // openAtLogin alone ignores the Startup Apps/Task Manager disable flag.
    return state.launchItems.some(
      (item) =>
        item.name === windowsName() && item.scope === "user" && item.enabled,
    );
  }
  if (process.platform === "darwin")
    return app.getLoginItemSettings().openAtLogin;
  const file = desktopFile();
  if (!existsSync(file)) return false;
  const entry =
    readFileSync(file, "utf8").split("[Desktop Entry]")[1]?.split(/^\[/m)[0] ??
    "";
  return (
    /^Type=Application\s*$/m.test(entry) &&
    !/^(Hidden=true|X-GNOME-Autostart-enabled=false)\s*$/im.test(entry)
  );
}

// Desktop Entry exec arguments are quoted once for Exec and escaped again for the key-value format.
export function desktopArgument(value: string) {
  if (/[\r\n\0]/.test(value)) throw Error(t("启动路径包含不支持的字符"));
  return (
    '"' +
    value
      .replace(/(["`$\\])/g, "\\$1")
      .replaceAll("\\", "\\\\")
      .replaceAll("%", "%%") +
    '"'
  );
}

export function setLoginEnabled(enabled: boolean) {
  if (process.platform === "win32") {
    app.setLoginItemSettings({
      ...windowsCommand(),
      name: windowsName(),
      openAtLogin: enabled,
      enabled,
    });
  } else if (process.platform === "darwin") {
    app.setLoginItemSettings({ openAtLogin: enabled });
    if (enabled && app.getLoginItemSettings().status === "requires-approval")
      throw Error(t("请在系统设置的登录项中允许伴读雀。"));
  } else {
    const file = desktopFile();
    if (!enabled) rmSync(file, { force: true });
    else {
      const executable =
        (app.isPackaged && process.env.APPIMAGE) || process.execPath;
      const command = [executable, ...args()].map(desktopArgument).join(" ");
      const entry = [
        "[Desktop Entry]",
        "Type=Application",
        "Name=ReadFinch",
        "Exec=" + command,
        "Terminal=false",
        "",
      ].join("\n");
      mkdirSync(path.dirname(file), { recursive: true });
      const temp = file + "." + randomUUID() + ".tmp";
      try {
        writeFileSync(temp, entry, { mode: 0o600, flag: "wx" });
        renameSync(temp, file);
      } finally {
        rmSync(temp, { force: true });
      }
    }
  }
  if (loginEnabled() !== enabled)
    throw Error(t("操作系统没有应用这次启动项更改。"));
}
