import { isTranslationOnly } from "../shared/provider-presets";
import { APP_NAME, APP_ID } from "../shared/brand";
import { OnlineVoiceIdSchema } from "../shared/tts";
import {
  app,
  BrowserWindow,
  ipcMain,
  clipboard,
  screen,
  globalShortcut,
  desktopCapturer,
  nativeImage,
  nativeTheme,
  dialog,
  shell,
  session,
  Menu,
  Tray,
} from "electron";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { LocalNotes } from "../core/local-notes";
import {
  suggestionBinding,
  suggestionMessages,
  parseSuggestions,
  type SuggestedNote,
} from "../core/note-suggestions";
import { sameDraft } from "../shared/draft";
import { CompletionCache } from "../core/completion-cache";
import { providerFetch } from "./provider-network";
import { ConfigStore, readJson, atomicWrite } from "../core/store";
import { DavSync, davUrl, type DavSettings } from "../core/sync";
import {
  complete,
  listModels,
  synthesizeSpeech,
  actionMessages,
  recognizeVision,
  JobGate,
  setProviderTransport,
} from "../core/providers";
import { parseHeaders } from "../shared/headers";
import { createNotebase, connectedBook } from "../shared/notebases";
import {
  MAX_SUGGESTIONS,
  noteSourceApp,
  NoteInputSchema,
  mapNoteToBook,
  type NoteInput,
} from "../shared/notes";
import { resolveLocale, setLocale, t } from "../shared/i18n";
import {
  canonicalizeBuiltinConfig,
  localizeBuiltinConfig,
  matchingBuiltinOutput,
} from "../shared/action-language";
import { resolveResultLanguage } from "../shared/languages";
import {
  editToolbar,
  toolbarEnabled,
  toolbarItems,
  type ToolbarMenu,
  type ToolbarView,
} from "../shared/toolbar";
import { toolbarWindowLayout } from "../core/toolbar-placement";
import { basicLanguage, detectLanguage } from "../core/language";
import { parseOutput, jsonContract } from "../shared/action-output";
import { promptVariables } from "../shared/config";
import { assetsReady, offlineRecognize } from "../core/ocr";
import {
  parseConfig,
  mergeConfig,
  shortcutPreview,
  ocrProfiles,
  type Config,
} from "../shared/config";
import type {
  Snapshot,
  Selection,
  Capture,
  JobEvent,
  EventMap,
  CallMap,
  Interaction,
  SettingsTab,
  SettingsLocation,
} from "../shared/api";
import {
  planPanel,
  panelBounds,
  type PanelPlacement,
  type Point,
} from "../core/placement";
import { ShortcutRegistry, ShortcutRepeatGuard } from "../core/shortcuts";
import { shortcutBindings } from "../shared/shortcuts";
import { SelectionService } from "./native";
import {
  LOGIN_ARG,
  loginEnabled,
  setLoginEnabled,
  startsInTray,
} from "./login-startup";
import { Secrets } from "./secrets";

const dataArg = process.argv.find((a) => a.startsWith("--data-dir="));
if (dataArg) app.setPath("userData", path.resolve(dataArg.slice(11)));
else app.setPath("userData", path.join(app.getPath("appData"), APP_NAME));
app.setName(APP_NAME);
if (process.platform === "win32") app.setAppUserModelId(APP_ID);
app.commandLine.appendSwitch("enable-features", "GlobalShortcutsPortal");
if (process.platform === "linux") app.setDesktopName(APP_ID + ".desktop");
const root = app.getAppPath();
const resource = app.isPackaged ? process.resourcesPath : root;
const nativeRoot = path.join(resource, "native");
const dataDir = app.getPath("userData");
const store = new ConfigStore(dataDir, canonicalizeBuiltinConfig);
const localNotes = new LocalNotes(path.join(dataDir, "local-notes.sqlite"));
const secrets = new Secrets(dataDir);
const native = new SelectionService(nativeRoot);
const jobs = new JobGate();
const resultCache = new CompletionCache();
setProviderTransport(providerFetch);
const cachedComplete = resultCache.run.bind(resultCache);
let main: BrowserWindow;
let pill: BrowserWindow | undefined;
let panel: BrowserWindow | undefined;
let overlay: BrowserWindow | undefined;
let tray: Tray | undefined;
let activeCapture: Capture | null = null;
let captureDisplay: Electron.Display | undefined;
let captureBusy = false;
let quitting = false;
let speechOwner:
  { win: BrowserWindow; id: string; controller: AbortController } | undefined;
let settingsLocation: SettingsLocation = { tab: "general", request: 0 };
let toolbarFrame = "";
let toolbarRegion = "";
let toolbarMenu: ToolbarMenu = "none";
let toolbarPausedUntil = 0;
let resumeTimer: ReturnType<typeof setTimeout> | undefined;
const pauseFile = path.join(dataDir, "device-toolbar.json");
let interaction: Interaction | null = null;
type PendingSuggestion = {
  id: string;
  bindingKey: string;
  controller: AbortController;
  translated: boolean;
  notes: SuggestedNote[];
};
let pendingSuggestion: PendingSuggestion | undefined;
let triggerAnchor: Point = { x: 0, y: 0 };
let panelPinned = false;
let panelPlacedByUser = false;
let panelPlacement: PanelPlacement | undefined;
let panelFrame = "";
let panelDialog = false;
let captureReturn: BrowserWindow | undefined;
let captureReturnPinned = false;
let settings: DavSettings = {
  enabled: false,
  url: "",
  username: "",
  remotePath: "ReadFinch/config.json",
};
let shortcutErrors: string[] = [];
let shortcutRecording = "";
let selectionReadCount = 0;
let shortcutGeneration = 0;
let shortcutTestTarget: "external" | "panel" | "settings" | undefined;
let nextSelectionForTest:
  { value: Selection | undefined; delay: number } | undefined;
const repeatGuard = new ShortcutRepeatGuard();
const shortcutRegistry = new ShortcutRegistry(
  globalShortcut,
  (id) => void dispatchShortcut(id),
  process.platform,
);
let pendingImport:
  { token: string; config: ReturnType<typeof parseConfig> } | undefined;
