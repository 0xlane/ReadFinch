import { _electron as electron } from "playwright";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import assert from "node:assert/strict";

const dir = path.resolve(".local/context-smoke-" + Date.now());
const output = "docs/screenshots/v0.9";
await mkdir(dir, { recursive: true });
await mkdir(output, { recursive: true });
const errors = [];
const requests = [];
const checks = [];
let holdDictionary = true;
let releaseDefinition;
const startDictionary = Promise.withResolvers();
const finishWriting = Promise.withResolvers();
checks.push = function (...values) {
  console.log(...values);
  return Array.prototype.push.apply(this, values);
};
const server = createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const input = JSON.parse(raw || "{}");
  requests.push(input);
  if (input.model === "fixture-error") {
    res.writeHead(429);
    res.end("fixture");
    return;
  }
  const prompt = String(input.messages?.[0]?.content || "");
  if (prompt.startsWith("Suggest vocabulary notes")) {
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({ choices: [{ message: { content: '{"notes":[]}' } }] }),
    );
    return;
  }
  const text = input.response_format?.json_schema?.schema?.required?.includes(
    "释义",
  )
    ? JSON.stringify({
        词条: "serendipity",
        句中词形: null,
        音标: "/ˌserənˈdɪpəti/",
        词性: "noun",
        释义: "偶然发现美好或有价值事物的机缘。",
        句子: "Finding this little bookshop was pure serendipity.",
        句子翻译: "偶然发现这家小书店，是一场美好的意外。",
        难度: "C1",
        记忆技巧: "把它与一次意外的美好发现联系起来。",
      })
    : prompt.includes("grammar")
      ? JSON.stringify({
          场合: "日常表达 · 鼓励他人",
          标注: JSON.stringify([
            {
              text: "makes",
              replacement: "can make",
              note: "复数主语 steps 后不使用 makes；can make 更贴合原句的鼓励语气。",
              type: "语法",
              tier: "error",
            },
          ]),
          改后: "Small steps can make a meaningful difference.",
          总评: "用 can 表达可能性，保留原意并使语气更自然。",
        })
      : "好的工具应当融入正在进行的工作。\n\n选中文字，在需要的地方获得帮助，然后继续阅读。";
  res.setHeader("Content-Type", "text/event-stream");
  if (
    holdDictionary &&
    input.response_format?.json_schema?.schema?.required?.includes("释义")
  )
    await startDictionary.promise;
  let sent = 0;
  for (const piece of text.match(/.{1,12}|\n/gs) ?? []) {
    if (res.destroyed) return;
    res.write(
      "data: " +
        JSON.stringify({ choices: [{ delta: { content: piece } }] }) +
        "\n\n",
    );
    sent += piece.length;
    if (prompt.includes("grammar") && sent >= text.indexOf("改后"))
      await finishWriting.promise;
    if (
      holdDictionary &&
      input.response_format?.json_schema?.schema?.required?.includes("释义") &&
      sent >= text.indexOf("偶然") + 2
    ) {
      holdDictionary = false;
      await new Promise((resolve) => {
        releaseDefinition = resolve;
      });
    }
    await new Promise((r) =>
      setTimeout(r, input.model === "fixture-slow" ? 150 : 15),
    );
  }
  res.end("data: [DONE]\n\n");
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const env = { ...process.env, TEXTHOP_TEST_HOOKS: "1" };
delete env.ELECTRON_RUN_AS_NODE;
const runtime = await electron.launch({
  args: [".", `--data-dir=${dir}`],
  env,
});
const watch = (page) => {
  page.setDefaultTimeout(12000);
  page.on("pageerror", (e) => errors.push(e.message));
};
runtime.on("window", watch);
const main = await runtime.firstWindow();
watch(main);
const api = (page, method, arg) =>
  page.evaluate(({ method, arg }) => window.texthop.call(method, arg), {
    method,
    arg,
  });
async function windowMode(mode) {
  for (let n = 0; n < 150; n++) {
    const page = runtime
      .windows()
      .find((w) => w.url().includes("mode=" + mode));
    if (page && (await page.locator("#root > *").count())) return page;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Missing window: " + mode);
}
const visible = (mode) =>
  runtime.evaluate(
    ({ BrowserWindow }, mode) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes("mode=" + mode))
        ?.isVisible() ?? false,
    mode,
  );
