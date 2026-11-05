import { _electron as electron } from "playwright";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const dir = path.resolve(".local/panel-smoke-" + Date.now());
await mkdir(dir, { recursive: true });
const checks = [],
  errors = [],
  requests = [];
const firstReply = Promise.withResolvers();
const server = createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  const text = body.messages.at(-1).content;
  requests.push(text);
  if (text.includes("First pinned")) await firstReply.promise;
  const answer = text.includes("First pinned")
    ? "第一个窗口独立完成"
    : "第二个窗口独立完成";
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  res.end(
    `data: ${JSON.stringify({ choices: [{ delta: { content: answer } }] })}\n\ndata: [DONE]\n\n`,
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const env = { ...process.env, READFINCH_TEST_HOOKS: "1" };
delete env.ELECTRON_RUN_AS_NODE;
let app;
const call = (page, method, arg) =>
  page.evaluate(({ method, arg }) => window.readfinch.call(method, arg), {
    method,
    arg,
  });
async function until(check, label) {
  for (let n = 0; n < 150; n++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Timed out: " + label);
}
async function pageFor(mode, except) {
  let page;
  await until(async () => {
    page = app
      .windows()
      .find(
        (p) =>
          !p.isClosed() && p !== except && p.url().includes("mode=" + mode),
      );
    return page && (await page.locator("#root > *").count());
  }, mode);
  page.setDefaultTimeout(12000);
  return page;
}
const info = (page) =>
  page.evaluate(() => window.readfinch.call("interactionGet"));
const visiblePanels = () =>
  app.evaluate(
    ({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().filter(
        (w) => w.isVisible() && w.webContents.getURL().includes("mode=panel"),
      ).length,
  );
try {
  app = await electron.launch({
    args: [".", `--data-dir=${dir}`, "--settings"],
    env,
  });
  app.on("window", (p) => p.on("pageerror", (e) => errors.push(e.message)));
  const main = await pageFor("main");
  const state = await call(main, "snapshot");
  state.config.appearance.language = "zh-CN";
  state.config.defaults.sourceLanguage = "English";
  state.config.noteSuggestion.enabled = false;
  state.config.selection.automatic = false;
  state.config.shortcuts = {
    input: "Control+Alt+Shift+F4",
    selection: "",
    capture: "",
    clipboard: "",
  };
  state.config.actions.forEach((a) => (a.shortcut = ""));
  Object.assign(state.config.providers[0], {
    model: "fixture",
    requiresKey: false,
    endpoint: `http://127.0.0.1:${server.address().port}/v1`,
  });
  await call(main, "saveConfig", {
    config: state.config,
    revision: state.revision,
  });
  await app.evaluate(() => globalThis.__readfinchTest.shortcut("input"));
  const first = await pageFor("panel");
  await first.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "原文",
  );
  assert.equal((await info(first)).source, "empty");
  const editor = first.getByLabel("原文", { exact: true });
  await editor.fill("First pinned");
  await editor.press("Shift+Enter");
  assert.equal(await editor.inputValue(), "First pinned\n");
  assert.equal(requests.length, 0);
  await editor.evaluate((el) =>
    el.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        isComposing: true,
      }),
    ),
  );
  assert.equal(requests.length, 0);
  await editor.press("Enter");
  await until(() => requests.length === 1, "first request");
  await first.getByRole("button", { name: "保持浮窗", exact: true }).click();
  const firstSession = await info(first);
  assert.equal(firstSession.pinned, true);
  checks.push(
    "Input shortcut focuses editor; Enter translates; Shift+Enter and IME composition do not submit",
  );
  await new Promise((r) => setTimeout(r, 950));
  await app.evaluate(() => globalThis.__readfinchTest.shortcut("input"));
  const second = await pageFor("panel", first);
  await second.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "原文",
  );
  assert.notEqual((await info(second)).id, firstSession.id);
  assert.equal(await visiblePanels(), 2);
  assert.equal((await info(first)).id, firstSession.id);
  await second.getByLabel("原文", { exact: true }).fill("Second independent");
  await second.getByLabel("原文", { exact: true }).press("Enter");
  await second.getByText("第二个窗口独立完成", { exact: true }).waitFor();
  firstReply.resolve();
  await first.getByText("第一个窗口独立完成", { exact: true }).waitFor();
  assert.equal(
    await second.getByText("第一个窗口独立完成", { exact: true }).count(),
    0,
  );
  checks.push(
    "A new shortcut opens a second window without cancelling or replacing the pinned window's running request",
  );
  await call(main, "settingsOpen", { tab: "general" });
  assert.equal(await visiblePanels(), 1);
  assert.equal((await info(first)).id, firstSession.id);
  if (process.platform === "darwin") {
    await until(
      () => app.evaluate(({ app }) => app.dock.isVisible()),
      "Dock shown with settings",
    );
    await call(main, "window", { command: "close" });
    assert.equal(await app.evaluate(({ app }) => app.dock.isVisible()), true);
    assert.equal(await visiblePanels(), 1);
    await call(main, "settingsOpen", { tab: "general" });
    await until(
      () => app.evaluate(({ app }) => app.dock.isVisible()),
      "Dock restored",
    );
    checks.push(
      "Dock remains available and pinned results survive closing/reopening settings",
    );
  }
  await call(main, "panelOpen", { source: "empty" });
  assert.equal((await info(first)).id, firstSession.id);
  assert.equal(
    await second.getByLabel("原文", { exact: true }).inputValue(),
    "",
  );
  checks.push(
    "Unpinned window is reused; settings do not dismiss pinned windows",
  );
  const secondWindow = await app.browserWindow(second);
  await until(
    async () =>
      (await secondWindow.evaluate((win) => win.getBounds())).height > 300,
    "input content fits after reopening",
  );
  const secondId = await secondWindow.evaluate((win) => win.id);
  const placement = await app.evaluate(
    ({ BrowserWindow, screen }, id) => ({
      bounds: BrowserWindow.fromId(id).getBounds(),
      cursor: screen.getCursorScreenPoint(),
      area: screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
        .workArea,
    }),
    secondId,
  );
  const { bounds: b, cursor: c, area: a } = placement;
  assert.ok(
    b.x >= a.x &&
      b.y >= a.y &&
      b.x + b.width <= a.x + a.width + 1 &&
      b.y + b.height <= a.y + a.height + 1,
  );
  assert.ok(
    Math.min(Math.abs(b.y - c.y), Math.abs(b.y + b.height - c.y)) <= 24,
    JSON.stringify(placement),
  );
  await second.screenshot({ path: path.join(dir, "input-window.png") });
  checks.push(
    "Short input window stays on the cursor's display with its nearest edge within 24 DIP",
  );
  await first
    .getByRole("button", { name: "收起浮窗", exact: true })
    .click()
    .catch((error) => {
      if (!first.isClosed()) throw error;
    });
  await until(
    () => first.isClosed(),
    "detached pinned window closes independently",
  );
  assert.equal(await visiblePanels(), 1);
  // Importing an image from a pinned window must not refocus it and dismiss the new one.
  await second.getByRole("button", { name: "保持浮窗", exact: true }).click();
  const savedSecond = await info(second);
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, path.resolve("tests/fixtures/bilingual-light.png"));
  await call(second, "imageImport");
  const third = await pageFor("panel", second);
  await third.locator(".capture-source img").waitFor();
  assert.equal((await info(second)).id, savedSecond.id);
  assert.equal(await visiblePanels(), 2);
  checks.push(
    "Image import from a pinned result opens another window and preserves the original session",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(dir, "report.json"),
    JSON.stringify({ checks, placement, errors }, null, 2),
  );
  console.log(checks.join("\n"));
  console.log("Report: " + dir);
} catch (error) {
  console.error(
    await app?.evaluate(({ app, BrowserWindow }) => ({
      dock: app.dock?.isVisible(),
      windows: BrowserWindow.getAllWindows().map((w) => ({
        mode: new URL(w.webContents.getURL()).searchParams.get("mode"),
        visible: w.isVisible(),
      })),
    })),
  );
  throw error;
} finally {
  firstReply.resolve();
  await app?.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
