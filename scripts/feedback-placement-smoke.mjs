import { _electron as electron } from "playwright";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const packaged = process.argv.includes("--packaged"),
  dir = path.resolve(".local/feedback-placement-" + Date.now()),
  checks = [],
  errors = [];
await mkdir(dir, { recursive: true });
let mode = "fast",
  pendingSuggestion,
  probeCount = 0;
const server = createServer(async (req, res) => {
  let raw = "";
  for await (const c of req) raw += c;
  const body = JSON.parse(raw),
    prompt = body.messages[0].content;
  if (prompt.startsWith("Suggest vocabulary notes")) {
    const notes = ["serendipity", "encounter"].map((term) => ({
      term,
      summary: "适合加入生词本的常用表达。",
      result: {
        词条: term,
        释义: "一次意外的发现或相遇。",
        音标: null,
        词性: null,
        句子: null,
        句中词形: null,
        句子翻译: null,
        记忆技巧: null,
        难度: null,
      },
    }));
    pendingSuggestion = () => {
      if (res.writableEnded || res.destroyed) return;
      res.setHeader("Content-Type", "text/event-stream");
      res.end(
        "data: " +
          JSON.stringify({
            choices: [{ delta: { content: JSON.stringify({ notes }) } }],
          }) +
          "\n\ndata: [DONE]\n\n",
      );
    };
    return;
  }
  if (prompt.startsWith("Translate Hi")) {
    probeCount++;
    const selected = mode;
    await new Promise((r) =>
      setTimeout(
        r,
        selected === "slow" ? 3200 : selected === "held" ? 1200 : 200,
      ),
    );
    if (selected === "error") {
      res.writeHead(401);
      return res.end('{"error":{"message":"private-provider-details"}}');
    }
    res.setHeader("Content-Type", "application/json");
    return res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content:
                selected === "empty" ? "" : "这是不应展示在页面上的模型回复",
            },
          },
        ],
      }),
    );
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.end(
    "data: " +
      JSON.stringify({
        choices: [{ delta: { content: "偶然的相遇带来了意外发现。" } }],
      }) +
      "\n\ndata: [DONE]\n\n",
  );
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const env = { ...process.env, READFINCH_TEST_HOOKS: "1" };
delete env.ELECTRON_RUN_AS_NODE;
let app, main;
const api = (method, arg) =>
  main.evaluate(({ method, arg }) => window.readfinch.call(method, arg), {
    method,
    arg,
  });
