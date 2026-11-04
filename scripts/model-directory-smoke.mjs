import { _electron as electron } from "playwright";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import path from "node:path";
const packaged = process.argv.includes("--packaged");
const executable =
  process.argv.slice(2).find((arg) => !arg.startsWith("--")) ??
  "release/win-unpacked/ReadFinch.exe";
const dir = path.resolve(".local/model-info-" + Date.now());
await mkdir(dir, { recursive: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const ids = [
  "relay/deepseek-ai/DeepSeek-V4.1-Flash-1017:free",
  "my-private-vision-tts",
];
let responseIds = ids;
let modelRequests = 0;
let probeStatus = 401;
const probes = [];
const server = createServer(async (req, res) => {
  assert.equal(req.headers.authorization, undefined);
  if (req.url === "/v1/chat/completions") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    probes.push({ body: JSON.parse(raw), headers: req.headers });
    res.writeHead(probeStatus, { "Content-Type": "application/json" });
    return res.end(
      JSON.stringify(
        probeStatus === 200
          ? { choices: [{ message: { content: "Hi" } }] }
          : { error: { message: "private-provider-detail" } },
      ),
    );
  }
  if (req.url !== "/v1/models") {
    res.writeHead(404).end();
    return;
  }
  modelRequests++;
  if (!responseIds) return res.writeHead(503).end();
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ data: responseIds.map((id) => ({ id })) }));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let app;
const errors = [];
async function launch() {
  app = await electron.launch({
    ...(packaged ? { executablePath: path.resolve(executable) } : {}),
    args: [...(packaged ? [] : ["."]), "--settings", "--data-dir=" + dir],
    env,
  });
  const page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.locator("main h1").waitFor();
  return page;
}
async function restartProviders() {
  await app.close();
  const page = await launch();
  await page.evaluate(() =>
    window.readfinch.call("settingsOpen", { tab: "text" }),
  );
  await page
    .locator('.provider-select[aria-current="true"]')
    .filter({ hasText: "Fetched catalog" })
    .waitFor({ timeout: 5000 });
  await page.getByRole("button", { name: "展开模型列表", exact: true }).click();
  return page;
}
const modelList = (page) => page.getByRole("listbox", { name: "模型候选" });
try {
  let page = await launch();
  await page.evaluate(
    async ({ endpoint, model }) => {
      const state = await window.readfinch.call("snapshot");
      state.config.appearance.language = "zh-CN";
      state.config.selection.automatic = false;
      state.config.shortcuts = { input: "", selection: "", capture: "", clipboard: "" };
      state.config.actions.forEach((a) => (a.shortcut = ""));
      Object.assign(state.config.providers[0], {
        name: "Other account",
        endpoint,
        model,
        requiresKey: true,
        proxy: { mode: "direct", address: "" },
      });
      state.config.providers.push({
        ...state.config.providers[0],
        id: "fetched-account",
        name: "Fetched catalog",
        model: "gpt-4.1-mini",
      });
      await window.readfinch.call("saveConfig", {
        config: state.config,
        revision: state.revision,
      });
      await window.readfinch.call("settingsOpen", { tab: "text" });
    },
    { endpoint: `http://127.0.0.1:${server.address().port}/v1`, model: ids[0] },
  );
  await page
    .getByRole("button", { name: "Fetched catalog", exact: true })
    .click();
  await page.getByRole("button", { name: "获取模型列表", exact: true }).click();
  const options = modelList(page).getByRole("option");
  await options.filter({ hasText: ids[0] }).waitFor();
  assert.equal(await options.count(), ids.length);
  await options.filter({ hasText: ids[0] }).click();
  const saveDeadline = Date.now() + 5000;
  for (;;) {
    const config = JSON.parse(
      await readFile(path.join(dir, "config.json"), "utf8"),
    );
    if (
      config.providers.find((p) => p.id === "fetched-account").model === ids[0]
    )
      break;
    assert.ok(Date.now() < saveDeadline, "Selected model did not autosave");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  responseIds = null;
  page = await restartProviders();
  const restored = modelList(page).getByRole("option");
  await restored.filter({ hasText: ids[1] }).waitFor({ timeout: 5000 });
  assert.deepEqual(
    await restored.locator(":scope > span:first-child").allTextContents(),
    ids,
  );
  assert.equal(modelRequests, 1);
  await page
    .getByRole("button", { name: "Other account", exact: true })
    .click();
  await page.getByRole("button", { name: "展开模型列表", exact: true }).click();
  await modelList(page)
    .getByRole("option")
    .filter({ hasText: "gpt-" })
    .first()
    .waitFor();
  assert.equal(
    await modelList(page)
      .getByRole("option")
      .filter({ hasText: ids[1] })
      .count(),
    0,
  );
  await page
    .getByRole("button", { name: "Fetched catalog", exact: true })
    .click();
  const model = page.getByRole("combobox", { name: "模型", exact: true });
  assert.equal(await model.inputValue(), ids[0]);
  await model.press("Escape");
  const custom = page.getByRole("checkbox", { name: "输入自定义模型 ID" });
  const input = page.getByRole("combobox", {
    name: "自定义模型 ID",
    exact: true,
  });
  const info = page.locator(".model-capability-line");
  const caps = page.getByRole("combobox", { name: "模型能力", exact: true });
  assert.equal(await custom.isChecked(), false);
  await info.getByText("DeepSeek V4.1 Flash 1017", { exact: true }).waitFor();
  assert.match(await info.innerText(), /文本与图片/);
  assert.match(await info.innerText(), /1M/);
  assert.equal(await caps.isVisible(), false);
  assert.equal(
    await page.locator(".provider-list .model-capability-badge").count(),
    0,
  );
  await info.scrollIntoViewIfNeeded();
  await page.getByRole("combobox", { name: "模型", exact: true }).blur();
  await page
    .locator(".model-input-field")
    .screenshot({ path: path.join(dir, "model-field.png") });
  await page.screenshot({ path: path.join(dir, "model-info.png") });
  await page.locator(".provider-advanced summary").click();
  const providerOptions = page.getByRole("textbox", {
    name: "提供商选项",
    exact: true,
  });
  const headers = page.getByRole("textbox", {
    name: "自定义请求头",
    exact: true,
  });
  await page
    .getByRole("spinbutton", { name: "温度", exact: true })
    .fill("0.35");
  await providerOptions.fill('{"reasoningEffort":"low","seed":42}');
  await providerOptions.blur();
  await headers.fill('{"X-Fixture":"desktop"}');
  await headers.blur();
  await providerOptions.fill('{"seed":');
  await page
    .getByRole("alert")
    .filter({ hasText: "请输入有效的 JSON 对象" })
    .waitFor();
  const probeButton = (name) => page.getByRole("button", { name, exact: true });
  await probeButton("测试连接").click();
  const failure = page.getByRole("alert", { name: "连接失败" });
  await failure.waitFor();
  await page.mouse.move(0, 0);
  assert.match(await failure.innerText(), /HTTP 401.*API Key/);
  assert.doesNotMatch(await failure.innerText(), /private-provider-detail/);
  assert.equal(probes.length, 1);
  assert.equal(probes[0].headers["x-fixture"], "desktop");
  assert.equal(probes[0].body.temperature, 0.35);
  assert.equal(probes[0].body.seed, 42);
  assert.equal(probes[0].body.reasoning_effort, "low");
  assert.equal(probes[0].body.model, ids[0]);
  assert.equal(await failure.getByRole("button").count(), 1);
  const keyPosition = await page.locator("#provider-key").boundingBox();
  await failure.hover();
  await page.screenshot({ path: path.join(dir, "connection-notice.png") });
  await new Promise((resolve) => setTimeout(resolve, 5100));
  assert.ok(await failure.isVisible());
  await failure.getByRole("button", { name: "关闭通知" }).click();
  await failure.waitFor({ state: "detached" });
  assert.deepEqual(
    await page.locator("#provider-key").boundingBox(),
    keyPosition,
  );
  assert.equal(await probeButton("测试连接").getAttribute("title"), null);
  assert.equal(probes.length, 1);
  await probeButton("测试连接").click();
  await failure.waitFor();
  await page.mouse.move(0, 0);
  await failure.waitFor({ state: "detached", timeout: 7000 });
  assert.equal(probes.length, 2);
  probeStatus = 200;
  await probeButton("测试连接").click();
  await probeButton("成功").waitFor();
  assert.equal(await failure.count(), 0);
  await page.locator(".provider-advanced summary").click();
  await page.locator(".provider-advanced summary").click();
  assert.deepEqual(JSON.parse(await providerOptions.innerText()), {
    reasoningEffort: "low",
    seed: 42,
  });
  await page
    .locator(".provider-temperature")
    .evaluate((e) => e.scrollIntoView({ block: "start" }));
  await page.screenshot({ path: path.join(dir, "advanced-light.png") });
  await page.evaluate(() =>
    window.readfinch.call("setTheme", { theme: "dark" }),
  );
  await page.locator('html[data-theme="dark"]').waitFor();
  await page.screenshot({ path: path.join(dir, "advanced-dark.png") });
  await page.evaluate(() =>
    window.readfinch.call("setTheme", { theme: "light" }),
  );
  await page.locator(".provider-advanced summary").click();
  const openedPanel =
    app.windows().find((win) => win.url().includes("mode=panel")) ??
    app.waitForEvent("window");
  await page.evaluate(() =>
    window.readfinch.call("panelOpen", {
      source: "action-test",
      actionId: "translate",
    }),
  );
  const panel = await openedPanel;
  const selector = panel.getByRole("combobox", {
    name: "文字提供商",
    exact: true,
  });
  await selector.waitFor();
  assert.deepEqual(await selector.locator("option").allTextContents(), [
    "Other account",
    "Fetched catalog",
  ]);
  assert.equal(await selector.getAttribute("title"), "Other account");
  await panel.screenshot({ path: path.join(dir, "panel-providers.png") });
  await panel.getByRole("button", { name: "收起浮窗", exact: true }).click();
  await custom.check();
  await input.fill("my-private-vision-tts");
  assert.equal(await info.innerText(), "文本");
  await page.locator(".provider-advanced summary").click();
  await caps.selectOption("vision");
  assert.match(await info.innerText(), /文本与图片/);
  await input.fill("tts-1");
  await info.getByText("语音合成", { exact: true }).waitFor();
  await page.getByLabel("语音接口", { exact: true }).waitFor();
  await input.fill("tts-1-private");
  assert.equal(await info.innerText(), "文本");
  assert.equal(await caps.inputValue(), "auto");
  const cached = await page.evaluate(
    async () =>
      (await window.readfinch.call("modelDirectory", { refresh: true }))
        .modelsDev.length,
  );
  assert.ok(cached > 0);
  if (process.argv.includes("--live")) {
    for (const key of ["modelsDev", "openRouter"]) {
      const file = JSON.parse(
        await readFile(
          path.join(dir, "model-directory", key + ".json"),
          "utf8",
        ),
      );
      assert.ok(file.entries.length > 10);
      console.log(key + ": " + file.entries.length + " live records");
    }
  }
  await page.getByRole("button", { name: "获取模型列表", exact: true }).click();
  await page.getByRole("alert", { name: "获取模型列表失败" }).waitFor();
  page = await restartProviders();
  const savedOptions = await page.evaluate(
    async () =>
      (await window.readfinch.call("snapshot")).config.providers.find(
        (p) => p.id === "fetched-account",
      ).providerOptions,
  );
  assert.deepEqual(savedOptions, { reasoningEffort: "low", seed: 42 });
  await modelList(page)
    .getByRole("option")
    .filter({ hasText: ids[1] })
    .waitFor();
  assert.equal(await modelList(page).getByRole("option").count(), ids.length);
  responseIds = [];
  await page.getByRole("button", { name: "获取模型列表", exact: true }).click();
  await page.locator(".model-fetch-note[role=status]").waitFor();
  const requestsBeforeRestart = modelRequests;
  page = await restartProviders();
  await modelList(page)
    .getByText("没有匹配的模型，可直接输入自定义 ID。")
    .waitFor();
  assert.equal(await modelList(page).getByRole("option").count(), 0);
  assert.equal(modelRequests, requestsBeforeRestart);
  assert.deepEqual(errors, []);
  console.log(
    "Model metadata, provider isolation, offline restart, failed refresh and persisted empty list passed: " +
      dir,
  );
} finally {
  await app?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
