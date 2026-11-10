import { _electron as electron } from "playwright";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";
import assert from "node:assert/strict";

if (process.platform !== "win32")
  throw Error("An unlocked Windows desktop is required");
const dir = path.resolve(".local/windows-selection-" + Date.now());
await mkdir(dir, { recursive: true });
for (const name of ["NativeTarget", "NativePointer"]) {
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
      "/out:" + path.join(dir, name + ".exe"),
      path.resolve("tests/fixtures/" + name + ".cs"),
    ],
  );
}
execFileSync(path.join(dir, "NativePointer.exe"), ["desktop"], {
  windowsHide: true,
});
const env = { ...process.env, READFINCH_TEST_HOOKS: "1" };
delete env.ELECTRON_RUN_AS_NODE;
let app, target;
const events = [],
  cases = [];
let coexistingToolbarOverlaps = 0;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name) => {
  cases.push(name);
  console.log("Passed: " + name);
};
async function until(predicate, label, timeout = 7000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await predicate();
    if (value) return value;
    await pause(70);
  }
  throw Error("Timed out: " + label);
}
function input(operation, window, ...coordinates) {
  execFileSync(
    path.join(dir, "NativePointer.exe"),
    [operation, String(window), ...coordinates.map(String)],
    { windowsHide: true },
  );
}
async function command(value) {
  const before = events.length;
  target.stdin.write(value + "\n");
  return until(() => events.slice(before).find((e) => e.id === value), value);
}
try {
  app = await electron.launch({
    args: [".", "--settings", "--data-dir=" + dir],
    env,
  });
  const main = await app.firstWindow();
  await main.locator("main h1").waitFor();
  const call = (method, arg) =>
    main.evaluate(([m, a]) => window.readfinch.call(m, a), [method, arg]);
  const state = await call("snapshot");
  state.config.selection.automatic = true;
  state.config.appearance.language = "zh-CN";
  state.config.shortcuts = {
    input: "",
    selection: "",
    clipboard: "",
    capture: "",
  };
  state.config.actions.forEach((a) => {
    a.shortcut = "";
  });
  await call("saveConfig", { config: state.config, revision: state.revision });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.hide()),
  );
  target = spawn(path.join(dir, "NativeTarget.exe"), ["--topmost"], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: false,
  });
  target.stderr.resume();
  createInterface({ input: target.stdout }).on("line", (line) =>
    events.push(JSON.parse(line.replace(/^\uFEFF/, ""))),
  );
  const ready = await until(
    () => events.find((e) => e.id === "ready"),
    "fixture ready",
  );
  await app.evaluate(({ app, BrowserWindow }) => {
    globalThis.__readfinchToolbarShows = 0;
    const observe = (window) =>
      window.on("show", () => {
        if (window.webContents.getURL().includes("mode=pill"))
          globalThis.__readfinchToolbarShows++;
      });
    BrowserWindow.getAllWindows().forEach(observe);
    app.on("browser-window-created", (_event, window) => observe(window));
  });
  const visible = () =>
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some(
        (w) => w.webContents.getURL().includes("mode=pill") && w.isVisible(),
      ),
    );
  const selection = () => call("selectionGet");
  const showCount = () =>
    app.evaluate(() => globalThis.__readfinchToolbarShows);
  async function quietMoves(label) {
    const before = await showCount();
    const snapshot = await selection();
    for (const x of [60, 260, 600, 100]) {
      input("move", ready.hwnd, ready.x + x, ready.y + 12);
      await pause(160);
      assert.equal(await visible(), false, label);
      assert.equal(await showCount(), before, label + " must not flash");
      assert.deepEqual(await selection(), snapshot, label);
    }
    await pause(300);
    assert.equal(await showCount(), before, label + " must stay quiet");
    check(label);
  }
  await pause(700);
  assert.equal(await visible(), false);
  assert.equal(await selection(), null);
  check(
    "Programmatic selection on application focus does not show the toolbar",
  );
  await quietMoves(
    "Programmatic selection followed by pointer travel stays quiet",
  );

  await command("clear");
  input("click", ready.hwnd, ready.x + 10, ready.y + 12);
  const active = await command("status");
  assert.equal(
    active.foreground,
    active.hwnd,
    "The fixture must own keyboard focus before injecting input",
  );
  input("select-all", ready.hwnd);
  await pause(450);
  assert.equal(await visible(), false);
  assert.equal(await selection(), null);
  assert.equal((await command("status")).length, ready.text.length);
  await quietMoves(
    "Ctrl+A followed by pointer travel does not show or flash a toolbar",
  );
  const selectedByShortcut = await app.evaluate(() =>
    globalThis.__readfinchTest.readNativeSelection(),
  );
  assert(selectedByShortcut.text.startsWith("Small steps"));
  assert(selectedByShortcut.text.includes("const total = 42"));
  assert.equal(await visible(), false);
  check(
    "Ctrl+A stays quiet; explicit shortcut reads the complete current selection without showing a toolbar",
  );
  await quietMoves(
    "An explicit shortcut snapshot cannot be reopened by pointer travel",
  );

  for (const operation of ["key-interrupted-drag", "key-between-clicks"]) {
    const fixture = await command("clear");
    await pause(600);
    const before = await showCount();
    input(
      operation,
      fixture.hwnd,
      fixture.x + 5,
      fixture.y + 12,
      fixture.x + 175,
      fixture.y + 12,
    );
    await pause(350);
    assert.equal(await visible(), false, operation);
    assert.equal(await showCount(), before, operation + " must not flash");
    await quietMoves(operation + " cannot reuse the cancelled mouse gesture");
  }

  async function dragSelection() {
    const fixture = await command("clear");
    input(
      "drag",
      fixture.hwnd,
      fixture.x + 5,
      fixture.y + 12,
      fixture.x + 175,
      fixture.y + 12,
    );
    await until(visible, "mouse selection toolbar");
    const value = await until(selection, "native snapshot");
    assert.equal(value.app, "NativeTarget");
    return value;
  }
  async function nativeClick(page, locator, operation = "click") {
    await until(
      () =>
        app.evaluate(
          ({ BrowserWindow }, url) =>
            BrowserWindow.getAllWindows()
              .find((w) => w.webContents.getURL() === url)
              ?.isVisible(),
          page.url(),
        ),
      "visible native surface",
    );
    const box = await locator.boundingBox();
    assert(box);
    const point = await app.evaluate(
      ({ BrowserWindow, screen }, { url, x, y }) => {
        const window = BrowserWindow.getAllWindows().find(
          (w) => w.webContents.getURL() === url,
        );
        const bounds = window.getBounds();
        return {
          hwnd: window.getNativeWindowHandle().readBigUInt64LE().toString(),
          ...screen.dipToScreenPoint({
            x: Math.round(bounds.x + x),
            y: Math.round(bounds.y + y),
          }),
        };
      },
      { url: page.url(), x: box.x + box.width / 2, y: box.y + box.height / 2 },
    );
    try {
      input(operation, point.hwnd, point.x, point.y);
    } catch (error) {
      // The installed app can independently select the same fixture text and
      // cover the development toolbar. Raise only our test surface, without
      // activation; never click through or close the user's installed app.
      if (!String(error.stderr).includes("process ReadFinch, expected"))
        throw error;
      coexistingToolbarOverlaps++;
      await app.evaluate(({ BrowserWindow }, url) => {
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL() === url)
          .moveTop();
      }, page.url());
      input(operation, point.hwnd, point.x, point.y);
    }
  }
  async function panelFor(actionId, text) {
    const page = await until(
      () => app.windows().find((w) => w.url().includes("mode=panel")),
      "result window",
    );
    const interaction = await until(
      () => page.evaluate(() => window.readfinch.call("interactionGet")),
      "result interaction",
    );
    assert.equal(interaction.actionId, actionId);
    assert.equal(interaction.text, text);
    await page.evaluate(() =>
      window.readfinch.call("window", { command: "close" }),
    );
    return page;
  }

  await dragSelection();
  let pill = app.windows().find((w) => w.url().includes("mode=pill"));
  await pill.getByRole("button", { name: "翻译", exact: true }).waitFor();
  const properties = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("mode=pill"),
    );
    return { focused: w.isFocused(), focusable: w.isFocusable() };
  });
  assert.deepEqual(properties, { focused: false, focusable: true });
  check("The toolbar appears without taking source keyboard focus");
  input("select-all", ready.hwnd);
  await until(async () => !(await visible()), "keyboard dismissal");
  assert.equal((await command("status")).length, ready.text.length);
  await quietMoves(
    "Ctrl+A dismisses an existing toolbar and pointer travel cannot revive it",
  );
  const freshSelection = await dragSelection();
  await nativeClick(
    pill,
    pill.getByRole("button", { name: "翻译", exact: true }),
    "move",
  );
  await command("change");
  await pause(500);
  assert.deepEqual(await selection(), freshSelection);
  await nativeClick(
    pill,
    pill.getByRole("button", { name: "翻译", exact: true }),
  );
  await panelFor("translate", freshSelection.text);
  check(
    "A real first click on the inactive toolbar opens translation; provider selection changes while hovering cannot change its snapshot",
  );

  const moreSelection = await dragSelection();
  await nativeClick(
    pill,
    pill.getByRole("button", { name: "更多指令", exact: true }),
    "move",
  );
  const popup = await until(
    () => app.windows().find((w) => w.url().includes("mode=toolbar-menu")),
    "more window",
  );
  await popup.locator(".toolbar-menu").waitFor();
  await nativeClick(
    popup,
    popup.getByRole("button", { name: "词典", exact: true }),
  );
  await panelFor("dictionary", moreSelection.text);
  check(
    "Native clicking a command in the hover-expanded menu opens the matching result",
  );

  for (let i = 0; i < 3; i++) {
    const selected = await dragSelection();
    await nativeClick(
      pill,
      pill.getByRole("button", { name: "翻译", exact: true }),
    );
    await panelFor("translate", selected.text);
  }
  check("Repeated select → first-click → close cycles keep working");
  await command("clear");
  await pause(250);
  assert.equal(await visible(), false);
  const report = {
    date: new Date().toISOString(),
    cases,
    coexistingToolbarOverlaps,
  };
  await writeFile(
    path.join(dir, "verification.json"),
    JSON.stringify(report, null, 2),
  );
  console.log("Verification: " + dir);
} finally {
  if (target?.stdin.writable) target.stdin.write("quit\n");
  await app?.close();
  if (target && target.exitCode === null) {
    await pause(200);
    if (target.exitCode === null) target.kill();
  }
}