const btn = (page, name) => page.getByRole("button", { name, exact: true });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (check) => {
  for (let i = 0; i < 120; i++) {
    if (await check()) return;
    await pause(50);
  }
  throw Error("Condition timed out");
};
try {
  app = await electron.launch({
    ...(packaged
      ? { executablePath: path.resolve("release/win-unpacked/ReadFinch.exe") }
      : {}),
    args: [...(packaged ? [] : ["."]), "--settings", "--data-dir=" + dir],
    env,
  });
  app.on("window", (p) => p.on("pageerror", (e) => errors.push(e.message)));
  main = await app.firstWindow();
  main.setDefaultTimeout(15000);
  await main.locator("main h1").waitFor();
  const s = await api("snapshot");
  s.config.appearance.language = "zh-CN";
  s.config.appearance.theme = "light";
  s.config.shortcuts = { input: "", selection: "", capture: "", clipboard: "" };
  s.config.actions.forEach((a) => (a.shortcut = ""));
  s.config.selection.automatic = true;
  s.config.noteSuggestion.enabled = true;
  Object.assign(s.config.providers[0], {
    requiresKey: false,
    model: "fixture",
    endpoint: "http://127.0.0.1:" + server.address().port + "/v1",
    proxy: { mode: "direct", address: "" },
  });
  await api("saveConfig", { config: s.config, revision: s.revision });
  await api("settingsOpen", { tab: "text" });
  await btn(main, "测试连接").click();
  await btn(main, "测试中...").waitFor();
  assert.equal(await btn(main, "测试中...").isDisabled(), true);
  await btn(main, "成功").waitFor();
  assert.equal(await main.locator(".alert.success").count(), 0);
  assert.doesNotMatch(await main.locator("body").innerText(), /不应展示在页面/);
  await main.screenshot({
    path: "docs/screenshots/current/provider-test-success.png",
  });
  await btn(main, "测试连接").waitFor({ timeout: 6500 });
  mode = "slow";
  await btn(main, "测试连接").click();
  await btn(main, "缓慢（建议调节思考模式）").waitFor();
  mode = "error";
  await btn(main, "缓慢（建议调节思考模式）").click();
  const errorDetail = main.getByRole("alert", { name: "连接失败" });
  await errorDetail.waitFor();
  await main.mouse.move(0, 0);
  assert.match(await errorDetail.innerText(), /HTTP 401.*API Key/);
  assert.doesNotMatch(await errorDetail.innerText(), /private-provider/);
  mode = "empty";
  await btn(main, "测试连接").click();
  await btn(main, "测试中...").waitFor();
  await errorDetail.waitFor();
  assert.match(await errorDetail.innerText(), /未返回(?:有效内容|文字结果)/);
  checks.push(
    "The probe button shows pending, success and slow states. A dismissible notification explains a failure without moving the form.",
  );
  mode = "held";
  await btn(main, "测试连接").click();
  await until(() => probeCount >= 5);
  const name = main.locator(".provider-editor").getByRole("textbox").first();
  await name.fill("Renamed while testing");
  await btn(main, "测试连接").waitFor();
  await pause(1400);
  assert.equal(await btn(main, "成功").count(), 0);
  await api("setTheme", { theme: "dark" });
  mode = "fast";
  await btn(main, "测试连接").click();
  await btn(main, "成功").waitFor();
  await main.screenshot({
    path: "docs/screenshots/current/provider-test-dark.png",
  });
  checks.push(
    "Changing connection settings invalidates an in-flight probe; dark mode keeps readable state icons and failed responses expose only safe diagnostics.",
  );
  await api("setTheme", { theme: "light" });
  const { area, cursor } = await app.evaluate(({ screen }) => ({
    cursor: screen.getCursorScreenPoint(),
    area: screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea,
  }));
  const below =
    area.y + area.height - 8 - cursor.y - 12 >= cursor.y - 12 - area.y - 8;
  const edge = (bounds) => (below ? bounds.y : bounds.y + bounds.height);
  if (!packaged) {
    await app.evaluate(({ screen }) => {
      const a = screen.getPrimaryDisplay().workArea,
        anchor = { x: a.x + Math.floor(a.width * 0.6), y: a.y + a.height - 40 };
      globalThis.__readfinchTest.select(
        {
          token: "bottom-fixture",
          text: "A chance encounter was pure serendipity.",
          app: "Reader",
          ...anchor,
          canReplace: false,
        },
        anchor,
      );
    });
    await api("selectionOpen", { actionId: "translate" });
  } else {
    await api("panelOpen", { source: "action-test", actionId: "translate" });
  }
  await until(() => app.windows().some((p) => p.url().includes("mode=panel")));
  const panel = app.windows().find((p) => p.url().includes("mode=panel"));
  panel.setDefaultTimeout(15000);
  if (packaged) {
    await panel
      .getByLabel("原文", { exact: true })
      .fill("A chance encounter was pure serendipity.");
    await btn(panel, "测试「翻译」").click();
  }
  await btn(panel, "保持浮窗").click();
  await panel
    .getByText("偶然的相遇带来了意外发现。", { exact: true })
    .waitFor();
  await until(() => !!pendingSuggestion);
  await pause(100);
  const before = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("mode=panel"),
    );
    globalThis.recordedBounds = [w.getBounds()];
    w.on("move", () => globalThis.recordedBounds.push(w.getBounds()));
    w.on("resize", () => globalThis.recordedBounds.push(w.getBounds()));
    return w.getBounds();
  });
  await panel.screenshot({
    path: "docs/screenshots/current/translation-before-suggestions.png",
  });
  pendingSuggestion();
  await panel
    .getByRole("region", { name: "猜你想存" })
    .getByRole("checkbox", { name: "serendipity", exact: true })
    .waitFor();
  await pause(250);
  const after = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes("mode=panel"))
      .getBounds(),
  );
  const frames = await app.evaluate(() => globalThis.recordedBounds);
  for (const b of frames) {
    assert.equal(b.x, before.x);
    assert.equal(edge(b), edge(before));
  }
  assert.ok(after.y + after.height <= area.y + area.height - 6);
  await panel.screenshot({
    path: "docs/screenshots/current/translation-after-suggestions.png",
  });
  // Oversized content must scroll without moving the title bar or footer off screen.
  await panel.evaluate(() => {
    const extra = document.createElement("div");
    extra.style.height = "1800px";
    extra.textContent = "Long result fixture";
    document.querySelector(".rf-body").append(extra);
  });
  await pause(200);
  assert.equal(
    await panel
      .locator(".panel-scroll")
      .evaluate((e) => e.scrollHeight > e.clientHeight),
    true,
  );
  const capped = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes("mode=panel"))
      .getBounds(),
  );
  assert.equal(capped.x, before.x);
  assert.equal(edge(capped), edge(before));
  assert.ok(capped.y + capped.height <= area.y + area.height - 6);
  checks.push(
    (packaged ? "Packaged result" : "Result opened at the pointer") +
      " keeps its pointer-facing edge when delayed suggestions arrive; oversized results scroll inside a bounded window.",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/" +
      (packaged ? "packaged-" : "") +
      "feedback-placement-verification.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        version: (await api("snapshot")).version,
        packaged,
        checks,
        rendererErrors: errors,
        bounds: { before, after, capped },
        scope:
          "Isolated desktop profile and local HTTP fixtures. Synthetic selection coordinates deliberately differ from the actual pointer; packaged mode uses the normal command trial.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(checks.join("\n"));
} catch (e) {
  console.error(
    "Diagnostics: " + dir,
    errors,
    await main
      ?.locator("body")
      .innerText()
      .catch(() => ""),
  );
  await main?.screenshot({ path: dir + "/failed.png" }).catch(() => {});
  throw e;
} finally {
  pendingSuggestion?.();
  await app?.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
