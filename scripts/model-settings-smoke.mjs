import { _electron as electron } from "playwright";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const output = "docs/screenshots/v0.12.1",
  dataDir = path.resolve(".local/models-" + Date.now());
await mkdir(output, { recursive: true });
await mkdir(dataDir, { recursive: true });
const requests = [],
  errors = [],
  checks = [];
const check = (text) => {
  checks.push(text);
  console.log(text);
};

const server = createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  requests.push({
    url: req.url,
    auth: req.headers.authorization,
    project: req.headers["x-project"],
    body,
  });
  res.setHeader("Content-Type", "application/json");
  if (req.url.endsWith("/models")) {
    res.end(
      JSON.stringify({
        data: [
          { id: "gpt-4.1-mini" },
          { id: "vendor/custom-text" },
          { id: "vendor/discovered-unused" },
        ],
      }),
    );
    return;
  }
  const image = Array.isArray(body.messages?.[0]?.content);
  res.end(
    JSON.stringify({
      choices: [
        {
          message: {
            content: body.messages?.[0]?.content?.includes?.("BCP 47")
              ? "fr"
              : image
                ? "ReadFinch OCR 123\n你好，世界！"
                : body.response_format?.json_schema
                  ? JSON.stringify(
                      Object.fromEntries(
                        body.response_format.json_schema.schema.required.map(
                          (name) => [name, null],
                        ),
                      ),
                    )
                  : "模型连接测试成功。",
          },
        },
      ],
    }),
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const env = { ...process.env, TEXTHOP_TEST_HOOKS: "1" };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  args: [".", `--data-dir=${dataDir}`],
  env,
});
app.on("window", (p) =>
  p.on("pageerror", (error) => errors.push(error.message)),
);
const page = await app.firstWindow();
page.setDefaultTimeout(15000);
const call = (method, arg) =>
  page.evaluate(({ method, arg }) => window.texthop.call(method, arg), {
    method,
    arg,
  });
const snapshot = () => call("snapshot");
const nav = (name) =>
  page
    .getByRole("navigation", { name: "设置分类" })
    .getByRole("button", { name, exact: true })
    .click();
async function until(predicate, label) {
  for (let i = 0; i < 150; i++) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Timed out: " + label);
}
async function job(method, arg) {
  return page.evaluate(
    ({ method, arg }) =>
      new Promise((resolve, reject) => {
        const id = crypto.randomUUID();
        const timer = setTimeout(() => {
          off();
          reject(Error("Job timed out"));
        }, 20000);
        const off = window.texthop.on("job", (e) => {
          if (e.id !== id || !["done", "error", "cancelled"].includes(e.status))
            return;
          clearTimeout(timer);
          off();
          e.status === "done"
            ? resolve()
            : reject(Error(e.message ?? e.status));
        });
        window.texthop.call(method, { ...arg, id }).catch((e) => {
          clearTimeout(timer);
          off();
          reject(e);
        });
      }),
    { method, arg },
  );
}