function davScope(value: DavSettings) {
  return value.url.replace(/\/+$/, "") + "|" + value.username;
}
function credentialScope(id: string) {
  const [kind, profileId] = id.split(":");
  if (id === "webdav") return davScope(settings);
  const profile =
    kind === "text" || kind === "headers"
      ? store.config.providers.find((p) => p.id === profileId)
      : undefined;
  return profile?.endpoint.replace(/\/+$/, "") ?? "missing";
}
const owners = new Map<string, number>();
async function credentials(provider: { id: string; endpoint: string }) {
  const scope = provider.endpoint.replace(/\/+$/, "");
  const [key, raw] = await Promise.all([
    secrets.get("text:" + provider.id, scope),
    secrets.get("headers:" + provider.id, scope),
  ]);
  return { key, headers: parseHeaders(raw ?? "") };
}
function interfaceLocale() {
  return resolveLocale(
    store.config.appearance.language,
    app.getPreferredSystemLanguages(),
  );
}
function runtimeConfig() {
  return localizeBuiltinConfig(
    store.config,
    interfaceLocale(),
    app.getPreferredSystemLanguages(),
  );
}
const dav = new DavSync(
  store,
  () => settings,
  () => secrets.get("webdav", davScope(settings)),
);
const windows = new Set<BrowserWindow>();
const safeText = z.string().max(100000);
const jobId = z.string().regex(/^[\w-]{1,100}$/);
function send<K extends keyof EventMap>(
  win: BrowserWindow | undefined,
  key: K,
  value: EventMap[K],
) {
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed())
    win.webContents.send("readfinch:" + key, value);
}
function broadcast<K extends keyof EventMap>(key: K, value: EventMap[K]) {
  for (const win of windows) send(win, key, value);
}
async function assetDir() {
  return path.join(resource, app.isPackaged ? "ocr" : "assets/ocr");
}
async function snapshot(): Promise<Snapshot> {
  const baseline = await dav.state();
  let lastSync: string | undefined;
  try {
    if (baseline?.endpoint === davUrl(settings)) lastSync = baseline.lastSync;
  } catch {}
  const credentialIds: string[] = [];
  for (const id of secrets.ids(credentialScope)) {
    if (await secrets.get(id, credentialScope(id))) credentialIds.push(id);
  }
  return {
    version: app.getVersion(),
    toolbarPausedUntil,
    interfaceLocale: interfaceLocale(),
    systemLanguages: app.getPreferredSystemLanguages(),
    config: runtimeConfig(),
    revision: store.revision,
    credentialIds,
    secureStorage: secrets.available,
    ocrReady: await assetsReady(await assetDir()),
    platform:
      process.platform +
      (process.env.XDG_SESSION_TYPE === "wayland" ? " / Wayland" : ""),
    nativeStatus: t(native.status),
    nativeState: native.state,
    effectiveTheme: nativeTheme.shouldUseDarkColors ? "dark" : "light",
    shortcutErrors,
    sync: {
      ...settings,
      lastSync,
      hasPassword: !!(await secrets.get("webdav", davScope(settings))),
    },
    recovery: store.recovery,
  };
}
async function configChanged() {
  if (
    pendingSuggestion &&
    suggestionBinding(runtimeConfig())?.key !== pendingSuggestion.bindingKey
  )
    cancelSuggestion();
  resultCache.configure(store.config.cache);
  setLocale(interfaceLocale());
  for (const win of BrowserWindow.getAllWindows()) win.setTitle(t("伴读雀"));
  nativeTheme.themeSource = store.config.appearance.theme;
  applyTheme();
  const selection = native.current;
  if (
    !selection ||
    !toolbarEnabled(store.config, selection.app, toolbarPausedUntil)
  )
    pill?.hide();
  else if (pill?.isVisible()) updateToolbar();
  registerShortcuts();
  updateTray();
  const state = await snapshot();
  broadcast("config", state);
  return state;
}
function applyTheme() {
  const effective = nativeTheme.shouldUseDarkColors ? "dark" : "light";
  for (const win of windows)
    if (win !== pill && win !== panel && win !== overlay && !win.isDestroyed())
      win.setBackgroundColor(effective === "dark" ? "#202020" : "#ffffff");
  broadcast("theme", { preference: store.config.appearance.theme, effective });
}
function cancelWindowJobs(win: BrowserWindow | undefined) {
  if (!win || win.isDestroyed()) return;
  if (win === panel) cancelSuggestion();
  for (const [id, owner] of owners)
    if (owner === win.webContents.id) {
      jobs.cancel(id);
      owners.delete(id);
    }
}
function dismissPanel() {
  shortcutGeneration++;
  if (!panel || panel.isDestroyed() || panel.webContents.isDestroyed()) return;
  cancelWindowJobs(panel);
  send(panel, "hidden", undefined);
  panel?.hide();
  panelPinned = false;
}
function contextError(error: Error) {
  openPanel({
    id: randomUUID(),
    source: "empty",
    text: "",
    error: error.message,
  });
}
function trayIcon() {
  const base = path.join(root, "dist/renderer/brand");
  if (process.platform === "darwin") {
    const image = nativeImage.createFromPath(
      path.join(base, "trayTemplate.png"),
    );
    image.setTemplateImage(true);
    return image;
  }
  const name =
    store.config.selection.automatic && toolbarPausedUntil <= Date.now()
      ? "tray"
      : "tray-paused";
  return path.join(
    base,
    name + (process.platform === "win32" ? ".ico" : "-24.png"),
  );
}
function updateTray() {
  if (!tray || tray.isDestroyed()) return;
  const automatic =
    store.config.selection.automatic && toolbarPausedUntil <= Date.now();
  const description = !automatic
    ? t("自动划词已暂停")
    : native.state === "ready"
      ? t("自动划词已开启")
      : native.status;
  tray.setImage(trayIcon());
  tray.setToolTip(`${t("伴读雀")} · ${description}`);
  const menu = Menu.buildFromTemplate([
    {
      label: t("划词工具栏"),
      type: "checkbox",
      checked: automatic,
      click: () => {
        if (
          toolbarPausedUntil > Date.now() &&
          store.config.selection.automatic
        ) {
          void saveToolbarPause(0).catch((error) =>
            dialog.showErrorBox(t("无法恢复划词工具栏"), error.message),
          );
          return;
        }
        const config = store.config;
        config.selection.automatic = !config.selection.automatic;
        void store
          .save(config, store.revision)
          .then(configChanged)
          .catch((error) =>
            dialog.showErrorBox(t("无法更改划词状态"), error.message),
          );
      },
    },
    {
      label: t("框选屏幕文字（OCR）"),
      accelerator: store.config.shortcuts.capture || undefined,
      click: () => void capture().catch(contextError),
    },
    {
      label: t("读取剪贴板"),
      click: () => void openClipboard().catch(contextError),
    },
    { type: "separator" },
    {
      label: t("设置…"),
      click: () => {
        openSettings("general");
      },
    },
    {
      id: "launch-at-login",
      label: t("开机自启"),
      type: "checkbox",
      click: (item) => {
        try {
          setLoginEnabled(item.checked);
        } catch (error) {
          dialog.showErrorBox(t("无法更改开机自启"), (error as Error).message);
        }
        updateTray();
      },
    },
    { label: `${t("伴读雀")} ${app.getVersion()}`, enabled: false },
    {
      label: t("退出伴读雀"),
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
  const startupItem = menu.getMenuItemById("launch-at-login")!;
  const refreshStartup = () => {
    try {
      startupItem.checked = loginEnabled();
      startupItem.enabled = true;
    } catch {
      startupItem.enabled = false;
    }
  };
  refreshStartup();
  menu.on("menu-will-show", refreshStartup);
  tray.setContextMenu(menu);
}
function createWindow(
  mode: "main" | "panel" | "pill" | "capture",
  options: Electron.BrowserWindowConstructorOptions = {},
) {
  const win = new BrowserWindow({
    width: 940,
    height: 740,
    minWidth: 760,
    minHeight: 560,
    show: false,
    frame: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#202020" : "#ffffff",
    title: t("伴读雀"),
    icon: path.join(
      root,
      "dist/renderer",
      process.platform === "win32" ? "icon.ico" : "icon.png",
    ),
    autoHideMenuBar: true,
    ...options,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  const ownerId = win.webContents.id;
  windows.add(win);
  function releaseSpeech() {
    if (speechOwner?.win === win) {
      speechOwner.controller.abort();
      speechOwner = undefined;
    }
  }
  win.webContents.on("render-process-gone", releaseSpeech);
  win.on("closed", () => {
    releaseSpeech();
    windows.delete(win);
    if (win === panel) cancelSuggestion();
    for (const [id, owner] of owners)
      if (owner === ownerId) {
        jobs.cancel(id);
        owners.delete(id);
      }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  void win.loadFile(path.join(__dirname, "../renderer/index.html"), {
    query: { mode },
  });
  return win;
}
function openMain() {
  if (main.isMinimized()) main.restore();
  main.show();
  main.focus();
}
function openSettings(
  tab: SettingsTab = "general",
  target?: SettingsLocation["target"],
  noteId?: string,
  actionId?: string,
) {
  shortcutGeneration++;
  settingsLocation = {
    tab,
    target,
    noteId,
    actionId,
    request: settingsLocation.request + 1,
  };
  pill?.hide();
  dismissPanel();
  openMain();
  send(main, "settings", settingsLocation);
}
function updateToolbar(): ToolbarView | null {
  const selection = native.current;
  if (!selection || !pill || pill.isDestroyed()) return null;
  const items = toolbarItems(store.config);
  const layout = toolbarWindowLayout(
    triggerAnchor,
    screen.getDisplayNearestPoint(triggerAnchor).workArea,
    items.filter((i) => i.pinned).length,
    items.length,
    toolbarMenu,
    process.platform !== "darwin",
  );
  const frame = JSON.stringify(layout.bounds);
  if (frame !== toolbarFrame) {
    pill.setBounds(layout.bounds);
    toolbarFrame = frame;
  }
  const region = JSON.stringify(layout.shape);
  if (layout.shape && region !== toolbarRegion) {
    pill.setShape(layout.shape);
    toolbarRegion = region;
  }
  const state = {
    token: selection.token,
    app: selection.app,
    mode: toolbarMenu,
    bar: layout.bar,
    popup: layout.popup,
  };
  send(pill, "toolbarState", state);
  return state;
}
function armToolbarResume() {
  clearTimeout(resumeTimer);
  const delay = toolbarPausedUntil - Date.now();
  if (delay <= 0) {
    toolbarPausedUntil = 0;
    return;
  }
  resumeTimer = setTimeout(() => {
    toolbarPausedUntil = 0;
    updateTray();
    void snapshot().then((s) => broadcast("config", s));
  }, delay);
  resumeTimer.unref();
}
async function saveToolbarPause(until: number) {
  await atomicWrite(pauseFile, JSON.stringify({ until }));
  toolbarPausedUntil = until;
  armToolbarResume();
  return configChanged();
}
function showPill(
  selection: Selection,
  anchor = screen.getCursorScreenPoint(),
) {
  if (quitting || captureBusy || selectionReadCount) return;
  const cfg = store.config;
  if (!toolbarEnabled(cfg, selection.app, toolbarPausedUntil)) {
    pill?.hide();
    return;
  }
  // Cursor coordinates are already DIPs, unlike Windows UIA rectangles.
  triggerAnchor = anchor;
  toolbarMenu = "none";
  if (!pill || pill.isDestroyed()) {
    toolbarFrame = "";
    toolbarRegion = "";
    pill = createWindow("pill", {
      width: 190,
      height: 40,
      minWidth: 1,
      minHeight: 1,
      resizable: false,
      transparent: true,
      backgroundColor: "#00000000",
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
    });
    pill.on("hide", () => {
      toolbarMenu = "none";
      send(pill, "toolbarState", null);
    });
    pill.on("blur", () => {
      if (toolbarMenu !== "none" && pill?.isVisible()) {
        toolbarMenu = "none";
        updateToolbar();
      }
    });
    pill.once("ready-to-show", () => {
      if (
        !quitting &&
        !captureBusy &&
        !selectionReadCount &&
        pill &&
        !pill.isDestroyed() &&
        native.current &&
        toolbarEnabled(store.config, native.current.app, toolbarPausedUntil)
      ) {
        updateToolbar();
        pill!.showInactive();
      }
    });
  } else {
    pill.setFocusable(false);
    updateToolbar();
    pill.showInactive();
  }
}
function openSelection(actionId?: string, current?: Selection | null) {
  if (captureBusy) return;
  if (
    actionId &&
    !store.config.actions.some(
      (action) => action.id === actionId && action.enabled,
    )
  )
    return;
  const s = current === undefined ? native.current : current;
  if (
    !s ||
    store.config.selection.excludedApps.some((a) =>
      s.app.toLowerCase().includes(a.toLowerCase()),
    )
  ) {
    openPanel({
      id: randomUUID(),
      source: "selection-unavailable",
      text: "",
    });
    return;
  }
  openPanel(
    {
      id: randomUUID(),
      source: "selection",
      text: s.text,
      selection: s,
      actionId,
    },
    pill?.isVisible() ? triggerAnchor : screen.getCursorScreenPoint(),
  );
}
async function openClipboard() {
  const text = (await clipboard.readText()).slice(0, 100000);
  openPanel({ id: randomUUID(), source: "clipboard", text });
}
function openPanel(value: Interaction, anchor = screen.getCursorScreenPoint()) {
  shortcutGeneration++;
  cancelWindowJobs(panel);
  const reusePinned = panelPinned && panel?.isVisible();
  interaction = { ...value, pinned: !!reusePinned };
  if (!reusePinned) {
    const expectsSuggestions =
      store.config.noteSuggestion.enabled &&
      (!value.actionId || value.actionId === "translate");
    panelPlacement = planPanel(
      anchor,
      screen.getDisplayNearestPoint(anchor).workArea,
      expectsSuggestions || value.capture ? 520 : 420,
    );
    panelFrame = "";
    panelPlacedByUser = false;
    panelPinned = false;
  }
  pill?.hide();
  const deliver = () => {
    if (!reusePinned) {
      const bounds = panelBounds(panelPlacement!, 220);
      panelFrame = JSON.stringify(bounds);
      panel!.setBounds(bounds);
    }
    panel!.show();
    panel!.focus();
    send(panel, "interaction", interaction!);
  };
  if (!panel || panel.isDestroyed()) {
    panel = createWindow("panel", {
      width: 500,
      height: 320,
      minWidth: 320,
      minHeight: 180,
      skipTaskbar: true,
      alwaysOnTop: true,
      maximizable: false,
      fullscreenable: false,
      transparent: true,
      backgroundColor: "#00000000",
    });
    panel.once("ready-to-show", deliver);
    panel.on("blur", () => {
      if (!quitting && !panelPinned && !panelDialog && !captureBusy)
        dismissPanel();
    });
    panel.on("will-move", () => {
      panelPlacedByUser = true;
    });
    panel.on("will-resize", () => {
      panelPlacedByUser = true;
    });
    panel.on("close", (event) => {
      if (!quitting) {
        event.preventDefault();
        dismissPanel();
      }
    });
  } else if (!panel.webContents.isLoadingMainFrame()) deliver();
}
function registerShortcuts() {
  shortcutErrors = shortcutRegistry.update(shortcutBindings(store.config));
  globalShortcut.setSuspended(!!shortcutRecording);
}
function endShortcutRecording() {
  shortcutRecording = "";
  globalShortcut.setSuspended(false);
}
async function dispatchShortcut(id: string) {
  if (quitting || captureBusy || shortcutRecording || !repeatGuard.accept(id))
    return;
  const binding = shortcutBindings(store.config).find((item) => item.id === id);
  if (!binding) return;
  if (id === "capture") {
    await capture();
    return;
  }
  if (id === "clipboard") {
    await openClipboard().catch(contextError);
    return;
  }
  const focused = BrowserWindow.getFocusedWindow();
  if (
    shortcutTestTarget === "settings" ||
    (!shortcutTestTarget && focused === main)
  )
    return;
  if (
    binding.actionId &&
    (shortcutTestTarget === "panel" ||
      (!shortcutTestTarget && focused === panel))
  ) {
    send(panel, "actionShortcut", { actionId: binding.actionId });
    return;
  }
  const generation = ++shortcutGeneration;
  selectionReadCount++;
  try {
    let selection: Selection | undefined;
    if (nextSelectionForTest) {
      const fixture = nextSelectionForTest;
      nextSelectionForTest = undefined;
      await new Promise((resolve) => setTimeout(resolve, fixture.delay));
      selection = fixture.value;
    } else selection = await native.readCurrent();
    if (generation !== shortcutGeneration || captureBusy || quitting) return;
    if (!shortcutTestTarget && BrowserWindow.getFocusedWindow() === main)
      return;
    openSelection(binding.actionId, selection ?? null);
  } catch {
    if (generation === shortcutGeneration && !quitting && !captureBusy)
      openSelection(undefined, null);
  } finally {
    selectionReadCount--;
  }
}
function imageCapture(image: Electron.NativeImage): Capture {
  const size = image.getSize();
  if (image.isEmpty() || size.width * size.height > 60_000_000)
    throw Error(t("图片为空或尺寸过大"));
  return { dataUrl: image.toDataURL(), ...size };
}
function openImage(image: Capture, source: "capture" | "image") {
  openPanel({ id: randomUUID(), source, text: "", capture: image });
}
function restoreAfterCapture() {
  if (captureReturn && !captureReturn.isDestroyed()) {
    if (captureReturn === panel) panelPinned = captureReturnPinned;
    captureReturn.show();
    captureReturn.focus();
  }
  captureReturn = undefined;
  captureReturnPinned = false;
}
async function capture() {
  if (captureBusy) throw Error(t("截图正在进行"));
  shortcutGeneration++;
  captureBusy = true;
  captureReturn = panel?.isVisible()
    ? panel
    : main.isVisible()
      ? main
      : undefined;
  captureReturnPinned = panelPinned;
  native.invalidate();
  pill?.hide();
  dismissPanel();
  main.hide();
  try {
    await new Promise((r) => setTimeout(r, 200));
    if (
      process.platform === "linux" &&
      (process.env.XDG_SESSION_TYPE === "wayland" ||
        process.env.WAYLAND_DISPLAY)
    ) {
      const { stdout } = await promisify(execFile)(
        "python3",
        [path.join(nativeRoot, "linux/portal-capture.py")],
        { timeout: 100000, maxBuffer: 10000 },
      );
      const result = JSON.parse(stdout.trim());
      if (result.cancelled) {
        restoreAfterCapture();
        return;
      }
      if (result.error) throw Error(result.error);
      if (!result.uri?.startsWith("file:"))
        throw Error(t("截图门户未返回本地图片"));
      activeCapture = imageCapture(
        nativeImage.createFromPath(fileURLToPath(result.uri)),
      );
      openImage(activeCapture, "capture");
      activeCapture = null;
      captureReturn = undefined;
      return;
    }
    const display = screen.getDisplayNearestPoint(
      screen.getCursorScreenPoint(),
    );
    captureDisplay = display;
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: {
        width: Math.round(display.size.width * display.scaleFactor),
        height: Math.round(display.size.height * display.scaleFactor),
      },
    });
    const source =
      sources.find((s) => s.display_id === String(display.id)) ??
      (sources.length === 1 ? sources[0] : undefined);
    if (!source || source.thumbnail.isEmpty())
      throw Error(t("无法获取屏幕，请检查系统录屏权限"));
    activeCapture = imageCapture(source.thumbnail);
    overlay = createWindow("capture", {
      ...display.bounds,
      // Normal Windows bounds are constrained by the taskbar and thick frame.
      // A native fullscreen surface keeps screen pixels aligned at fractional DPI.
      fullscreen: process.platform !== "darwin",
      enableLargerThanScreen: true,
      thickFrame: false,
      roundedCorners: false,
      hasShadow: false,
      minWidth: 1,
      minHeight: 1,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      backgroundColor: "#000000",
    });
    if (process.platform === "darwin")
      overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlay.on("closed", () => {
      overlay = undefined;
      captureBusy = false;
      activeCapture = null;
      captureDisplay = undefined;
      restoreAfterCapture();
    });
  } catch (e) {
    captureReturn = undefined;
    contextError(e as Error);
  } finally {
    if (!overlay) captureBusy = false;
  }
}
function cancelSuggestion(id?: string) {
  const current = pendingSuggestion;
  if (!current || (id !== undefined && current.id !== id)) return;
  pendingSuggestion = undefined;
  current.controller.abort();
  send(panel, "noteSuggestions", { id: current.id, notebook: "", items: [] });
}
function publishSuggestions(run: PendingSuggestion) {
  if (pendingSuggestion !== run || !run.translated || !run.notes.length) return;
  const cfg = store.config,
    action = cfg.actions.find((a) => a.id === run.notes[0].note.actionId);
  if (!action) return;
  send(panel, "noteSuggestions", {
    id: run.id,
    notebook: connectedBook(cfg, action)?.name ?? action.name,
    needsConnection: !action.noteConnection,
    items: run.notes.map(({ note, summary }) => ({
      term: note.source,
      summary,
    })),
  });
}
function startSuggestions(
  cfg: Config,
  input: Parameters<typeof suggestionMessages>[1] & {
    id: string;
    refresh?: boolean;
  },
) {
  const binding = suggestionBinding(cfg);
  if (!binding) return;
  const { action, provider } = binding;
  const sourceApp = noteSourceApp(interaction);
  const run: PendingSuggestion = {
    id: input.id,
    bindingKey: binding.key,
    controller: new AbortController(),
    translated: false,
    notes: [],
  };
  pendingSuggestion = run;
  const signal = run.controller.signal;
  void (async () => {
    const { key, headers } = await credentials(provider);
    signal.throwIfAborted();
    let notes: SuggestedNote[] = [];
    await cachedComplete(
      { ...provider, headers },
      suggestionMessages(action, input, sourceApp),
      key,
      signal,
      () => {},
      input.refresh,
      (raw) => {
        notes = parseSuggestions(
          raw,
          action,
          input,
          sourceApp,
          provider.model,
          true,
        );
      },
    );
    run.notes = notes;
    publishSuggestions(run);
  })().catch(() => {
    // An optional recommendation must never replace a translation with an error.
    if (pendingSuggestion === run) cancelSuggestion(run.id);
  });
}
async function beginJob(
  win: BrowserWindow,
  id: string,
  kind: "text" | "ocr",
  operation: (
    signal: AbortSignal,
    emit: (event: Partial<JobEvent>) => void,
  ) => Promise<void>,
) {
  jobId.parse(id);
  const controller = jobs.begin(id);
  if (win === panel) cancelSuggestion();
  owners.set(id, win.webContents.id);
  const emit = (event: Partial<JobEvent>) => {
    if (jobs.active(id, controller))
      send(win, "job", { id, kind, status: "streaming", ...event });
  };
  // Paint the first token immediately. Limit subsequent IPC copies of the growing answer.
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Partial<JobEvent> | undefined;
  let lastPaint = 0;
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    if (pending) {
      emit(pending);
      pending = undefined;
      lastPaint = Date.now();
    }
  };
  const stream = (event: Partial<JobEvent>) => {
    if (event.text === undefined) {
      emit(event);
      return;
    }
    pending = event;
    const delay = 32 - (Date.now() - lastPaint);
    if (delay <= 0) flush();
    else timer ??= setTimeout(flush, delay);
  };
  void operation(controller.signal, stream)
    .then(() => {
      flush();
      emit({ status: "done" });
    })
    .catch((e) => {
      if (win === panel) cancelSuggestion(id);
      flush();
      emit({
        status: controller.signal.aborted ? "cancelled" : "error",
        message: (e as Error).message,
      });
    })
    .finally(() => {
      clearTimeout(timer);
      jobs.finish(id, controller);
      owners.delete(id);
    });
}
async function recognize(
  win: BrowserWindow,
  id: string,
  profileId: string,
  dataUrl: string,
  refresh = false,
) {
  const profile = ocrProfiles(store.config).find((p) => p.id === profileId);
  if (!profile) throw Error(t("OCR 服务不存在"));
  if (
    !/^data:image\/(png|jpeg|webp);base64,/.test(dataUrl) ||
    dataUrl.length > 32_000_000
  )
    throw Error(t("图片格式或大小无效"));
  await beginJob(win, id, "ocr", async (signal, emit) => {
    if (profile.kind === "offline") {
      const image = nativeImage.createFromDataURL(dataUrl);
      const size = image.getSize();
      if (image.isEmpty() || size.width * size.height > 60_000_000)
        throw Error(t("图片尺寸无效"));
      const scaled =
        size.width < 1800
          ? image.resize({
              width: Math.min(size.width * 2, 2400),
              quality: "best",
            })
          : image;
      const output = await offlineRecognize(
        scaled.toPNG(),
        await assetDir(),
        AbortSignal.any([signal, AbortSignal.timeout(profile.timeoutMs)]),
        (progress) => emit({ status: "progress", progress }),
      );
      emit({
        status: "streaming",
        text: output.text,
        confidence: output.confidence,
      });
    } else {
      const { key, headers } = await credentials(profile);
      await recognizeVision(
        { ...profile, headers },
        dataUrl,
        key,
        signal,
        (text) => emit({ text }),
        (...args) => cachedComplete(...args, refresh),
      );
    }
  });
}
async function visionTestImage() {
  const win = new BrowserWindow({
    width: 460,
    height: 160,
    show: false,
    webPreferences: { sandbox: true, offscreen: true },
  });
  try {
    await win.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent(
          '<html><body style="background:white;color:black;font:32px Arial;padding:18px">ReadFinch OCR 123<br>你好，世界！</body></html>',
        ),
    );
    await new Promise((resolve) => setTimeout(resolve, 250));
    return (await win.webContents.capturePage()).toDataURL();
  } finally {
    win.destroy();
  }
}
async function saveActionNotes(
  inputs: NoteInput[],
  create = false,
  suggestion?: PendingSuggestion,
) {
  let config = runtimeConfig();
  const revision = store.revision;
  let action = config.actions.find((a) => a.id === inputs[0]?.actionId);
  if (action)
    action = matchingBuiltinOutput(action, inputs[0]?.outputView?.outputSchema);
  if (!action) throw Error(t("指令已变更，请重新运行"));
  if (
    inputs.some(
      (n) =>
        n.actionId !== action!.id ||
        !sameDraft(n.outputView?.outputSchema, action!.outputSchema),
    )
  )
    throw Error(t("指令已变更，请重新运行"));
  const creating = !action.noteConnection;
  if (creating) {
    config = {
      ...config,
      actions: config.actions.map((a) => (a.id === action!.id ? action! : a)),
    };
    if (!create) throw Error(t("请先连接可用的本地笔记库"));
    config = createNotebase(config, action);
    action = config.actions.find((a) => a.id === inputs[0].actionId)!;
  }
  const mapped = inputs.map((n) => mapNoteToBook(config, action!, n));
  if (creating) {
    await store.save(config, revision);
    const key = suggestionBinding(config)?.key;
    if (suggestion && key && pendingSuggestion === suggestion)
      suggestion.bindingKey = key;
  }
  try {
    const ids = localNotes.saveMany(mapped);
    send(main, "notesChanged", undefined);
    if (creating && suggestion) publishSuggestions(suggestion);
    return ids;
  } finally {
    if (creating) await configChanged();
  }
}
async function handle(
  win: BrowserWindow,
  method: keyof CallMap,
  arg: any,
): Promise<unknown> {
  switch (method) {
    case "snapshot":
      return snapshot();
    case "setTheme": {
      const theme = z.enum(["light", "dark", "system"]).parse(arg.theme);
      const config = store.config;
      config.appearance.theme = theme;
      await store.save(config, store.revision);
      return configChanged();
    }
    case "setTranslationPreference": {
      if (win !== panel) throw Error(t("仅可从结果窗口更改此设置"));
      const preference = z
        .union([
          z.strictObject({ targetLanguage: z.string().trim().min(1).max(80) }),
          z.strictObject({ providerId: z.string().min(1).max(100) }),
        ])
        .parse(arg);
      const config = store.config;
      if ("targetLanguage" in preference)
        config.defaults.targetLanguage = preference.targetLanguage;
      else {
        const action = config.actions.find((a) => a.id === "translate");
        if (
          !action ||
          !config.providers.some(
            (p) => p.enabled && p.id === preference.providerId,
          )
        )
          throw Error(t("提供商不可用"));
        action.providerId = preference.providerId;
      }
      await store.save(config, store.revision);
      await configChanged();
      return;
    }
    case "settingsOpen":
      return openSettings(
        z
          .enum([
            "general",
            "text",
            "tts",
            "ocr",
            "actions",
            "shortcuts",
            "config",
            "notes",
          ])
          .parse(arg.tab),
        undefined,
        arg.tab === "notes"
          ? z
              .string()
              .regex(/^[0-9a-f]{64}$/)
              .optional()
              .parse(arg.noteId)
          : undefined,
        arg.tab === "actions"
          ? z.string().max(100).optional().parse(arg.actionId)
          : undefined,
      );
    case "saveNote": {
      if (win !== panel) throw Error(t("仅可从结果窗口保存笔记"));
      const { note, create } = z
        .strictObject({ note: NoteInputSchema, create: z.boolean().optional() })
        .parse(arg);
      return (await saveActionNotes([note], create))[0];
    }
    case "saveSuggestions": {
      if (win !== panel) throw Error(t("仅可从结果窗口保存笔记"));
      const { id, indexes, create } = z
        .strictObject({
          id: jobId,
          indexes: z
            .array(
              z
                .number()
                .int()
                .min(0)
                .max(MAX_SUGGESTIONS - 1),
            )
            .min(1)
            .max(MAX_SUGGESTIONS),
          create: z.boolean().optional(),
        })
        .parse(arg);
      const run = pendingSuggestion;
      if (
        !run?.translated ||
        run.id !== id ||
        suggestionBinding(runtimeConfig())?.key !== run.bindingKey ||
        indexes.some((index) => !run.notes[index])
      )
        throw Error(t("推荐已过期，请重新翻译。"));
      const ids = await saveActionNotes(
        [...new Set(indexes)].map((index) => run.notes[index].note),
        create,
        run,
      );
      return ids;
    }
    case "disableNoteSuggestions": {
      if (win !== panel) throw Error(t("仅可从结果窗口更改此设置"));
      const cfg = store.config;
      cfg.noteSuggestion.enabled = false;
      await store.save(cfg, store.revision);
      await configChanged();
      return;
    }
    case "notesList":
    case "noteGet":
    case "noteDelete": {
      if (win !== main) throw Error(t("仅设置窗口可操作"));
      if (method === "notesList")
        return localNotes.list(
          z
            .object({
              search: z.string().max(200),
              notebook: z.string().max(80),
              notebaseId: z.string().max(640).optional(),
              offset: z.number().int().nonnegative().max(100000000),
              focusId: z
                .string()
                .regex(/^[0-9a-f]{64}$/)
                .optional(),
            })
            .parse(arg),
        );
      const id = z
        .string()
        .regex(/^[0-9a-f]{64}$/)
        .parse(arg.id);
      if (method === "noteGet") return localNotes.get(id);
      localNotes.delete(id);
      send(main, "notesChanged", undefined);
      return;
    }
    case "clearCache":
      if (win !== main) throw Error(t("仅设置窗口可操作"));
      resultCache.clear();
      return;
    case "settingsTab":
      return settingsLocation.tab;
    case "settingsLocation":
      return settingsLocation;
    case "toolbarState":
      return win === pill ? updateToolbar() : null;
    case "resumeToolbar":
      if (win !== main) throw Error(t("仅设置窗口可恢复工具栏"));
      return saveToolbarPause(0);
    case "toolbar": {
      const selection = native.current;
      if (
        win !== pill ||
        !win.isVisible() ||
        !selection ||
        arg?.token !== selection.token
      )
        return;
      const config = store.config;
      switch (arg.type) {
        case "menu":
          toolbarMenu = z.enum(["none", "more", "disable"]).parse(arg.mode);
          if (arg.focus === true && toolbarMenu !== "none") {
            win.setFocusable(true);
            win.focus();
          }
          updateToolbar();
          if (toolbarMenu === "none") win.setFocusable(false);
          return;
        case "pin":
        case "move": {
          const key = z.string().max(110).parse(arg.key);
          const command =
            arg.type === "pin"
              ? {
                  type: "pin" as const,
                  key,
                  pinned: z.boolean().parse(arg.pinned),
                }
              : {
                  type: "move" as const,
                  key,
                  over: z.string().max(110).parse(arg.over),
                };
          await store.save(
            editToolbar(config, { ...command, token: selection.token }),
            store.revision,
          );
          await configChanged();
          return;
        }
        case "disable": {
          const scope = z.enum(["hour", "app", "global"]).parse(arg.scope);
          if (scope === "hour") {
            await saveToolbarPause(Date.now() + 3600000);
            return;
          }
          if (scope === "global") config.selection.automatic = false;
          else {
            const name = selection.app.trim();
            if (!name || name.toLowerCase() === "unknown")
              throw Error(t("未能识别当前应用"));
            if (
              !config.selection.disabledToolbarApps.some(
                (a) => a.toLowerCase() === name.toLowerCase(),
              )
            )
              config.selection.disabledToolbarApps.push(name);
          }
          await store.save(config, store.revision);
          await configChanged();
          return;
        }
        case "new-action":
          return openSettings("actions", "new-action");
        case "settings":
          return openSettings("general", "toolbar-settings");
        default:
          throw Error(t("未知工具栏操作"));
      }
    }
    case "interactionGet":
      return win === panel ? interaction : null;
    case "panelOpen": {
      const source = z
        .enum(["clipboard", "empty", "action-test"])
        .parse(arg.source);
      if (source === "clipboard") return openClipboard();
      return openPanel({
        id: randomUUID(),
        source,
        text: "",
        actionId: arg.actionId ? z.string().parse(arg.actionId) : undefined,
      });
    }
    case "panelResize": {
      if (win !== panel || panelPlacedByUser || !panelPlacement) return;
      const height = z.number().min(160).max(3000).parse(arg.height);
      const bounds = panelBounds(panelPlacement, height);
      // Ignore duplicate ResizeObserver notifications and Windows DIP rounding.
      const frame = JSON.stringify(bounds);
      if (frame !== panelFrame) {
        panelFrame = frame;
        win.setBounds(bounds);
      }
      return;
    }
    case "shortcutRecording": {
      if (win !== main) throw Error(t("仅设置窗口可录制快捷键"));
      const value = z
        .object({ id: z.string().uuid(), active: z.boolean() })
        .parse(arg);
      if (value.active) {
        shortcutRecording = value.id;
        globalShortcut.setSuspended(true);
      } else if (shortcutRecording === value.id) endShortcutRecording();
      return;
    }
    case "saveConfig":
      await store.save(arg.config, z.string().parse(arg.revision));
      return configChanged();
    case "providerHeaders": {
      if (win !== main) throw Error(t("仅设置窗口可编辑请求头"));
      const p = store.config.providers.find(
        (p) => p.id === arg.id && p.endpoint === arg.endpoint,
      );
      if (!p) throw Error(t("服务地址已改变，请重新打开高级选项"));
      const scope = p.endpoint.replace(/\/+$/, "");
      if (arg.value === undefined)
        return (await secrets.get("headers:" + p.id, scope)) ?? "";
      const headers = parseHeaders(z.string().max(16000).parse(arg.value));
      await secrets.set(
        "headers:" + p.id,
        Object.keys(headers).length ? JSON.stringify(headers, null, 2) : "",
        scope,
      );
      return arg.value;
    }
    case "duplicateProvider": {
      if (win !== main) throw Error(t("仅设置窗口可复制提供商"));
      const cfg = store.config,
        p = cfg.providers.find((p) => p.id === arg.id);
      const revision = z.string().parse(arg.revision);
      if (!p || revision !== store.revision)
        throw Error(t("配置已更改，请重试"));
      const id = randomUUID(),
        scope = p.endpoint.replace(/\/+$/, "");
      const name = p.name.slice(0, 64) + " " + t("副本");
      let unique = name;
      for (let n = 2; cfg.providers.some((p) => p.name === unique); n++)
        unique = name + " " + n;
      cfg.providers.push({ ...p, id, name: unique });
      const copied: string[] = [];
      try {
        for (const kind of ["text:", "headers:"]) {
          const value = await secrets.get(kind + p.id, scope);
          if (value) {
            await secrets.set(kind + id, value, scope);
            copied.push(kind + id);
          }
        }
        await store.save(cfg, revision);
      } catch (error) {
        for (const target of copied) await secrets.set(target, "", scope);
        throw error;
      }
      return { id, snapshot: await configChanged() };
    }
    case "saveCredential":
      if (
        win !== main ||
        !/^text:[\w-]+$/.test(arg.id) ||
        credentialScope(arg.id) === "missing"
      )
        throw Error(t("凭据字段无效"));
      if (
        arg.expectedScope !== undefined &&
        arg.expectedScope !== credentialScope(arg.id)
      )
        throw Error(t("服务地址已改变，请重新输入 API Key"));
      await secrets.set(
        z.string().parse(arg.id),
        z.string().parse(arg.value),
        credentialScope(arg.id),
      );
      return snapshot();
    case "runAction": {
      const input = z
        .object({
          id: jobId,
          actionId: z.string(),
          text: safeText.min(1),
          context: safeText,
          sourceLanguage: z.string().max(80),
          targetLanguage: z.string().max(80),
          providerId: z.string().optional(),
          refresh: z.boolean().optional(),
        })
        .parse(arg);
      const cfg = runtimeConfig();
      const action = cfg.actions.find(
        (a) => a.id === input.actionId && a.enabled,
      );
      if (!action) throw Error(t("指令不存在或已停用"));
      const provider = cfg.providers.find(
        (p) =>
          p.id ===
          (input.providerId ?? action.providerId ?? cfg.defaults.textProfileId),
      );
      if (!provider) throw Error(t("文字服务不存在"));
      if (isTranslationOnly(provider) && action.id !== "translate")
        throw Error(t("纯翻译提供商只能用于翻译"));
      if (!provider.enabled)
        throw Error(t("此 API 提供商已停用，请选择其他模型"));
      return beginJob(win, input.id, "text", async (signal, emit) => {
        const targetLanguage = resolveResultLanguage(
          input.targetLanguage,
          cfg.appearance.language,
          app.getPreferredSystemLanguages(),
        );
        const explanationLanguage = resolveResultLanguage(
          cfg.defaults.explanationLanguage,
          cfg.appearance.language,
          app.getPreferredSystemLanguages(),
        );
        let sourceLanguage = input.sourceLanguage;
        if (
          sourceLanguage === "auto" &&
          /\{\{\s*sourceLanguage\s*\}\}/.test(
            [
              action.prompt,
              action.system,
              ...(action.outputSchema ?? []).map((f) => f.description),
            ].join("\n"),
          )
        ) {
          const code = await detectLanguage(
            cfg,
            input.text,
            signal,
            credentials,
            cachedComplete,
          );
          if (code !== "und") sourceLanguage = code;
        }
        signal.throwIfAborted();
        const { key, headers } = await credentials(provider);
        signal.throwIfAborted();
        if (
          win === panel &&
          action.id === "translate" &&
          (provider.model.trim() || isTranslationOnly(provider)) &&
          (!provider.requiresKey ||
            key ||
            new Headers(headers).has("Authorization"))
        )
          startSuggestions(cfg, {
            ...input,
            sourceLanguage,
            targetLanguage,
            explanationLanguage,
          });
        const variables = {
          text: input.text,
          context: input.context,
          sourceApp: win === panel ? noteSourceApp(interaction) : "",
          targetLanguage,
          sourceLanguage,
          explanationLanguage,
        };
        const outputContract = action.outputSchema
          ? jsonContract(action.outputSchema, (s) =>
              promptVariables(s, variables),
            )
          : undefined;
        const answer = await cachedComplete(
          {
            ...provider,
            headers,
            outputContract,
            ...(action.id === "translate"
              ? {
                  translation: {
                    text: input.text,
                    sourceLanguage,
                    targetLanguage,
                  },
                }
              : {}),
          },
          actionMessages(action, variables),
          key,
          signal,
          (text, thinking) => emit({ text, thinking }),
          input.refresh,
          action.outputSchema
            ? (raw) => {
                parseOutput(raw, action.outputSchema!);
              }
            : undefined,
        );
        if (
          win === panel &&
          pendingSuggestion?.id === input.id &&
          answer.trim()
        ) {
          pendingSuggestion.translated = true;
          publishSuggestions(pendingSuggestion);
        }
      });
    }
    case "speechBegin": {
      const id = z.uuid().parse(arg.id);
      if (speechOwner) {
        speechOwner.controller.abort();
        send(speechOwner.win, "speechStop", speechOwner.id);
      }
      speechOwner = { win, id, controller: new AbortController() };
      return store.config.tts;
    }
    case "speechAudio": {
      const input = z
        .strictObject({
          id: z.uuid(),
          providerId: z.string().min(1).max(100),
          voice: OnlineVoiceIdSchema,
          text: z.string().min(1).max(4096),
          speed: z.number().min(0.25).max(4),
        })
        .parse(arg);
      const owner = speechOwner,
        cfg = store.config;
      if (!owner || owner.win !== win || owner.id !== input.id)
        throw Error(t("朗读已停止"));
      const provider = cfg.providers.find(
        (p) =>
          p.enabled &&
          p.id === cfg.tts.onlineProviderId &&
          p.id === input.providerId &&
          p.model.trim(),
      );
      if (!provider) throw Error(t("请选择可用的在线朗读提供商"));
      const { key, headers } = await credentials(provider);
      owner.controller.signal.throwIfAborted();
      return synthesizeSpeech(
        { ...provider, headers },
        key,
        input.text,
        input.voice,
        input.speed,
        owner.controller.signal,
      );
    }
    case "speechEnd":
      if (speechOwner?.win === win && speechOwner.id === arg.id) {
        speechOwner.controller.abort();
        speechOwner = undefined;
      }
      return;
    case "detectLanguage": {
      const text = safeText.parse(arg.text);
      if (arg.localOnly === true) return basicLanguage(text);
      const pending = new AbortController();
      const cancel = () => pending.abort();
      win.once("hide", cancel);
      win.once("closed", cancel);
      try {
        return await detectLanguage(
          store.config,
          text,
          pending.signal,
          credentials,
          cachedComplete,
        );
      } finally {
        win.off("hide", cancel);
        win.off("closed", cancel);
      }
    }
    case "cancel": {
      const id = jobId.parse(arg.id);
      if (win === panel) cancelSuggestion(id);
      if (owners.get(id) === win.webContents.id) {
        jobs.cancel(id);
        owners.delete(id);
        send(win, "job", { id, kind: "text", status: "cancelled" });
      }
      return;
    }
    case "testText": {
      const startedAt = performance.now();
      const p = store.config.providers.find((p) => p.id === arg.profileId);
      if (!p) throw Error(t("服务不存在"));
      if (!p.enabled) throw Error(t("此 API 提供商已停用"));
      const { key, headers } = await credentials(p);
      if (
        store.config.tts.onlineProviderId === p.id ||
        /^(tts-1(?:-hd)?|gpt-4o-mini-tts)$/.test(p.model)
      ) {
        const settings = store.config.tts;
        const voice =
          [settings.defaultVoice, ...Object.values(settings.languageVoices)]
            .find((id) => id.startsWith("api:"))
            ?.slice(4) ||
          settings.customVoices[0] ||
          "alloy";
        await synthesizeSpeech(
          { ...p, headers },
          key,
          APP_NAME,
          voice,
          1,
          AbortSignal.timeout(p.timeoutMs),
        );
        return { durationMs: Math.round(performance.now() - startedAt) };
      }
      const targetLanguage = resolveResultLanguage(
        store.config.defaults.targetLanguage,
        store.config.appearance.language,
        app.getPreferredSystemLanguages(),
      );
      const result = await complete(
        {
          ...p,
          headers,
          ...(isTranslationOnly(p)
            ? {
                translation: {
                  text: "Hi",
                  sourceLanguage: "en",
                  targetLanguage,
                },
              }
            : {}),
        },
        [
          {
            role: "user",
            content: `Translate Hi into ${targetLanguage}. Return only the translation.`,
          },
        ],
        key,
        new AbortController().signal,
        () => {},
      );
      if (!result.trim())
        throw Error(t("服务未返回有效内容，请检查模型 ID 和接口兼容性"));
      return { durationMs: Math.round(performance.now() - startedAt) };
    }
    case "listModels": {
      const p = store.config.providers.find((p) => p.id === arg.profileId);
      if (!p) throw Error(t("服务商不存在"));
      if (!p.enabled) throw Error(t("此 API 提供商已停用"));
      const { key, headers } = await credentials(p);
      return listModels({ ...p, headers }, key, new AbortController().signal);
    }
    case "recognize":
      return recognize(
        win,
        jobId.parse(arg.id),
        z.string().parse(arg.profileId),
        z.string().parse(arg.dataUrl),
        z.boolean().optional().parse(arg.refresh),
      );
    case "testVision":
      return recognize(
        win,
        jobId.parse(arg.id),
        z.string().parse(arg.profileId),
        await visionTestImage(),
        true,
      );
    case "capture":
      return capture();
    case "captureData":
      return activeCapture;
    case "captureReady":
      if (win !== overlay || !activeCapture) return;
      // The renderer has decoded the frozen frame; avoid flashing an empty surface.
      overlay.show();
      overlay.focus();
      return;
    case "crop": {
      if (win !== overlay || !activeCapture || !captureDisplay)
        throw Error(t("截图会话已结束"));
      const r = z
        .object({
          x: z.number().nonnegative(),
          y: z.number().nonnegative(),
          width: z.number().positive(),
          height: z.number().positive(),
          viewportWidth: z.number().positive().max(32000),
          viewportHeight: z.number().positive().max(32000),
        })
        .parse(arg);
      if (r.x + r.width > r.viewportWidth || r.y + r.height > r.viewportHeight)
        throw Error(t("选区超出截图范围"));
      // Pointer coordinates refer to the actual renderer viewport. On Windows,
      // native window bounds can differ after DPI/frame rounding; using display
      // bounds here crops different pixels from the area the user selected.
      const scaleX = activeCapture.width / r.viewportWidth;
      const scaleY = activeCapture.height / r.viewportHeight;
      const rect = {
        x: Math.round(r.x * scaleX),
        y: Math.round(r.y * scaleY),
        width: Math.round(r.width * scaleX),
        height: Math.round(r.height * scaleY),
      };
      if (
        rect.width < 3 ||
        rect.height < 3 ||
        rect.x + rect.width > activeCapture.width ||
        rect.y + rect.height > activeCapture.height
      )
        throw Error(t("选区超出截图范围"));
      const cropped = imageCapture(
        nativeImage.createFromDataURL(activeCapture.dataUrl).crop(rect),
      );
      activeCapture = null;
      captureReturn = undefined;
      overlay.close();
      openImage(cropped, "capture");
      return;
    }
    case "imageImport": {
      panelDialog = win === panel;
      try {
        const result = await dialog.showOpenDialog(win, {
          properties: ["openFile"],
          filters: [
            { name: t("图片"), extensions: ["png", "jpg", "jpeg", "webp"] },
          ],
        });
        if (!result.canceled)
          openImage(
            imageCapture(nativeImage.createFromPath(result.filePaths[0])),
            "image",
          );
        return;
      } finally {
        panelDialog = false;
        if (win === panel) {
          win.show();
          win.focus();
        }
      }
    }
    case "clipboardRead":
      return (await clipboard.readText()).slice(0, 100000);
    case "clipboardWrite":
      await clipboard.writeText(safeText.parse(arg.text));
      return;
    case "replace":
      return native.replace(
        z.string().parse(arg.token),
        safeText.parse(arg.text),
      );
    case "selectionOpen":
      if (
        win === pill &&
        (!win.isVisible() || arg?.token !== native.current?.token)
      )
        return;
      return openSelection(
        arg?.actionId === undefined
          ? undefined
          : z.string().parse(arg.actionId),
      );
    case "selectionGet":
      return native.current ?? null;
    case "exportConfig": {
      const result = await dialog.showSaveDialog(win, {
        defaultPath: APP_NAME + "-config.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (result.canceled || !result.filePath) return null;
      await atomicWrite(
        result.filePath,
        JSON.stringify(store.config, null, 2) + "\n",
      );
      return result.filePath;
    }
    case "previewImport": {
      const file = await dialog.showOpenDialog(win, {
        properties: ["openFile"],
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (file.canceled) return null;
      const config = parseConfig(await readFile(file.filePaths[0], "utf8"));
      pendingImport = { token: randomUUID(), config };
      return {
        ...pendingImport,
        shortcuts: shortcutPreview(config, process.platform),
        missing: [
          ...config.providers
            .filter((p) => p.requiresKey)
            .map((p) => p.name + t("：需要在本机配置 API Key")),
          t("API Key 和 WebDAV 凭据不随配置迁移；离线 OCR 已内置"),
        ],
      };
    }
    case "applyImport": {
      if (!pendingImport || pendingImport.token !== arg.token)
        throw Error(t("导入预览已过期"));
      await store.backup("before-import");
      await store.save(
        arg.mode === "merge"
          ? mergeConfig(store.config, pendingImport.config)
          : pendingImport.config,
        arg.revision,
      );
      pendingImport = undefined;
      return configChanged();
    }
    case "saveSync": {
      const value = z
        .object({
          enabled: z.boolean(),
          url: z.string().max(2000),
          username: z.string().max(500),
          remotePath: z.string().max(1000),
          password: z.string().max(16000).optional(),
        })
        .parse(arg);
      const { password, ...next } = value;
      if (next.enabled) {
        const { davUrl } = await import("../core/sync");
        davUrl(next);
      }
      if (password !== undefined)
        await secrets.set("webdav", password, davScope(next));
      await atomicWrite(
        path.join(dataDir, "device-sync.json"),
        JSON.stringify(next),
      );
      settings = next;
      return snapshot();
    }
    case "testSync":
      return dav.test();
    case "sync": {
      const result = await dav.sync(arg?.resolution, arg?.token);
      await configChanged();
      return result;
    }
    case "window": {
      switch (arg.command) {
        case "minimize":
          win.minimize();
          break;
        case "pin":
          if (win === panel) panelPinned = !!arg.value;
          break;
        case "dismiss":
          if (win === overlay) {
            activeCapture = null;
            win.close();
          } else if (win === panel) dismissPanel();
          else win.hide();
          break;
        case "close":
          if (win === main) {
            win.close();
          } else if (win === panel) dismissPanel();
          else win.hide();
          break;
      }
      return;
    }
    case "openData":
      await shell.openPath(dataDir);
      return;
    default:
      throw Error(t("不支持的操作"));
  }
}
async function boot() {
  const atLogin = startsInTray(process.argv);
  const firstLaunch = !existsSync(store.file);
  await store.init();
  if (existsSync(path.join(dataDir, "local-notes.sqlite"))) {
    const cfg = store.config,
      missing = localNotes.legacyBooks(cfg);
    if (missing.length)
      await store.save({
        ...cfg,
        localNotebases: [...cfg.localNotebases, ...missing],
      });
    localNotes.indexLegacyBooks(store.config.localNotebases);
  }
  resultCache.configure(store.config.cache);
  setLocale(interfaceLocale());
  const pause = await readJson(pauseFile, { until: 0 });
  toolbarPausedUntil = Number.isFinite(pause?.until)
    ? Math.min(Date.now() + 3600000, pause.until)
    : 0;
  armToolbarResume();
  nativeTheme.themeSource = store.config.appearance.theme;
  nativeTheme.on("updated", applyTheme);
  await secrets.init();
  for (const move of store.credentialMoves) {
    if (move.from === move.to) continue;
    const scope = move.endpoint.replace(/\/+$/, "");
    const key = await secrets.get(move.from, scope);
    if (key && !(await secrets.get(move.to, scope)))
      await secrets.set(move.to, key, scope);
  }
  settings = await readJson(path.join(dataDir, "device-sync.json"), settings);
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler(
    (_wc, _permission, callback) => callback(false),
  );
  ipcMain.handle("readfinch:call", async (event, method, arg) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (
        !win ||
        !windows.has(win) ||
        event.senderFrame !== event.sender.mainFrame
      )
        throw Error(t("无效窗口"));
      if (
        win === pill &&
        ![
          "snapshot",
          "toolbar",
          "toolbarState",
          "detectLanguage",
          "speechBegin",
          "speechAudio",
          "speechEnd",
          "selectionOpen",
          "selectionGet",
          "window",
        ].includes(method)
      )
        throw Error(t("划词工具栏无此权限"));
      if (
        win === overlay &&
        !["snapshot", "captureData", "captureReady", "crop", "window"].includes(
          method,
        )
      )
        throw Error(t("截图窗口无此权限"));
      return { ok: true, value: await handle(win, method, arg) };
    } catch (e) {
      return { ok: false, error: t((e as Error).message) };
    }
  });
  main = createWindow("main");
  main.once("ready-to-show", () => {
    if (
      !atLogin &&
      (firstLaunch || process.argv.includes("--settings") || !tray)
    )
      main.show();
  });
  main.on("close", (event) => {
    if (tray && !quitting) {
      event.preventDefault();
      main.hide();
    }
  });
  main.on("blur", endShortcutRecording);
  main.on("hide", endShortcutRecording);
  main.webContents.on("render-process-gone", endShortcutRecording);
  native.on("selection", showPill);
  native.on("status", (state) => {
    if (quitting) return;
    broadcast("nativeStatus", state);
    updateTray();
  });
  native.on("invalid", () => {
    if (quitting) return;
    pill?.hide();
    broadcast("selectionInvalid", undefined);
  });
  native.start();
  // Integration fixtures drive this coordinator only in development; never
  // expose synthetic selections or test IPC in a packaged application.
  if (!app.isPackaged && process.env.READFINCH_TEST_HOOKS === "1") {
    Object.assign(globalThis, {
      __readfinchTest: {
        shortcut(
          id: string,
          target: "external" | "panel" | "settings" = "external",
        ) {
          shortcutTestTarget = target;
          shortcutRegistry.triggerForTest(id);
        },
        nextSelection(value: Selection | undefined, delay = 0) {
          nextSelectionForTest = { value, delay };
        },
        readNativeSelection() {
          return native.readCurrent();
        },
        clearSelection() {
          native.invalidate();
        },
        image(dataUrl: string, source: "capture" | "image" = "capture") {
          openImage(
            imageCapture(nativeImage.createFromDataURL(dataUrl)),
            source,
          );
        },
        select(value: unknown, anchor?: Point) {
          const selection = z
            .object({
              token: z.string(),
              text: safeText.min(1),
              app: z.string(),
              x: z.number(),
              y: z.number(),
              canReplace: z.boolean(),
            })
            .parse(value);
          native.current = selection;
          showPill(selection, anchor);
        },
      },
    });
  }
  await configChanged();
  const iconPath = path.join(root, "dist/renderer/icon.png");
  if (existsSync(iconPath)) {
    tray = new Tray(trayIcon());
    updateTray();
    tray.on("double-click", openMain);
    if (process.platform !== "darwin") tray.on("click", openMain);
  }
}
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app
    .whenReady()
    .then(boot)
    .catch((error) => {
      dialog.showErrorBox(t("伴读雀启动失败"), (error as Error).message);
      app.quit();
    });
  app.on("second-instance", (_event, argv) => {
    if (main && !argv.includes(LOGIN_ARG)) openMain();
  });
}
app.on("activate", () => main && openMain());
app.on("before-quit", () => {
  quitting = true;
  // Non-activating Windows toolbar windows must be destroyed explicitly;
  // waiting for their native close sequence can keep the process alive.
  if (pill && !pill.isDestroyed()) pill.destroy();
  cancelSuggestion();
  jobs.cancelAll();
  native.stop();
  globalShortcut.unregisterAll();
});
app.on("window-all-closed", () => {
  if (!tray) app.quit();
});
