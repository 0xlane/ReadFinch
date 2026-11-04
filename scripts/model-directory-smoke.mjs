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
const ids = ["deepseek-v4.1-flash-1017", "my-private-vision-tts"];
let responseIds = ids;
let modelRequests = 0;
const server = createServer((req, res) => {
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
  await page.evaluate(async (endpoint) => {
    const state = await window.readfinch.call("snapshot");
    state.config.appearance.language = "zh-CN";
    state.config.selection.automatic = false;
    state.config.shortcuts = { selection: "", capture: "", clipboard: "" };
    state.config.actions.forEach((a) => (a.shortcut = ""));
    Object.assign(state.config.providers[0], {
      name: "Other account",
      endpoint,
      requiresKey: false,
      proxy: { mode: "direct", address: "" },
    });
    state.config.providers.push({
      ...state.config.providers[0],
      id: "fetched-account",
      name: "Fetched catalog",
    });
    await window.readfinch.call("saveConfig", {
      config: state.config,
      revision: state.revision,
    });
    await window.readfinch.call("settingsOpen", { tab: "text" });
  }, `http://127.0.0.1:${server.address().port}/v1`);
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
  await page.locator(".model-fetch-error").waitFor();
  page = await restartProviders();
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
