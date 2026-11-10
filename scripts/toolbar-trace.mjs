import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractFile, listPackage, statFile } from "@electron/asar";

// Diagnose the released coordinator without including the candidate fixes.
// Traces contain event types, local token ordinals and window state only.
export function instrumentToolbar(source) {
  const replace = (before, after) => {
    if (!source.includes(before))
      throw Error("Trace insertion point is missing: " + before);
    source = source.replace(before, after);
  };
  replace(
    "function trayIcon() {",
    `
const traceStart = performance.now();
const traceTokens = new Map();
globalThis.__toolbarTrace = [];
function traceToken(value) {
  if (!value) return null;
  if (!traceTokens.has(value)) traceTokens.set(value, traceTokens.size + 1);
  return traceTokens.get(value);
}
function traceToolbar(kind, details = {}) {
  if (globalThis.__toolbarTrace.length >= 1000) return;
  globalThis.__toolbarTrace.push({ms: Math.round(performance.now() - traceStart), kind,
    nativeToken: traceToken(native.current?.token), ...details});
}
function traceToolbarWindow(win, mode) {
  if (mode !== "pill" && mode !== "toolbar-menu") return;
  for (const type of ["show", "hide", "focus", "blur"])
    win.on(type, () => traceToolbar(type, {surface: mode, visible: win.isVisible(), focusable: win.isFocusable()}));
  win.hookWindowMessage(0x21, () => traceToolbar("WM_MOUSEACTIVATE", {surface: mode}));
  win.webContents.on("before-mouse-event", (_event, input) => {
    if (input.type === "mouseDown" || input.type === "mouseUp")
      traceToolbar(input.type, {surface: mode, focused: win.isFocused(), focusable: win.isFocusable()});
  });
  win.webContents.on("did-finish-load", () => {
    void win.webContents.executeJavaScript(\`(() => {
      const events = window.__toolbarDOMTrace = [];
      let present = false, current, ordinal = 0;
      const push = (value) => { if (events.length < 500) events.push({ms: Date.now(), ...value}); };
      window.readfinch.on("toolbarState", (state) => {
        present = !!state;
        if (state?.token && state.token !== current) { current = state.token; ordinal++; }
        push({type: "view", present, ordinal});
      });
      for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click", "pointercancel"])
        document.addEventListener(type, (event) => {
          const button = event.target.closest?.("button");
          const control = !button ? "background" : button.matches(".toolbar-more") ? "more" :
            button.matches(".toolbar-close") ? "close" : button.matches(".toolbar-command") ? "menu-command" : "command";
          push({type, control, present, ordinal, trusted: event.isTrusted});
        }, true);
    })()\`).catch(() => {});
  });
}
function trayIcon() {`,
  );
  replace(
    "const ownerId = win.webContents.id;",
    "traceToolbarWindow(win, mode);\n  const ownerId = win.webContents.id;",
  );
  replace(
    'native.on("selection", showPill);',
    'native.on("selection", (value) => { traceToolbar("native-selection"); showPill(value); });',
  );
  replace(
    'native.on("invalid", () => {',
    'native.on("invalid", () => { traceToolbar("native-invalid");',
  );
  replace(
    'send(pill, "toolbarState", state);',
    'traceToolbar("send-bar", {viewToken: traceToken(state.token), mode: state.mode});\n  send(pill, "toolbarState", state);',
  );
  replace(
    'case "selectionOpen":',
    `case "selectionOpen":
      traceToolbar("selectionOpen", {argumentToken: traceToken(arg?.token), matched: arg?.token === native.current?.token,
        visible: win.isVisible(), focused: win.isFocused(), focusable: win.isFocusable()});`,
  );
  replace(
    'case "toolbar": {',
    `case "toolbar": {
      traceToolbar("toolbar-command", {command: arg?.type, argumentToken: traceToken(arg?.token),
        matched: arg?.token === native.current?.token, visible: win.isVisible()});`,
  );
  return source;
}

export async function prepareOriginalToolbar() {
  const revision = execFileSync("git", ["rev-parse", "v1.2.6^{commit}"], {
    encoding: "utf8",
  }).trim();
  const original = (file) =>
    execFileSync("git", ["show", revision + ":" + file], { encoding: "utf8" });
  const directory = path.resolve(".local/toolbar-original-" + Date.now());
  const mainDir = path.join(directory, "dist/main");
  await mkdir(mainDir, { recursive: true });
  const metadata = JSON.parse(await readFile("package.json", "utf8"));
  metadata.main = "dist/main/main.cjs";
  await writeFile(
    path.join(directory, "package.json"),
    JSON.stringify(metadata),
  );
  const installedArchive = path.join(
    process.env.LOCALAPPDATA,
    "Programs/ReadFinch/resources/app.asar",
  );
  const rendererPrefix = path.sep + path.join("dist", "renderer") + path.sep;
  for (const file of listPackage(installedArchive)) {
    if (!file.startsWith(rendererPrefix)) continue;
    const relative = file.slice(1);
    if (typeof statFile(installedArchive, relative).size !== "number") continue;
    const target = path.join(directory, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, extractFile(installedArchive, relative));
  }
  await cp("dist/main/preload.cjs", path.join(mainDir, "preload.cjs"));
  await cp(
    path.join(process.env.LOCALAPPDATA, "Programs/ReadFinch/resources/native"),
    path.join(directory, "native"),
    { recursive: true },
  );
  await build({
    entryPoints: [path.resolve("src/main/main.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: path.join(mainDir, "main.cjs"),
    external: [
      "electron",
      "tesseract.js",
      "electron-updater",
      "electron-updater/*",
      "builder-util-runtime",
    ],
    plugins: [
      {
        name: "released-toolbar",
        setup(build) {
          build.onLoad(
            { filter: /src[\\/]main[\\/](main|native)\.ts$/ },
            ({ path: file }) => ({
              contents:
                path.basename(file) === "main.ts"
                  ? instrumentToolbar(original("src/main/main.ts"))
                  : original("src/main/native.ts"),
              loader: "ts",
              resolveDir: path.resolve("src/main"),
            }),
          );
        },
      },
    ],
  });
  await writeFile(
    path.join(directory, "trace-source.json"),
    JSON.stringify(
      { revision, version: "1.2.6", candidateFixes: false },
      null,
      2,
    ),
  );
  return directory;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(await prepareOriginalToolbar());
