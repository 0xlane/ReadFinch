import { _electron as electron } from "playwright";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const catalog = JSON.parse(
  await readFile("src/shared/provider-catalog.json", "utf8"),
);
const packaged = process.argv.includes("--packaged");
const dataDir = path.resolve(".local/provider-parity-" + Date.now());
const out = "docs/screenshots/current";
await mkdir(out, { recursive: true });
const errors = [],
  checks = [],
  requests = [];
let mode = "models",
  app;
const server = createServer((req, res) => {
  requests.push(req.url);
  res.setHeader("Content-Type", "application/json");
  if (mode === "error") {
    res.statusCode = 503;
    return res.end('{"error":{"message":"fixture temporary failure"}}');
  }
  res.end(
    JSON.stringify({
      data:
        mode === "empty"
          ? []
          : [
              { id: "gpt-4.1-mini" },
              ...Array.from({ length: 120 }, (_, i) => ({
                id: "vendor/model-" + String(i).padStart(3, "0"),
              })),
            ],
    }),
  );
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const env = { ...process.env, READFINCH_TEST_HOOKS: "1" };
delete env.ELECTRON_RUN_AS_NODE;
async function launch() {
  app = await electron.launch({
    ...(packaged
      ? { executablePath: path.resolve("release/win-unpacked/ReadFinch.exe") }
      : {}),
    args: [...(packaged ? [] : ["."]), "--settings", "--data-dir=" + dataDir],
    env,
  });
  app.on("window", (p) => p.on("pageerror", (e) => errors.push(e.message)));
  const p = await app.firstWindow();
  p.setDefaultTimeout(12000);
  await p.locator("main h1").waitFor();
  return p;
}
let page;
const api = (method, arg) =>
  page.evaluate(({ method, arg }) => window.readfinch.call(method, arg), {
    method,
    arg,
  });
const state = () => api("snapshot");
async function saved(predicate) {
  for (let i = 0; i < 160; i++) {
    const s = await state();
    if (predicate(s.config)) return s;
    await page.waitForTimeout(50);
  }
  throw Error("Autosave did not reach expected configuration");
}
const modelField = () =>
  page.getByRole("combobox", { name: "模型", exact: true });
const customField = () =>
  page.getByRole("combobox", { name: "自定义模型 ID", exact: true });
const customToggle = () =>
  page.getByRole("checkbox", { name: "输入自定义模型 ID", exact: true });
const fetchButton = () =>
  page.getByRole("button", { name: "获取模型列表", exact: true });
async function selectFirst() {
  await page.locator(".provider-select").first().click();
}
try {
  page = await launch();
  let s = await state();
  s.config.appearance = {
    ...s.config.appearance,
    language: "zh-CN",
    theme: "light",
  };
  s.config.selection.automatic = false;
  s.config.shortcuts = { selection: "", capture: "", clipboard: "" };
  s.config.actions.forEach((a) => (a.shortcut = ""));
  await api("saveConfig", { config: s.config, revision: s.revision });
  await api("settingsOpen", { tab: "text" });
  assert.equal(await modelField().inputValue(), "gpt-6-luna");
  await page.getByRole("button", { name: "添加提供商", exact: true }).click();
  assert.equal(await page.locator("[data-provider-preset]").count(), 34);
  for (const theme of ["light", "dark"]) {
    await api("setTheme", { theme });
    await page.waitForTimeout(100);
    assert.ok(
      await page
        .getByRole("dialog")
        .locator("img")
        .evaluateAll((images) =>
          images.every((img) => img.complete && img.naturalWidth > 0),
        ),
      "Every provider mark is bundled offline",
    );
    assert.ok(
      await page
        .getByRole("dialog")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    );
    await page
      .getByRole("dialog")
      .screenshot({ path: out + "/all-providers-" + theme + ".png" });
  }
  await page.getByRole("button", { name: "关闭添加提供商" }).click();
  await api("setTheme", { theme: "light" });
  checks.push(
    "All 34 provider choices have working offline icons and no horizontal overflow in both themes",
  );
  for (const [preset, expected] of Object.entries({
    ...catalog.providers,
    mimo: { defaultModel: "mimo-v2.6-flash", customModel: false },
    deepl: null,
    deeplx: null,
    "google-translate": null,
    "microsoft-translate": null,
  })) {
    const before = (await state()).config.providers.length;
    await page.getByRole("button", { name: "添加提供商", exact: true }).click();
    await page
      .getByRole("dialog")
      .locator(`[data-provider-preset="${preset}"]`)
      .click();
    s = await saved((c) => c.providers.length === before + 1);
    const p = s.config.providers.at(-1);
    assert.equal(p.preset, preset);
    assert.equal(p.model, expected?.defaultModel ?? "");
    if (!expected) {
      assert.equal(await modelField().count(), 0);
      assert.equal(await customField().count(), 0);
      await page.locator(".provider-disclosure").click();
      assert.equal(
        await page
          .locator(".model-assignment-list")
          .getByRole("switch")
          .count(),
        1,
      );
      continue;
    }
    assert.equal(
      await (p.customModel ? customField() : modelField()).inputValue(),
      expected.defaultModel,
    );
    if (preset === "azure") {
      await page
        .getByLabel("Azure 资源名称", { exact: true })
        .fill("my-resource");
      await saved(
        (c) =>
          c.providers.at(-1).endpoint ===
          "https://my-resource.openai.azure.com/openai/v1",
      );
      await page.getByLabel("API 模式", { exact: true }).selectOption("chat");
      await saved(
        (c) => c.providers.at(-1).providerSettings.apiMode === "chat",
      );
    }
    if (preset === "bedrock") {
      await page.getByLabel("AWS 区域", { exact: true }).fill("eu-west-1");
      await saved(
        (c) =>
          c.providers.at(-1).endpoint ===
          "https://bedrock-runtime.eu-west-1.amazonaws.com",
      );
    }
  }
  checks.push(
    "Every preset adds and autosaves the upstream default model; no network request on add",
  );
  assert.deepEqual(requests, []);
  await selectFirst();
  let input = modelField();
  await input.click();
  assert.equal(
    await input.inputValue(),
    "gpt-6-luna",
    "Opening the list must not erase the current selection",
  );
  assert.equal(
    await page.locator(".model-dropdown").getByRole("option").count(),
    34,
  );
  assert.equal(
    await page
      .locator(".model-group-label")
      .filter({ hasText: "语音合成" })
      .count(),
    1,
  );
  assert.equal(
    await page
      .locator('.model-dropdown .model-capability-badge[data-kind="speech"]')
      .count(),
    3,
  );
  await page.mouse.move(1, 1);
  await page
    .locator(".provider-editor")
    .screenshot({ path: out + "/provider-default-model.png" });
  await input.fill("gpt-4.1-mini");
  await page
    .locator(".model-dropdown")
    .getByRole("option", { name: /^gpt-4.1-mini/ })
    .click();
  await saved((c) => c.providers[0].model === "gpt-4.1-mini");
  await customToggle().check();
  await customField().fill("private/deployed-model");
  await saved(
    (c) =>
      c.providers[0].model === "private/deployed-model" &&
      c.providers[0].builtinModel === "gpt-4.1-mini",
  );
  await app.close();
  page = await launch();
  await api("settingsOpen", { tab: "text" });
  assert.equal(await customField().inputValue(), "private/deployed-model");
  await customToggle().uncheck();
  await saved(
    (c) =>
      c.providers[0].model === "gpt-4.1-mini" && !c.providers[0].customModel,
  );
  assert.equal(await modelField().inputValue(), "gpt-4.1-mini");
  await modelField().click();
  await page.waitForTimeout(100);
  const selected = page
    .locator(".model-dropdown")
    .getByRole("option", { selected: true });
  assert.equal(
    await modelField().getAttribute("aria-activedescendant"),
    await selected.getAttribute("id"),
  );
  assert.ok(
    await selected.evaluate((el) => {
      const row = el.getBoundingClientRect(),
        list = el.closest('[role="listbox"]').getBoundingClientRect();
      return row.top >= list.top - 1 && row.bottom <= list.bottom + 1;
    }),
    "The current selection is scrolled into view",
  );
  await modelField().press("Escape");
  assert.equal(await modelField().inputValue(), "gpt-4.1-mini");
  checks.push(
    "The selected ID remains visible; reopening scrolls to it; custom/builtin switching survives restart",
  );

  s = await state();
  Object.assign(s.config.providers[0], {
    endpoint: "http://127.0.0.1:" + server.address().port + "/v1",
    requiresKey: false,
  });
  await api("saveConfig", { config: s.config, revision: s.revision });
  await customToggle().check();
  await saved((c) => c.providers[0].customModel);
  await fetchButton().click();
  await page
    .locator(".model-dropdown")
    .getByRole("option", { name: /^vendor\/model-119/ })
    .waitFor({ state: "attached" });
  assert.equal(
    await page.locator(".model-dropdown").getByRole("option").count(),
    121,
  );
  assert.ok(requests.length);
  const anchor = await page.locator(".model-anchor").boundingBox(),
    popup = await page.locator(".model-dropdown").boundingBox();
  assert.ok(
    Math.abs(anchor.x - popup.x) < 2 &&
      Math.abs(anchor.width - popup.width) < 3,
    "Dropdown remains anchored to its input",
  );
  assert.equal(await page.getByRole("dialog").count(), 0);
  for (const theme of ["light", "dark"]) {
    await api("setTheme", { theme });
    await page.mouse.move(1, 1);
    await page.waitForTimeout(120);
    await page
      .locator(".provider-editor")
      .screenshot({ path: out + "/provider-models-" + theme + ".png" });
  }
  await customField().fill("vendor/model-119");
  await page
    .locator(".model-dropdown")
    .getByRole("option", { name: /^vendor\/model-119/ })
    .click();
  await saved(
    (c) =>
      c.providers[0].model === "vendor/model-119" &&
      !c.providers[0].customModel,
  );
  checks.push(
    "Discovery replaces built-in choices with all 121 remote models; selecting one turns custom input off",
  );

  mode = "error";
  await fetchButton().click();
  await page.getByRole("alert", { name: "获取模型列表失败" }).waitFor();
  assert.equal((await state()).config.providers[0].model, "vendor/model-119");
  mode = "empty";
  await fetchButton().click();
  await page
    .getByText("接口未返回模型，可直接输入自定义 ID。", { exact: true })
    .waitFor();
  assert.equal((await state()).config.providers[0].model, "vendor/model-119");
  mode = "models";
  await fetchButton().click();
  await page
    .locator(".model-dropdown")
    .getByRole("option", { name: /^vendor\/model-119/ })
    .waitFor({ state: "attached" });
  await modelField().press("Escape");
  checks.push(
    "Discovery errors and empty responses preserve the current model and allow retry",
  );

  await page.getByRole("button", { name: "添加提供商", exact: true }).click();
  await page
    .getByRole("dialog")
    .locator('[data-provider-preset="custom"]')
    .click();
  await saved((c) => c.providers.at(-1).preset === "custom");
  assert.equal(await customField().inputValue(), "");
  assert.equal(await customToggle().count(), 1);
  assert.equal(await customToggle().isChecked(), true);
  await customField().fill("my-private-model");
  await saved((c) => c.providers.at(-1).model === "my-private-model");
  assert.ok(
    await page
      .locator("main")
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  );
  checks.push(
    "Custom endpoints accept an explicit ID and allow switching to a discovered model",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    packaged
      ? "docs/packaged-provider-parity.json"
      : "docs/provider-parity-verification.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        version: (await state()).version,
        referenceCommit: catalog.commit,
        upstreamTextModels: Object.values(catalog.providers).reduce(
          (n, p) => n + p.models.length,
          0,
        ),
        checks,
        rendererErrors: errors,
        scope:
          "Isolated Electron windows and local HTTP fixtures; no real provider credentials or external model calls.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(checks.join("\n"));
} finally {
  if (app) await app.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
