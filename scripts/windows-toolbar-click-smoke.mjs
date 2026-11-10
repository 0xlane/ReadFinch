import { _electron as electron } from "playwright";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";
import { prepareOriginalToolbar } from "./toolbar-trace.mjs";

const directory = await prepareOriginalToolbar();
const writing = process.argv.includes("--writing");
for (const name of ["NativeTarget", "NativePointer"])
  execFileSync(
    path.join(
      process.env.WINDIR,
      "Microsoft.NET/Framework64/v4.0.30319/csc.exe",
    ),
    [
      "/nologo",
      "/r:System.Drawing.dll",
      "/r:System.Windows.Forms.dll",
      "/r:System.Web.Extensions.dll",
      ...(name === "NativePointer" ? ["/target:winexe"] : []),
      "/out:" + path.join(directory, name + ".exe"),
      path.resolve("tests/fixtures/" + name + ".cs"),
    ],
  );
const pointer = (...args) =>
  execFileSync(path.join(directory, "NativePointer.exe"), args.map(String), {
    windowsHide: true,
  });
pointer("desktop");
const env = { ...process.env, READFINCH_TEST_HOOKS: "1" };
delete env.ELECTRON_RUN_AS_NODE;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let app, target, pill, main;
const events = [],
  results = [];
async function until(read, label, timeout = 7000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await read();
    if (value) return value;
    await pause(70);
  }
  throw Error("Timed out: " + label);
}
async function command(value) {
  const start = events.length;
  target.stdin.write(value + "\n");
  return until(() => events.slice(start).find((e) => e.id === value), value);
}
async function dump() {
  if (!app) return;
  const host = await app.evaluate(() => globalThis.__toolbarTrace);
  const renderers = [];
  for (const page of app.windows())
    if (/mode=(pill|toolbar-menu)/.test(page.url())) {
      try {
        renderers.push({
          mode: new URL(page.url()).searchParams.get("mode"),
          events: await page.evaluate(() => window.__toolbarDOMTrace ?? []),
        });
      } catch {}
    }
  await writeFile(
    path.join(directory, "native-click-trace.json"),
    JSON.stringify(
      { version: "1.2.6", candidateFixes: false, results, host, renderers },
      null,
      2,
    ),
  );
}
async function clickTranslate(label, focusable) {
  const start = await app.evaluate(() => globalThis.__toolbarTrace.length);
  if (focusable !== undefined)
    await app.evaluate(
      ({ BrowserWindow }, value) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().includes("mode=pill"))
          .setFocusable(value),
      focusable,
    );
  async function pointFor(page, name) {
    const box = await page
      .getByRole("button", { name, exact: true })
      .boundingBox();
    return app.evaluate(
      ({ BrowserWindow, screen }, { box, url }) => {
        const w = BrowserWindow.getAllWindows().find(
          (w) => w.webContents.getURL() === url,
        );
        const b = w.getBounds();
        return {
          window: w.getNativeWindowHandle().readBigUInt64LE().toString(),
          focusable: w.isFocusable(),
          focused: w.isFocused(),
          ...screen.dipToScreenPoint({
            x: Math.round(b.x + box.x + box.width / 2),
            y: Math.round(b.y + box.y + box.height / 2),
          }),
        };
      },
      { box, url: page.url() },
    );
  }
  let surface = pill;
  if (writing) {
    const more = await pointFor(pill, "更多指令");
    pointer("move", more.window, more.x, more.y);
    surface = await until(
      () => app.windows().find((w) => w.url().includes("mode=toolbar-menu")),
      "more surface",
    );
    await surface.locator(".toolbar-menu").waitFor();
    await until(
      () =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().some(
            (w) =>
              w.webContents.getURL().includes("mode=toolbar-menu") &&
              w.isVisible(),
          ),
        ),
      "visible more menu",
    );
  }
  const point = await pointFor(surface, writing ? "写作改进" : "翻译");
  pointer("click", point.window, point.x, point.y);
  await pause(700);
  const trace = await app.evaluate(
    (_, start) => globalThis.__toolbarTrace.slice(start),
    start,
  );
  const panel = app.windows().find((w) => w.url().includes("mode=panel"));
  const interaction = panel
    ? await panel.evaluate(() => window.readfinch.call("interactionGet"))
    : null;
  const result = {
    label,
    focusable: point.focusable,
    focusedBeforeClick: point.focused,
    nativeMouseDown: trace.some((e) => e.kind === "mouseDown"),
    nativeMouseUp: trace.some((e) => e.kind === "mouseUp"),
    command: trace.find((e) => e.kind === "selectionOpen") ?? null,
    opened:
      interaction?.source === "selection" &&
      interaction?.actionId === (writing ? "polish" : "translate"),
  };
  results.push(result);
  console.log(JSON.stringify(result));
  if (panel)
    await panel.evaluate(() =>
      window.readfinch.call("window", { command: "close" }),
    );
  await dump();
}
try {
  app = await electron.launch({
    args: [
      directory,
      "--settings",
      "--data-dir=" + path.join(directory, "profile"),
    ],
    env,
  });
  main = await app.firstWindow();
  await main.locator("main h1").waitFor();
  await main.evaluate(async () => {
    const s = await window.readfinch.call("snapshot");
    s.config.appearance.language = "zh-CN";
    s.config.selection.automatic = true;
    s.config.actions.find((a) => a.id === "polish").pinned = false;
    s.config.shortcuts = {
      input: "",
      selection: "",
      clipboard: "",
      capture: "",
    };
    s.config.actions.forEach((a) => {
      a.shortcut = "";
    });
    await window.readfinch.call("saveConfig", {
      config: s.config,
      revision: s.revision,
    });
  });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.hide()),
  );
  target = spawn(path.join(directory, "NativeTarget.exe"), ["--topmost"], {
    windowsHide: false,
    stdio: ["pipe", "pipe", "pipe"],
  });
  target.stderr.resume();
  createInterface({ input: target.stdout }).on("line", (line) =>
    events.push(JSON.parse(line.replace(/^\uFEFF/, ""))),
  );
  await until(() => events.find((e) => e.id === "ready"), "target ready");
  if (writing) await command("writing");
  const visible = () =>
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some(
        (w) => w.webContents.getURL().includes("mode=pill") && w.isVisible(),
      ),
    );
  await until(visible, "original toolbar");
  pill = app.windows().find((w) => w.url().includes("mode=pill"));
  await pill.getByRole("button", { name: "翻译", exact: true }).waitFor();
  await clickTranslate("original");
  if (!results[0].opened) {
    await command("select");
    await until(visible, "toolbar before A/B activation");
    await clickTranslate("same original with focus enabled", true);
  }
  console.log("Trace: " + path.join(directory, "native-click-trace.json"));
} finally {
  await dump().catch(() => {});
  if (target?.stdin.writable) target.stdin.write("quit\n");
  await app?.close();
  if (target && target.exitCode === null) {
    await pause(150);
    if (target.exitCode === null) target.kill();
  }
}