async function setModel(model) {
  await main.evaluate(
    async ({ model, endpoint }) => {
      const s = await window.texthop.call("snapshot");
      Object.assign(s.config.providers[0], {
        model,
        endpoint,
        requiresKey: false,
        name: "本机测试服务 · fixture",
      });
      await window.texthop.call("saveConfig", {
        config: s.config,
        revision: s.revision,
      });
    },
    { model, endpoint: `http://127.0.0.1:${server.address().port}/v1` },
  );
}
async function injectSelection(text) {
  await runtime.evaluate(({ BrowserWindow }, text) => {
    // Development-only event fixture. This does not validate Windows UIA.
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes("mode=main"))
      .show();
    globalThis.__texthopTest.select({
      token: "fixture-" + Date.now(),
      text,
      app: "阅读器 · 选区样例",
      x: 600,
      y: 260,
      canReplace: false,
    });
  }, text);
}
try {
  await main.evaluate(async () => {
    const s = await window.texthop.call("snapshot");
    if (s.interfaceLocale !== "zh-CN") {
      s.config.appearance.language = "zh-CN";
      await window.texthop.call("saveConfig", {
        config: s.config,
        revision: s.revision,
      });
    }
  });
  await main.getByRole("heading", { name: "通用", exact: true }).waitFor();
  assert.equal(await main.locator(".action-toolbar").count(), 0);
  assert.equal(await main.getByLabel("原文").count(), 0);
  checks.push("main window contains settings only");
  const exclusion = main.getByLabel("不启用划词的应用");
  await exclusion.fill("fixture-unsaved.exe");
  await main.getByRole("button", { name: "深色", exact: true }).click();
  await main.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  assert.equal(await exclusion.inputValue(), "fixture-unsaved.exe");
  await runtime.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.send("texthop:nativeStatus", {
      state: "ready",
      message: "fixture status",
    }),
  );
  assert.equal(await exclusion.inputValue(), "fixture-unsaved.exe");
  await main.screenshot({ path: output + "/settings-dark.png" });
  await main.getByRole("button", { name: "浅色", exact: true }).click();
  await main.waitForFunction(
    () => document.documentElement.dataset.theme === "light",
  );
  await main.screenshot({ path: output + "/settings-light.png" });
  assert.equal(
    await main.getByRole("button", { name: "保存设置", exact: true }).count(),
    0,
  );
  await main.waitForFunction(
    async () =>
      (await window.texthop.call("snapshot")).config.selection
        .excludedApps[0] === "fixture-unsaved.exe",
  );
  checks.push("theme applies immediately and preserves unsaved fields");
  await main
    .getByRole("navigation")
    .getByRole("button", { name: "API 提供商", exact: true })
    .click();
  const endpointInput = main.getByLabel("API 基础地址");
  const originalEndpoint = await endpointInput.inputValue();
  await endpointInput.fill("https://");
  await main.getByText("待完善", { exact: true }).waitFor();
  assert.equal(
    (await api(main, "snapshot")).config.providers[0].endpoint,
    originalEndpoint,
  );
  await endpointInput.fill(originalEndpoint);
  await main.getByText("待完善", { exact: true }).waitFor({ state: "hidden" });
  await main
    .locator(".alert.error")
    .first()
    .waitFor({ state: "hidden", timeout: 4000 })
    .catch(async () => {
      throw Error(
        "Unexpected settings alert: " +
          (await main.locator(".alert.error").allTextContents()),
      );
    });
  assert.equal(
    await main.locator(".alert.error").count(),
    0,
    "Restoring a saved value must clear its validation error",
  );
  await main
    .getByRole("navigation")
    .getByRole("button", { name: "自定义 AI 指令", exact: true })
    .click();
  await main.getByRole("button", { name: "添加 AI 指令", exact: true }).click();
  await main
    .getByRole("dialog")
    .getByRole("button", { name: "空白", exact: true })
    .click();
  await main.getByLabel("指令名称", { exact: true }).fill("技术术语释义");
  await main
    .getByRole("navigation")
    .getByRole("button", { name: "通用", exact: true })
    .click();
  await main.locator(".autosave-state").filter({ hasText: "已保存" }).waitFor();
  for (
    let attempt = 0;
    attempt < 40 &&
    !(await api(main, "snapshot")).config.actions.some(
      (a) => a.name === "技术术语释义",
    );
    attempt++
  )
    await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(
    (await api(main, "snapshot")).config.actions.some(
      (action) => action.name === "技术术语释义",
    ),
  );
  await main
    .getByRole("navigation")
    .getByRole("button", { name: "通用", exact: true })
    .click();
  checks.push(
    "invalid partial addresses remain drafts; action edits persist on immediate close",
  );
  await main.getByRole("button", { name: "跟随系统", exact: true }).click();
  await main.waitForFunction(
    () =>
      document
        .querySelector(".theme-option.system")
        ?.getAttribute("aria-pressed") === "true",
  );
  const system = await runtime.evaluate(({ nativeTheme }) => ({
    source: nativeTheme.themeSource,
    dark: nativeTheme.shouldUseDarkColors,
  }));
  assert.equal(system.source, "system");
  assert.equal(
    await main.evaluate(() => document.documentElement.dataset.theme),
    system.dark ? "dark" : "light",
  );
  await runtime.evaluate(({ nativeTheme }) => {
    nativeTheme.themeSource = "dark";
  });
  await main.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  assert.equal((await api(main, "snapshot")).config.appearance.theme, "system");
  await runtime.evaluate(({ nativeTheme }) => {
    nativeTheme.themeSource = "system";
  });
  checks.push(
    "system preference and nativeTheme updates propagate without changing OS settings",
  );
  await api(main, "setTheme", { theme: "light" });
  await injectSelection(
    "Good tools should fit into the work already in progress. Select a passage, get help where you need it, and keep reading.",
  );
  const pill = await windowMode("pill");
  await pill.getByRole("button", { name: "翻译", exact: true }).waitFor();
  assert.equal(requests.length, 0, "selection must never send text by itself");
  await pill.screenshot({ path: output + "/trigger-light.png" });
  await pill.getByRole("button", { name: "翻译", exact: true }).click();
  const panel = await windowMode("panel");
  await panel.getByRole("heading", { name: "翻译", exact: true }).waitFor();
  await panel.getByRole("alert").waitFor();
  assert.equal(requests.length, 0);
  await panel.screenshot({ path: output + "/missing-model.png" });
  checks.push(
    "selection fixture opens a distinct popup; no request until configured action",
  );
  await panel.getByRole("button", { name: "保持浮窗" }).click();
  await setModel("fixture-text");
  await panel.getByRole("button", { name: "重新生成", exact: true }).click();
  await panel.getByRole("button", { name: "复制结果", exact: true }).waitFor();
  await panel.getByRole("button", { name: "重新生成", exact: true }).waitFor();
  await panel.getByRole("button", { name: "保存到本地笔记库" }).click();
  await panel.getByRole("region", { name: "创建笔记库？" }).waitFor();
  await panel.screenshot({ path: output + "/create-notebase-from-result.png" });
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  await panel.getByRole("button", { name: "保存到本地笔记库" }).click();
  await panel.getByRole("button", { name: "创建并保存", exact: true }).click();
  await panel.getByRole("button", { name: "在笔记库中查看" }).waitFor();
  await panel.screenshot({ path: output + "/translation-light.png" });
  await api(main, "setTheme", { theme: "dark" });
  await panel.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  await panel.screenshot({ path: output + "/translation-dark.png" });
  await api(main, "setTheme", { theme: "light" });
  await panel.getByRole("button", { name: "取消置顶" }).click();
  await injectSelection("serendipity");
  await pill.getByRole("button", { name: "词典", exact: true }).click();
  await panel.getByText("等待模型响应", { exact: true }).waitFor();
  await panel
    .locator(".result-pending small")
    .filter({ hasText: /已等待 \d+ 秒/ })
    .waitFor();
  assert.ok(await panel.getByRole("button", { name: "停止" }).isVisible());
  startDictionary.resolve();
  await panel
    .getByRole("heading", { name: "serendipity", exact: true })
    .waitFor();
  await panel.locator(".definition").filter({ hasText: "偶然" }).waitFor();
  assert.ok(await panel.getByRole("button", { name: "停止" }).isVisible());
  assert.equal(
    await panel.getByRole("button", { name: "保存到本地笔记库" }).count(),
    0,
  );
  assert.ok(releaseDefinition);
  releaseDefinition();
  checks.push(
    "A dictionary definition is painted before the SSE stream finishes and partial answers cannot be bookmarked",
  );
  await panel.getByRole("button", { name: "重新生成", exact: true }).waitFor();
  assert.equal(
    await panel.locator(".dictionary button[data-speak]").count(),
    2,
  );
  await panel.screenshot({ path: output + "/dictionary-light.png" });

  await panel.getByRole("button", { name: "保存到本地笔记库" }).click();
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  await panel.getByRole("button", { name: "保存到本地笔记库" }).click();
  await panel.getByRole("button", { name: "创建并保存", exact: true }).click();
  await panel.getByRole("button", { name: "在笔记库中查看" }).click();
  await main
    .locator(".note-detail .definition")
    .filter({ hasText: "机缘" })
    .waitFor();
  assert.equal(await main.locator(".note-row").count(), 2);
  assert.match(
    await main.locator(".note-provenance").innerText(),
    /fixture-text/,
  );
  await main.screenshot({ path: output + "/local-notes-light.png" });
  await api(main, "setTheme", { theme: "dark" });
  await main.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  await main.screenshot({ path: output + "/local-notes-dark.png" });
  await main.getByLabel("搜索笔记").fill("偶然发现");
  await main.locator(".notes-count").filter({ hasText: "1 条" }).waitFor();
  await main.getByLabel("筛选笔记本").selectOption({ label: "翻译" });
  await main.getByRole("heading", { name: "没有匹配的笔记" }).waitFor();
  checks.push(
    "Completed results save to local notebooks, link back to structured cards, and filter by notebook and content",
  );
  const lookup = async () => {
    await injectSelection("serendipity");
    await pill.getByRole("button", { name: "词典", exact: true }).click();
    await panel.locator(".definition").filter({ hasText: "机缘" }).waitFor();
    await panel.getByRole("button", { name: "重新生成" }).waitFor();
  };
  const beforeRepeat = requests.length;
  await lookup();
  assert.equal(requests.length, beforeRepeat, "reuse cached dictionary result");
  await panel.getByRole("button", { name: "重新生成" }).click();
  await panel.getByRole("button", { name: "停止" }).waitFor();
  await panel.getByRole("button", { name: "重新生成" }).waitFor();
  assert.equal(requests.length, beforeRepeat + 1);
  await api(main, "settingsOpen", { tab: "general" });
  const ttl = main.getByLabel("缓存时长", { exact: true });
  assert.deepEqual(
    await ttl
      .locator("option")
      .evaluateAll((items) => items.map((el) => el.value)),
    ["5", "30", "60", "360", "1440"],
  );
  await ttl.selectOption("60");
  await main.waitForFunction(
    async () =>
      (await window.texthop.call("snapshot")).config.cache.minutes === 60,
  );
  await main.getByRole("switch", { name: "启用结果缓存" }).click();
  assert.ok(await ttl.isDisabled());
  await main.getByRole("switch", { name: "启用结果缓存" }).click();
  await main.getByRole("button", { name: "清空缓存" }).click();
  await main.getByText("结果缓存已清空").waitFor();
  await lookup();
  assert.equal(requests.length, beforeRepeat + 2);
  assert.equal(
    (await api(main, "notesList", { search: "", notebook: "", offset: 0 }))
      .total,
    2,
  );
  checks.push(
    "Matching requests reuse cached output, explicit regeneration and clear fetch fresh answers, and clearing retains notes",
  );

  await api(main, "setTheme", { theme: "dark" });
  await panel.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  await pill.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  await panel.screenshot({ path: output + "/dictionary-dark.png" });
  await injectSelection("Small steps makes a meaningful difference.");
  await pill.screenshot({ path: output + "/trigger-dark.png" });
  await pill.getByRole("button", { name: "更多指令", exact: true }).hover();
  const menu = pill.locator(".toolbar-menu");
  await menu.getByRole("button", { name: "写作改进", exact: true }).click();
  await panel.locator(".writing-annotation").first().waitFor();
  const analysis = panel.locator("details.writing-analysis");
  assert.ok(await analysis.evaluate((d) => d.open));
  await analysis.locator("summary").click();
  await panel.getByRole("button", { name: "藏答案", exact: true }).click();
  finishWriting.resolve();
  await panel.getByRole("button", { name: "重新生成", exact: true }).waitFor();
  assert.equal(
    await panel.locator(".revision, .writing-summary, .diff").count(),
    0,
  );
  assert.equal(
    await panel.getByText("查看修改对比", { exact: true }).count(),
    0,
  );
  await panel.getByRole("button", { name: "显示答案", exact: true }).click();
  assert.equal(await analysis.evaluate((d) => d.open), false);
  await analysis.locator("summary").click();
  checks.push(
    "Waiting time is visible and hiding writing answers survives the rest of a live stream",
  );
  await panel
    .getByText("Small steps can make a meaningful difference.", { exact: true })
    .waitFor();
  await panel.getByRole("button", { name: "重新生成", exact: true }).waitFor();
  await panel.screenshot({ path: output + "/writing-dark.png" });
  await api(main, "setTheme", { theme: "light" });
  await panel.waitForFunction(
    () => document.documentElement.dataset.theme === "light",
  );
  await panel.screenshot({ path: output + "/writing-light.png" });
  await api(main, "setTheme", { theme: "dark" });
  assert.equal(
    await panel.getByRole("button", { name: "替换原文", exact: true }).count(),
    0,
  );
  checks.push(
    "translation, dictionary, writing, all-window dark theme and unavailable replacement",
  );
  const panelBounds = await runtime.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes("mode=panel"))
      .getBounds(),
  );
  assert.ok(
    panelBounds.width < 515,
    "Repeated streaming resize must not widen the popup: " +
      JSON.stringify(panelBounds),
  );
  await setModel("fixture-slow");
  await injectSelection("Good tools fit the work.");
  await pill.getByRole("button", { name: "翻译", exact: true }).click();
  await panel.getByRole("button", { name: "停止", exact: true }).click();
  await panel.getByText(/已停止/).waitFor();
  await panel.getByRole("button", { name: "重新生成", exact: true }).click();
  await api(panel, "panelOpen", { source: "empty" });
  await panel.getByLabel("原文", { exact: true }).waitFor();
  await panel.waitForTimeout(400);
  assert.equal(await panel.locator(".rf-result").count(), 0);
  checks.push("cancel and next interaction discard the previous response");
  await panel
    .getByLabel("原文", { exact: true })
    .fill("Text entered in the contextual window.");
  await setModel("fixture-error");
  await panel.getByRole("button", { name: "翻译", exact: true }).click();
  await panel.getByRole("alert").waitFor();
  await panel.screenshot({ path: output + "/provider-error-dark.png" });
  await setModel("fixture-text");
  await panel.getByRole("button", { name: "重试", exact: true }).click();
  await panel.getByRole("button", { name: "复制结果", exact: true }).waitFor();
  checks.push("provider errors and retry stay in popup");
  // Pin and blur use actual BrowserWindow events, independent of model fixtures.
  await panel.getByRole("button", { name: "保持浮窗", exact: true }).click();
  await runtime.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes("mode=panel"))
      .emit("blur"),
  );
  assert.equal(await visible("panel"), true);
  await panel.getByRole("button", { name: "取消置顶", exact: true }).click();
  await runtime.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes("mode=panel"))
      .emit("blur"),
  );
  assert.equal(await visible("panel"), false);
  checks.push("pinned popup stays; ordinary blur hides it");
  // Genuine bundled OCR, with a known PNG. The session delivery is a fixture.
  await api(main, "panelOpen", { source: "empty" });
  const dataUrl =
    "data:image/png;base64," +
    (await readFile("tests/fixtures/bilingual-light.png")).toString("base64");
  await runtime.evaluate(
    (_, dataUrl) => globalThis.__texthopTest.image(dataUrl),
    dataUrl,
  );
  await panel.waitForFunction(
    () =>
      document.querySelector(".source-editor")?.value.includes("Small steps"),
    { timeout: 30000 },
  );
  await panel.getByRole("button", { name: "重新识别", exact: true }).waitFor();
  await panel.waitForFunction(() => !document.querySelector(".job-progress"), {
    timeout: 30000,
  });
  const ocrText = await panel.getByLabel("原文", { exact: true }).inputValue();
  assert.match(ocrText, /你好/);
  await panel.screenshot({ path: output + "/ocr-dark.png" });
  checks.push(
    "explicit image acquisition starts real local bilingual OCR automatically; text stays editable",
  );
  await panel.getByRole("button", { name: "打开设置", exact: true }).click();
  await main.getByRole("heading", { name: "截图识别", exact: true }).waitFor();
  assert.equal(await visible("panel"), false);
  for (const label of [
    "API 提供商",
    "截图识别",
    "自定义 AI 指令",
    "快捷键",
    "配置管理",
    "本地笔记库",
    "文本转语音",
  ]) {
    await main
      .getByRole("navigation")
      .getByRole("button", { name: label, exact: true })
      .click();
    await main.getByRole("heading", { name: label, exact: true }).waitFor();
    assert.equal(
      await main.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  await main
    .getByRole("navigation")
    .getByRole("button", { name: "自定义 AI 指令", exact: true })
    .click();
  await main
    .locator(".command-rail")
    .getByRole("button", { name: "词典", exact: true })
    .click();
  await main.screenshot({ path: output + "/actions-dark.png" });
  await api(main, "setTheme", { theme: "light" });
  await main.waitForFunction(
    () => document.documentElement.dataset.theme === "light",
  );
  await main.screenshot({ path: output + "/actions-light.png" });
  await main.getByRole("button", { name: "定制化", exact: true }).click();
  await main.getByLabel("指令名称", { exact: true }).fill("显微镜词典");
  await main.getByRole("button", { name: "固定到工具栏", exact: true }).click();
  const chooseIcon = main.getByRole("button", { name: "选择指令图标" });
  await chooseIcon.click();
  const iconDialog = main.getByRole("dialog", { name: "选择指令图标" }),
    iconSearch = iconDialog.getByRole("textbox", { name: "搜索图标" });
  assert.equal(await iconDialog.locator(".glyph-grid button").count(), 30);
  const pickerBounds = await iconDialog.boundingBox(),
    viewHeight = await main.evaluate(() => innerHeight);
  assert.ok(
    pickerBounds.y >= 0 && pickerBounds.y + pickerBounds.height <= viewHeight,
  );
  await main.screenshot({ path: output + "/icon-picker-light.png" });
  await iconDialog
    .getByRole("button", { name: "Streamline", exact: true })
    .click();
  await iconSearch.fill("dictionary-language-book-flat");
  await iconDialog
    .getByRole("button", {
      name: "streamline-color:dictionary-language-book-flat",
      exact: true,
    })
    .click();
  await main
    .getByRole("textbox", { name: "图标 ID" })
    .fill("tabler:microscope");
  await main
    .locator('.glyph-trigger [data-icon="tabler:microscope"]')
    .waitFor();
  await main.locator('.command-rail [data-icon="tabler:microscope"]').waitFor();
  await main.locator(".autosave-state").filter({ hasText: "已保存" }).waitFor();
  await injectSelection("microscope");
  await pill.locator('.toolbar-pins [data-icon="tabler:microscope"]').waitFor();
  await pill.getByRole("button", { name: "显微镜词典", exact: true }).click();
  await panel.locator('.rf-title [data-icon="tabler:microscope"]').waitFor();
  checks.push(
    "Offline glyph library shows the 30 Read Frog favorites, searches the color collection, accepts Iconify IDs, and uses the saved icon in the list, toolbar and result",
  );
  checks.push("all eight pages, no horizontal overflow");
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/context-smoke.json",
    JSON.stringify(
      {
        version: JSON.parse(await readFile("package.json", "utf8")).version,
        date: new Date().toISOString(),
        checks,
        requests: requests.length,
        rendererErrors: errors,
        ocrText,
        scope:
          "Real Electron windows and bundled OCR. Selection events/model replies are development fixtures; native OS selection is tested separately.",
      },
      null,
      2,
    ),
  );
  console.log("Context desktop smoke passed:", checks.length, "checks.");
} catch (error) {
  console.error(error);
  for (const page of runtime.windows())
    if (page.url().includes("mode=panel"))
      await page.screenshot({ path: output + "/failure.png" }).catch(() => {});
  throw error;
} finally {
  server.close();
  server.closeAllConnections();
  await runtime.close();
}
