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
execFileSync("swiftc", [
  "tests/fixtures/MacSelectionTarget.swift",
  "-module-cache-path",
  path.join(dir, "swift-cache"),
  "-o",
  binary,
]);
const checks = [],
  requests = [],
  errors = [];
const server = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  requests.push(JSON.parse(body));
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  res.end(
    'data: {"choices":[{"delta":{"content":"Mac fixture translation"}}]}\n\ndata: [DONE]\n\n',
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
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.hide()),
  );
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
  await pill.getByRole("button", { name: "翻译", exact: true }).click();
  await until(
    () => app.windows().some((p) => p.url().includes("mode=panel")),
    "translation panel",
  );
  const panel = app.windows().find((p) => p.url().includes("mode=panel"));
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
  await command("secure");
  await pause(600);
  assert.equal(await call("selectionGet"), null);
  check("清空选区和进入安全密码框后不保留可用选区");
  await command("changed");
  await pause(400);
  assert.equal(
    await call("selectionGet"),
    null,
    "keyboard selection stays manual",
  );
  const before = requests.length;
  await command("shortcut");
  await until(() => requests.length > before, "real Option+T key event");
  await panel.getByRole("button", { name: "复制结果", exact: true }).waitFor();
  assert.match(
    JSON.stringify(requests.at(-1)),
    /A fresh selection for the shortcut/,
  );
  check(
    "真实 Option+T 全局快捷键刷新原生选区并完成翻译（未注入测试选区或快捷键回调）",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(dir, "result.json"),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        platform: "darwin",
        arch: process.arch,
        checks,
        errors,
      },
      null,
      2,
    ),
  );
  console.log("Report:", path.join(dir, "result.json"));
} finally {
  target?.kill();
  await app?.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