async function shots(name, locator) {
  for (const theme of ["light", "dark"]) {
    await call("setTheme", { theme });
    await page.waitForFunction(
      (v) => document.documentElement.dataset.theme === v,
      theme,
    );
    if (locator)
      await locator.evaluate((el) => el.scrollIntoView({ block: "start" }));
    else await page.locator("main").evaluate((el) => (el.scrollTop = 0));
    await page
      .locator(".autosave-state")
      .filter({ hasText: "已保存" })
      .waitFor();
    await page.screenshot({ path: output + "/" + name + "-" + theme + ".png" });
  }
}
async function choose(model) {
  if (model === "vendor/vision") {
    await page.getByRole("checkbox", { name: "输入自定义模型 ID" }).check();
    await page.getByLabel("自定义模型 ID", { exact: true }).fill(model);
  } else {
    const input = page.getByRole("combobox", { name: "模型", exact: true });
    await input.fill(model);
    await input.press("Enter");
  }
  await until(
    async () =>
      (await snapshot()).config.providers.some((p) => p.model === model),
    "provider model " + model,
  );
}
const cfg = async () => (await snapshot()).config;
const field = (label) => page.getByLabel(label, { exact: true });
const button = (name) => page.getByRole("button", { name, exact: true });
try {
  await page.waitForFunction(() => document.querySelector("main h1"));
  const initial = await snapshot();
  assert.equal(initial.config.appearance.language, "system");
  const selector = page
    .locator("select")
    .filter({ has: page.locator('option[value="zh-CN"]') });
  await selector.selectOption("en");
  await page.getByRole("heading", { name: "General", exact: true }).waitFor();
  await page.getByRole("button", { name: "Shortcuts", exact: true }).click();
  await page.getByLabel("Translate shortcut", { exact: true }).waitFor();
  await page.getByRole("button", { name: "General", exact: true }).click();
  await selector.selectOption("zh-CN");
  await page.getByRole("heading", { name: "通用", exact: true }).waitFor();
  assert.equal(await field("翻译快捷键").count(), 0);
  await nav("快捷键");
  await field("翻译快捷键").waitFor();
  await shots("shortcuts");
  check(
    "System-default language, live English and Chinese, and dedicated shortcuts for all actions",
  );
  await nav("API 提供商");
  await button("添加提供商").click();
  await page.getByRole("dialog").waitFor();
  assert.equal(await page.locator(".provider-catalog button").count(), 7);
  await shots("catalog");
  await button("关闭添加提供商").click();
  await field("API 基础地址").fill(base + "/v1");
  await field("text:text-default API Key").fill("fixture-local-key");
  await choose("gpt-4.1-mini");
  await page.locator("summary").filter({ hasText: "高级选项" }).click();

  await page.getByRole("spinbutton", { name: /温度/ }).fill("0.35");
  await field("推理强度").selectOption("xhigh");
  const headers = page.getByRole("textbox", { name: /自定义请求头/ });
  await headers.fill('{"X-Project":"local-fixture"}');
  await headers.blur();
  await until(
    async () => (await cfg()).providers[0].temperature === 0.35,
    "temperature saved",
  );
  await button("测试连接").click();
  await until(
    () => requests.some((r) => r.body.model === "gpt-4.1-mini"),
    "connection test",
  );
  assert.equal(requests.at(-1).project, "local-fixture");
  assert.equal(requests.at(-1).body.temperature, 0.35);
  assert.equal(requests.at(-1).body.reasoning_effort, "xhigh");
  assert.match(requests.at(-1).auth, /fixture-local-key/);
  await headers.fill("invalid");
  await page.getByRole("alert").filter({ hasText: "JSON" }).waitFor();
  await headers.fill('{"X-Project":"local-fixture"}');
  await headers.blur();
  await shots("advanced-options", page.locator(".provider-advanced"));
  await page.locator("summary").filter({ hasText: "高级选项" }).click();
  await button("复制").click();
  await until(async () => (await cfg()).providers.length === 2, "duplicate");
  const copy = (await cfg()).providers[1];
  assert.equal(copy.reasoningEffort, "xhigh");
  await field("名称").fill(
    "OpenAI · long-account / gpt-4.1-mini duplicate with a deliberately long name",
  );
  assert.ok(
    await page
      .locator(".provider-list")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
    "the provider rail must never scroll sideways",
  );
  await field("名称").fill("词典与识别");
  await choose("vendor/vision");
  await page.getByRole("button", { name: /功能提供商/ }).click();
  await page
    .getByRole("switch", { name: "将 vendor/vision 用于 词典", exact: true })
    .check();
  await until(
    async () =>
      (await cfg()).actions.find((a) => a.id === "dictionary").providerId ===
      copy.id,
    "dictionary assignment",
  );
  assert.equal(await field("词典的提供商").inputValue(), copy.id);
  await field("截图识别（OCR）的提供商").selectOption(copy.id);
  await page.getByRole("radio", { name: "LLM", exact: true }).check();
  await field("语言检测的提供商").selectOption(copy.id);
  await until(
    async () => (await cfg()).languageDetection.providerId === copy.id,
    "detector assignment",
  );
  await field("词典的提供商").selectOption("");
  await until(
    async () =>
      !(await cfg()).actions.find((a) => a.id === "dictionary").providerId,
    "inherit",
  );
  assert.equal(
    await page
      .getByRole("switch", { name: "将 vendor/vision 用于 词典", exact: true })
      .isChecked(),
    false,
  );
  await field("词典的提供商").selectOption(copy.id);
  await until(
    async () =>
      (await cfg()).actions.find((a) => a.id === "dictionary").providerId ===
      copy.id,
    "reassigned dictionary",
  );
  await shots("features", page.locator("#feature-providers"));
  await shots("language-detection", page.locator("#language-detection"));
  await shots("providers");
  check(
    "One model per provider, duplicate credentials and settings, and bidirectional feature assignments",
  );
  const detected = "Ce passage est un exemple. ".repeat(45);
  await job("runAction", {
    actionId: "translate",
    text: detected,
    context: "",
    sourceLanguage: "auto",
    targetLanguage: "English",
  });
  const detection = requests.findLast((r) =>
    r.body.messages?.[0]?.content?.includes?.("BCP 47"),
  );
  assert.equal(detection.body.model, "vendor/vision");
  assert.equal(detection.body.messages[1].content.length, 500);
  assert.equal(detection.project, "local-fixture");
  assert.equal(requests.at(-1).body.model, "gpt-4.1-mini");
  assert.match(requests.at(-1).body.messages[1].content, /Source language: fr/);
  await job("runAction", {
    actionId: "dictionary",
    text: "word",
    context: "",
    sourceLanguage: "en",
    targetLanguage: "Chinese",
  });
  assert.equal(requests.at(-1).body.model, "vendor/vision");
  assert.match(requests.at(-1).auth, /fixture-local-key/);
  await nav("截图识别");
  assert.equal(await field("OCR 提供商").inputValue(), copy.id);
  assert.equal(
    await page.getByRole("button", { name: "模型", exact: true }).count(),
    0,
  );
  await shots("ocr-provider");
  await button("用样例图片测试").click();
  await page.getByText("中英文均已识别").waitFor();
  assert.equal(requests.at(-1).body.model, "vendor/vision");
  assert.equal(requests.at(-1).project, "local-fixture");
  assert.equal(requests.at(-1).body.reasoning_effort, "xhigh");
  assert.ok(Array.isArray(requests.at(-1).body.messages[0].content));
  await field("OCR 提供商").selectOption("");
  await until(
    async () => (await cfg()).defaults.ocrProfileId === "ocr-offline",
    "restore offline",
  );
  await shots("ocr-offline");
  assert.doesNotMatch(
    await readFile(path.join(dataDir, "config.json"), "utf8"),
    /fixture-local-key|local-fixture|visionModel|"models"/,
  );
  check(
    "Real text, detection and image HTTP requests use each provider's model, scoped key, headers and temperature",
  );
  await nav("API 提供商");
  const search = page.getByRole("combobox", { name: "模型", exact: true });
  await search.click();
  await search.fill("gpt-4");
  const anchor = await search.boundingBox(),
    popup = await page.locator(".model-dropdown").boundingBox();
  assert.ok(
    Math.abs(anchor.x - popup.x) < 2 &&
      Math.abs(anchor.width - popup.width) < 2,
  );
  assert.ok(
    Math.min(
      Math.abs(popup.y - anchor.y - anchor.height),
      Math.abs(anchor.y - popup.y - popup.height),
    ) < 7,
    "model list is attached to its field",
  );
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.ok((await page.getByRole("option").count()) > 0);
  await button("获取模型列表").click();
  await until(
    () => requests.some((r) => r.url.endsWith("/models")),
    "model discovery",
  );
  assert.equal(requests.at(-1).project, "local-fixture");
  await search.fill("vendor");
  await page
    .locator(".model-input-field")
    .evaluate((el) => el.scrollIntoView({ block: "center" }));
  for (const theme of ["light", "dark"]) {
    await call("setTheme", { theme });
    await page.waitForFunction(
      (v) => document.documentElement.dataset.theme === v,
      theme,
    );
    await page.locator(".model-dropdown").waitFor();
    await page.screenshot({ path: output + "/model-search-" + theme + ".png" });
  }
  await search.press("Escape");
  await nav("通用");
  await selector.selectOption("en");
  await page.getByRole("heading", { name: "General", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "API Providers", exact: true })
    .click();
  await page.getByRole("heading", { name: "Language Detection" }).waitFor();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes("mode=main"))
      .setSize(760, 700),
  );
  assert.equal(
    await page
      .locator("main")
      .evaluate((el) => el.scrollWidth > el.clientWidth),
    false,
  );
  await page.locator("main").evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({ path: output + "/providers-english-narrow.png" });
  await page
    .getByRole("button", { name: "Screenshot OCR", exact: true })
    .click();
  await page.getByLabel("OCR provider", { exact: true }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: "General", exact: true }).waitFor();
  assert.equal((await cfg()).appearance.language, "en");
  check(
    "Model search and discovery, export-safe credentials, and language persistence",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/settings-verification.json",
    JSON.stringify(
      {
        version: initial.version,
        checks,
        scope:
          "Isolated Electron profile, real renderer and loopback Chat Completions fixture",
      },
      null,
      2,
    ),
  );
} finally {
  await app.close();
  await new Promise((r) => server.close(r));
}
