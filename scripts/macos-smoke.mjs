import { _electron as electron } from "playwright";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { createInterface } from "node:readline";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

if (process.platform !== "darwin") throw Error("Requires a macOS desktop");
const dir = path.resolve(".local/macos-" + Date.now());
await mkdir(dir, { recursive: true });
const binary = path.join(dir, "selection-target");
execFileSync(
  "swiftc",
  [
    "tests/fixtures/MacSelectionTarget.swift",
    "-module-cache-path",
    process.env.CLANG_MODULE_CACHE_PATH || path.join(dir, "swift-cache"),
    "-o",
    binary,
  ],
  { timeout: 120000 },
);
const checks = [],
  limitations = [],
  requests = [],
  errors = [];
const server = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const input = JSON.parse(body);
  requests.push(input);
  const answer = input.response_format?.json_schema?.schema?.required?.includes(
    "释义",
  )
    ? JSON.stringify({
        词条: "steps",
        句中词形: null,
        难度: null,
        记忆技巧: null,
        释义: "步伐。",
        音标: null,
        词性: "noun",
        句子: "Small steps make a big difference.",
        句子翻译: null,
      })
    : "Mac fixture translation";
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  res.end(
    `data: ${JSON.stringify({ choices: [{ delta: { content: answer } }] })}\n\ndata: [DONE]\n\n`,
  );
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.READFINCH_TEST_HOOKS;
let app, target;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(predicate, label) {
  for (let n = 0; n < 150; n++) {
    if (await predicate()) return;
    await pause(100);
  }
  throw Error("Timed out: " + label);
}
const check = (text) => {
  checks.push(text);
  console.log(text);
};
try {
  app = await electron.launch({
    args: [".", "--settings", "--data-dir=" + dir],
    env,
  });
  app.on("window", (p) => p.on("pageerror", (e) => errors.push(e.message)));
  const main = await app.firstWindow();
  await main.locator("main h1").waitFor();
  const call = (method, arg) =>
    main.evaluate(({ method, arg }) => window.readfinch.call(method, arg), {
      method,
      arg,
    });
  const state = await call("snapshot");
  state.config.appearance.language = "zh-CN";
  state.config.selection.automatic = true;
  state.config.noteSuggestion.enabled = false;
  for (const key of Object.keys(state.config.shortcuts))
    state.config.shortcuts[key] = "";
  state.config.actions.forEach((a) => (a.shortcut = ""));
  state.config.actions.find((a) => a.id === "translate").shortcut = "Alt+T";
  Object.assign(state.config.providers[0], {
    endpoint: `http://127.0.0.1:${server.address().port}/v1`,
    requiresKey: false,
    model: "fixture",
  });
  await call("saveConfig", { config: state.config, revision: state.revision });
  await until(
    async () => (await call("snapshot")).nativeState !== "starting",
    "native helper ready",
  );
  assert.equal((await call("snapshot")).nativeState, "ready");
  assert.deepEqual((await call("snapshot")).shortcutErrors, []);
  await app.evaluate(({ app, BrowserWindow }) => {
    globalThis.__focusEvents = [];
    for (const event of ["did-become-active", "did-resign-active"])
      app.on(event, () => globalThis.__focusEvents.push([event]));
    app.on("activate", (_, visible) =>
      globalThis.__focusEvents.push(["activate", visible]),
    );
    for (const win of BrowserWindow.getAllWindows())
      win.on("focus", () =>
        globalThis.__focusEvents.push([
          "focus",
          win.webContents.getURL().includes("mode=main") ? "main" : "other",
        ]),
      );
    const main = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("mode=main"),
    );
    main.show();
  });
  target = spawn(binary, [], { stdio: ["pipe", "pipe", "pipe"] });
  const replies = new Map();
  const lines = createInterface({ input: target.stdout });
  lines.on("line", (line) => {
    const event = JSON.parse(line);
    replies.set(event.id, event);
  });
  target.stderr.on("data", (data) => process.stderr.write(data));
  const command = async (op) => {
    replies.delete(op);
    target.stdin.write(op + "\n");
    await until(() => replies.has(op), "fixture " + op);
    return replies.get(op);
  };
  await until(() => replies.has("ready"), "fixture launch");
  const hostPID = app.process().pid;
  const mainNumber = await app.evaluate(({ BrowserWindow }) =>
    Number(
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes("mode=main"))
        .getMediaSourceId()
        .split(":")[1],
    ),
  );
  async function assertSourceStaysInFront() {
    const state = await command(`order ${hostPID}`);
    assert.equal(
      state.foreground,
      state.pid,
      "floating UI must not activate the whole application",
    );
    const sourceIndex = state.order.findIndex(
      (w) => w.id === state.sourceWindow,
    );
    const mainIndex = state.order.findIndex((w) => w.id === mainNumber);
    assert.ok(
      sourceIndex >= 0 && mainIndex >= 0 && sourceIndex < mainIndex,
      JSON.stringify(state),
    );
  }
  await command("select");
  await pause(600);
  assert.equal(
    await call("selectionGet"),
    null,
    "programmatic/keyboard selection must not create an automatic toolbar",
  );
  check("非鼠标选区不创建自动工具栏");
  await command("mouse-select");
  await until(
    async () =>
      (await call("selectionGet"))?.text ===
      "Small steps make a big difference.",
    "AXSelectedText",
  );
  const selection = await call("selectionGet");
  assert.equal(selection.canReplace, false);
  await until(
    () => app.windows().some((p) => p.url().includes("mode=pill")),
    "native toolbar",
  );
  const pill = app.windows().find((p) => p.url().includes("mode=pill"));
  await pill.getByRole("button", { name: "翻译", exact: true }).waitFor();
  const focus = await command("status");
  assert.equal(focus.foreground, focus.pid, "toolbar must not steal focus");
  assert.equal(requests.length, 0);
  check(
    "原生 NSTextView 选区经 Swift/AX 自动读取；浮标显示且不抢焦点、不自动请求模型",
  );
  // Reproduce a transient AX disappearance without a user dismissal event.
  await command("ax-empty");
  const toolbarBounds = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes("mode=pill"))
      .getBounds(),
  );
  const button = await pill
    .getByRole("button", { name: "翻译", exact: true })
    .boundingBox();
  const destination = {
    x: toolbarBounds.x + button.x + button.width / 2,
    y: toolbarBounds.y + button.y + button.height / 2,
  };
  for (let step = 1; step <= 8; step++) {
    const p = {
      x: selection.x + ((destination.x - selection.x) * step) / 8,
      y: selection.y + ((destination.y - selection.y) * step) / 8,
    };
    await command(`move ${p.x} ${p.y}`);
    await pause(80);
  }
  await pause(600);
  assert.equal((await call("selectionGet"))?.token, selection.token);
  assert.equal(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes("mode=pill"))
        .isVisible(),
    ),
    true,
  );
  check("AX 选区暂时消失后，鼠标移向并进入工具栏仍保留原文本与可见工具栏");
  await command(`click ${destination.x} ${destination.y}`);
  await until(
    () => app.windows().some((p) => p.url().includes("mode=panel")),
    "translation panel",
  );
  const panel = app.windows().find((p) => p.url().includes("mode=panel"));
  await until(
    () =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getFocusedWindow()
          ?.webContents.getURL()
          .includes("mode=panel"),
      ),
    "action panel keeps focus while main window stays open",
  );
  await panel.getByRole("button", { name: "复制结果", exact: true }).waitFor();
  assert.equal(
    await panel.locator(".rf-source-text").innerText(),
    selection.text,
  );
  assert.match(
    JSON.stringify(requests[0]),
    /Small steps make a big difference/,
  );
  assert.equal(
    await panel.getByRole("button", { name: "替换原文", exact: true }).count(),
    0,
  );
  await panel.screenshot({ path: path.join(dir, "native-translation.png") });
  check(
    "点击原生浮标后翻译浮窗使用真实选区、完成本机流式请求；Mac 提供复制结果",
  );
  await panel.evaluate(() =>
    window.readfinch.call("window", { command: "dismiss" }),
  );
  await command("clear");
  await until(async () => !(await call("selectionGet")), "selection cleared");
  await command("mouse-select");
  await until(
    async () => !!(await call("selectionGet")),
    "second mouse selection",
  );
  await pill.getByRole("button", { name: "词典", exact: true }).waitFor();
  const dictionary = await pill
    .getByRole("button", { name: "词典", exact: true })
    .boundingBox();
  const dictionaryBar = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes("mode=pill"))
      .getBounds(),
  );
  await command(
    `click ${dictionaryBar.x + dictionary.x + dictionary.width / 2} ${dictionaryBar.y + dictionary.y + dictionary.height / 2}`,
  );
  await panel.getByText("步伐。", { exact: true }).waitFor();
  await pause(300);
  const focusState = await app.evaluate(({ BrowserWindow }) => ({
    focused: BrowserWindow.getFocusedWindow()
      ?.webContents.getURL()
      .includes("mode=panel"),
    mainVisible: BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes("mode=main"))
      .isVisible(),
  }));
  assert.equal(focusState.focused, true);
  assert.equal(focusState.mainVisible, true);
  await assertSourceStaysInFront();
  check("主界面保持打开时，词典浮窗可用，原应用保持前台，主界面仍在原应用后面");
  await panel.evaluate(() =>
    window.readfinch.call("window", { command: "dismiss" }),
  );
  await command("clear");
  await until(
    async () => !(await call("selectionGet")),
    "dictionary selection cleared",
  );
  await command("select");
  await call("panelOpen", { source: "empty" });
  await panel.getByLabel("原文", { exact: true }).waitFor();
  await panel.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "原文",
  );
  await assertSourceStaysInFront();
  await command("type-input");
  await until(
    async () =>
      (await panel.getByLabel("原文", { exact: true }).inputValue()) ===
      "Panel typing",
    "non-activating panel receives real keyboard input",
  );
  await assertSourceStaysInFront();
  const inputBox = await panel
    .getByLabel("原文", { exact: true })
    .boundingBox();
  const panelBounds = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes("mode=panel"))
      .getBounds(),
  );
  await command(
    `drag ${panelBounds.x + inputBox.x + 12} ${panelBounds.y + inputBox.y + 20} ${panelBounds.x + inputBox.x + 180} ${panelBounds.y + inputBox.y + 20}`,
  );
  await pause(600);
  assert.equal(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes("mode=pill"))
        .isVisible(),
    ),
    false,
  );
  await command("clear");
  await until(
    () =>
      app.evaluate(
        ({ BrowserWindow }) =>
          !BrowserWindow.getAllWindows()
            .find((w) => w.webContents.getURL().includes("mode=panel"))
            .isVisible(),
      ),
    "outside click dismisses a non-activating unpinned panel",
  );
  check("非激活输入浮窗可接收键盘输入，自身划选不误弹工具栏，点击外部可收起");
  await command("changed");
  await until(async () => {
    const status = await command("status");
    return status.foreground === status.pid;
  }, "fixture foreground before keyboard selection");
  await command("select-all");
  await pause(400);
  assert.equal(
    await call("selectionGet"),
    null,
    "keyboard selection stays manual",
  );
  if ((await command("status")).secureInput) {
    const limitation =
      "Global shortcut regression not executed: macOS Secure Input is enabled by another application.";
    limitations.push(limitation);
    console.log(limitation);
  } else {
    const before = requests.length;
    await command("shortcut");
    await until(() => requests.length > before, "real Option+T key event");
    await panel
      .getByRole("button", { name: "复制结果", exact: true })
      .waitFor();
    assert.match(
      JSON.stringify(requests.at(-1)),
      /A fresh selection for the shortcut/,
    );
    check(
      "真实 Option+T 全局快捷键刷新原生选区并完成翻译（未注入测试选区或快捷键回调）",
    );
  }
  await panel.evaluate(() =>
    window.readfinch.call("window", { command: "dismiss" }),
  );
  await command("clear");
  await until(
    async () => !(await call("selectionGet")),
    "final selection cleared",
  );
  // Keep the secure-input case last: macOS suppresses global hotkeys while a
  // secure field's editor is active, independently of ReadFinch's focus routing.
  await command("secure");
  await pause(600);
  assert.equal(await call("selectionGet"), null);
  check("清空选区和进入安全密码框后不保留可用选区");
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(dir, "result.json"),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        platform: "darwin",
        arch: process.arch,
        checks,
        limitations,
        errors,
      },
      null,
      2,
    ),
  );
  console.log("Report:", path.join(dir, "result.json"));
} catch (error) {
  console.error(
    await app
      ?.evaluate(({ BrowserWindow }) => ({
        events: globalThis.__focusEvents,
        hotkeys: globalThis.__hotkeyEvents,
        windows: BrowserWindow.getAllWindows().map((w) => ({
          main: w.webContents.getURL().includes("mode=main"),
          panel: w.webContents.getURL().includes("mode=panel"),
          visible: w.isVisible(),
          focused: w.isFocused(),
        })),
      }))
      .catch(() => null),
  );
  throw error;
} finally {
  target?.kill();
  await app?.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
