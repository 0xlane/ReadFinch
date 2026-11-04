import { _electron as electron } from "playwright";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const packaged = process.argv.includes("--packaged");
const dir = path.resolve(".local/reasoning-" + Date.now());
const output = "docs/screenshots/current";
await mkdir(dir, { recursive: true });
await mkdir(output, { recursive: true });
const requests = [],
  errors = [],
  checks = [];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn) => {
  for (let i = 0; i < 160; i++) {
    if (await fn()) return;
    await pause(50);
  }
  throw Error("Condition timed out");
};
const server = createServer(async (req, res) => {
  let raw = "";
  for await (const c of req) raw += c;
  const body = JSON.parse(raw || "{}");
  requests.push({
    body,
    res,
    delta(value) {
      if (res.destroyed || res.writableEnded) return;
      if (!res.headersSent) res.setHeader("Content-Type", "text/event-stream");
      res.write(
        "data: " + JSON.stringify({ choices: [{ delta: value }] }) + "\n\n",
      );
    },
    end() {
      if (!res.destroyed) res.end("data: [DONE]\n\n");
    },
    json(value) {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(value));
    },
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.READFINCH_TEST_HOOKS;
let app, main, panel, oldClipboard;
const button = (name) => panel.getByRole("button", { name, exact: true });
const api = (method, arg) =>
  main.evaluate(({ method, arg }) => window.readfinch.call(method, arg), {
    method,
    arg,
  });
const bounds = () =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes("mode=panel"))
      .getBounds(),
  );
async function configure(change) {
  const s = await api("snapshot");
  change(s.config);
  return api("saveConfig", { config: s.config, revision: s.revision });
}
async function open(text, action = "translate", label = "翻译") {
  await api("panelOpen", { source: "action-test", actionId: action });
  await until(() => app.windows().some((p) => p.url().includes("mode=panel")));
  panel = app.windows().find((p) => p.url().includes("mode=panel"));
  panel.setDefaultTimeout(15000);
  const english = (await api("snapshot")).interfaceLocale === "en";
  await panel
    .getByLabel(english ? "Original text" : "原文", { exact: true })
    .fill(text);
  await button(english ? `Test ${label}` : `测试「${label}」`).click();
}
async function next(text, action, label) {
  const index = requests.length;
  await open(text, action, label);
  await until(() => requests.length > index);
  return requests[index];
}
async function done() {
  await button("重新生成").waitFor();
}
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
  await main.locator("main h1").waitFor();
  await configure((c) => {
    c.appearance.language = "zh-CN";
    c.appearance.theme = "light";
    c.shortcuts = { input: "", selection: "", capture: "", clipboard: "" };
    c.actions.forEach((a) => (a.shortcut = ""));
    c.selection.automatic = false;
    c.noteSuggestion.enabled = false;
    Object.assign(c.providers[0], {
      requiresKey: false,
      model: "fixture",
      stream: true,
      endpoint: "http://127.0.0.1:" + server.address().port + "/v1",
      proxy: { mode: "direct", address: "" },
    });
  });
  const source = "A chance encounter was pure serendipity.";
  const answer = "一次偶然的相遇，是一场美好的意外。";
  const q = await next(source);
  await panel.getByText("思考中", { exact: true }).waitFor();
  assert.equal(await button("展开思考").count(), 0);
  assert.equal(await panel.locator(".result-pending").count(), 0);
  await button("保持浮窗").click();
  const before = await bounds();
  await panel.screenshot({ path: output + "/model-waiting.png" });
  q.delta({
    reasoning_content: "先理解原文中的偶然与惊喜，再选择自然的中文表达。\n",
  });
  await button("展开思考").waitFor();
  assert.equal(await button("展开思考").getAttribute("aria-expanded"), "false");
  await button("展开思考").click();
  await panel
    .locator(".thinking-content")
    .getByText(/先理解原文/)
    .waitFor();
  q.delta({
    reasoning_content: Array.from(
      { length: 18 },
      (_, i) => `核对第 ${i + 1} 句，保持原意。`,
    ).join("\n"),
  });
  const scroller = panel.locator(".thinking-content");
  await until(() =>
    scroller.evaluate(
      (n) =>
        n.scrollTop > 0 && n.scrollHeight - n.scrollTop - n.clientHeight <= 8,
    ),
  );
  await scroller.evaluate((n) => {
    n.scrollTop = 0;
    n.dispatchEvent(new Event("scroll"));
  });
  q.delta({ reasoning_content: "\n最后保留句子的轻松语气。" });
  await panel
    .locator(".thinking-content p")
    .filter({ hasText: /最后保留/ })
    .waitFor();
  await pause(80);
  assert.equal(await scroller.evaluate((n) => n.scrollTop), 0);
  await button("收起思考").click();
  await button("展开思考").click();
  await until(() =>
    scroller.evaluate(
      (n) => n.scrollHeight - n.scrollTop - n.clientHeight <= 8,
    ),
  );
  await panel.screenshot({ path: output + "/reasoning-light.png" });
  await api("setTheme", { theme: "dark" });
  await panel.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  await panel.screenshot({ path: output + "/reasoning-dark.png" });
  await panel.emulateMedia({ reducedMotion: "reduce" });
  await pause(80);
  assert.equal(
    await panel
      .locator(".thinking-icon path")
      .evaluate((n) => n.getAnimations().length),
    0,
  );
  assert.equal(
    await panel
      .locator(".thinking-label")
      .evaluate((n) => getComputedStyle(n).animationName),
    "none",
  );
  q.delta({ content: answer });
  await panel.getByText("思考完成", { exact: true }).waitFor();
  assert.ok(await button("停止").isVisible());
  assert.equal(await panel.locator(".rf-translation").innerText(), answer);
  assert.equal(await button("收起思考").getAttribute("aria-expanded"), "true");
  q.end();
  await done();
  const after = await bounds();
  assert.equal(after.x, before.x);
  assert.equal(after.y, before.y);
  oldClipboard = await app.evaluate(({ clipboard }) => clipboard.readText());
  await button("复制结果").click();
  assert.equal(
    await app.evaluate(({ clipboard }) => clipboard.readText()),
    answer,
  );
  await app.evaluate(
    ({ clipboard }, text) => clipboard.writeText(text),
    oldClipboard,
  );
  oldClipboard = undefined;
  await button("保存到本地笔记库").click();
  await button("创建并保存").click();
  await button("在笔记库中查看").waitFor();
  const list = await api("notesList", { search: "", notebook: "", offset: 0 });
  const note = await api("noteGet", { id: list.notes[0].id });
  assert.equal(note.result, answer);
  checks.push(
    "Waiting and reasoning match the reference: animated Thinking, collapsed by default, bounded auto-scroll that respects manual scrolling, then Thinking complete on the first answer token. Light/dark and reduced motion verified.",
  );
  checks.push(
    "Expanding and streaming reasoning keeps the popup origin fixed; copy and local notes contain only the answer.",
  );

  await api("setTheme", { theme: "light" });
  const count = requests.length;
  await open(source);
  await done();
  assert.equal(requests.length, count);
  await panel.getByText("思考完成", { exact: true }).waitFor();
  assert.equal(await button("展开思考").getAttribute("aria-expanded"), "false");
  await button("展开思考").click();
  assert.match(await scroller.innerText(), /先理解原文/);
  checks.push(
    "Cache hits replay the completed answer and original reasoning without starting another request.",
  );

  const cancel = await next("Cancel before any response.");
  await button("停止").click();
  assert.equal(await panel.locator(".thinking-card").count(), 0);
  cancel.end();
  const failed = await next("An interrupted reasoning stream.");
  failed.delta({ reasoning_content: "已收到的思考会保留。" });
  await button("展开思考").waitFor();
  failed.res.destroy();
  await done();
  await panel.getByText("思考完成", { exact: true }).waitFor();
  await button("展开思考").click();
  assert.match(await scroller.innerText(), /已收到的思考/);
  assert.ok((await panel.locator(".panel-error").count()) > 0);
  const stale = await next("The old request must not leak.");
  stale.delta({ reasoning_content: "上一轮的思考" });
  await button("展开思考").waitFor();
  const plain = await next("A fresh request with no reasoning.");
  stale.delta({ reasoning_content: "过期内容" });
  stale.end();
  plain.delta({ content: "只有答案" });
  plain.end();
  await done();
  assert.equal(await button("展开思考").count(), 0);
  assert.equal(await panel.locator(".thinking-content").count(), 0);
  await panel.getByText("思考完成", { exact: true }).waitFor();
  checks.push(
    "Cancellation and stream failure settle the indicator; partial reasoning is retained on failure, and switching requests clears old reasoning. Models with no reasoning get no expand control.",
  );

  await configure((c) => (c.providers[0].stream = false));
  const json = await next("A non-streaming request.");
  await panel.getByText("思考中", { exact: true }).waitFor();
  json.json({
    choices: [
      {
        message: {
          reasoning_content: "一次性返回的思考。",
          content: "非流式答案",
        },
        finish_reason: "stop",
      },
    ],
  });
  await done();
  await button("展开思考").click();
  assert.equal(await scroller.innerText(), "一次性返回的思考。");
  await configure((c) => (c.providers[0].stream = true));
  const dictionary = await next("serendipity", "dictionary", "词典");
  dictionary.delta({ reasoning_content: "根据上下文解释这个单词。" });
  await button("展开思考").waitFor();
  const dict = {
    词条: "serendipity",
    句中词形: null,
    音标: null,
    词性: "noun",
    释义: "意外发现美好事物的机缘。",
    句子: null,
    句子翻译: null,
    难度: "C1",
    记忆技巧: null,
  };
  dictionary.delta({ content: JSON.stringify(dict) });
  dictionary.end();
  await done();
  await panel.locator(".definition").filter({ hasText: "机缘" }).waitFor();
  await button("展开思考").click();
  assert.match(await scroller.innerText(), /上下文/);
  checks.push(
    "Non-streaming replies and structured custom commands preserve reasoning separately without breaking schema rendering.",
  );

  await configure((c) => (c.appearance.language = "en"));
  const english = await next("An English interface.", "translate", "Translate");
  await panel.getByText("Thinking", { exact: true }).waitFor();
  english.delta({ reasoning_content: "Keep the translation natural." });
  await button("Expand thinking").click();
  english.delta({ content: "A natural translation." });
  english.end();
  await button("Regenerate").waitFor();
  await panel.getByText("Thinking complete", { exact: true }).waitFor();
  checks.push(
    "English labels use Thinking / Thinking complete / Expand thinking / Collapse thinking, matching the reference.",
  );

  await configure((c) => {
    c.appearance.language = "zh-CN";
    c.providers.push({
      ...c.providers[0],
      id: "pure-translation",
      name: "DeepLX",
      preset: "deeplx",
      model: "",
      endpoint: "http://127.0.0.1:" + server.address().port + "/translate",
    });
    c.actions.find((a) => a.id === "translate").providerId = "pure-translation";
  });
  const pure = await next("Pure translation.");
  assert.equal(await panel.locator(".thinking-card").count(), 0);
  await panel.getByLabel("正在翻译", { exact: true }).waitFor();
  pure.json({ code: 200, data: "纯翻译结果" });
  await done();
  assert.equal(await panel.locator(".thinking-card").count(), 0);
  checks.push(
    "Pure translation providers keep the reference's compact spinner instead of an AI thinking indicator.",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/" + (packaged ? "packaged-" : "") + "reasoning-verification.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        version: (await api("snapshot")).version,
        packaged,
        checks,
        rendererErrors: errors,
        scope:
          "Isolated desktop profile, controlled HTTP fixtures and normal command trials. No user credentials or notes modified.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(checks.join("\n"));
} catch (e) {
  console.error("Diagnostics:", dir, errors);
  console.error(
    await panel
      ?.locator("body")
      .innerText()
      .catch(() => ""),
  );
  await panel?.screenshot({ path: dir + "/failed.png" }).catch(() => {});
  throw e;
} finally {
  if (oldClipboard !== undefined && app)
    await app
      .evaluate(
        ({ clipboard }, text) => clipboard.writeText(text),
        oldClipboard,
      )
      .catch(() => {});
  await app?.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
