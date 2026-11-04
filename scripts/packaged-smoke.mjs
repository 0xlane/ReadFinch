import { _electron as electron } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const isolated = process.argv.includes("--isolated-shortcuts");
const executable = path.resolve(
  process.argv.slice(2).find((arg) => !arg.startsWith("--")) ??
    "release/win-unpacked/ReadFinch.exe",
);
const dataDir = path.resolve(".local/packaged-smoke-" + Date.now());
await mkdir(dataDir, { recursive: true });
// A packaged application must ignore even an explicitly supplied test-hook flag.
const env = { ...process.env, READFINCH_TEST_HOOKS: "1" };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  executablePath: executable,
  args: [`--data-dir=${dataDir}`],
  env,
});
const errors = [];
try {
  const page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.evaluate(async () => {
    const s = await window.readfinch.call("snapshot");
    if (s.interfaceLocale !== "zh-CN") {
      s.config.appearance.language = "zh-CN";
      await window.readfinch.call("saveConfig", {
        config: s.config,
        revision: s.revision,
      });
    }
  });
  await page
    .getByRole("heading", { name: "通用", exact: true })
    .waitFor({ timeout: 30000 });
  const original = await page.evaluate(() => window.readfinch.call("snapshot"));
  assert.equal(
    original.config.actions.find((a) => a.id === "translate").shortcut,
    "Alt+T",
  );
  if (isolated)
    await page.evaluate(async () => {
      const state = await window.readfinch.call("snapshot");
      state.config.shortcuts = {
        selection: "Control+Alt+Shift+F8",
        capture: "Control+Alt+Shift+F11",
        clipboard: "Control+Alt+Shift+F12",
      };
      [
        "Control+Alt+Shift+F5",
        "Control+Alt+Shift+F6",
        "Control+Alt+Shift+F7",
      ].forEach((key, index) => {
        state.config.actions.find(
          (a) => a.id === ["translate", "dictionary", "polish"][index],
        ).shortcut = key;
      });
      await window.readfinch.call("saveConfig", {
        config: state.config,
        revision: state.revision,
      });
    });
  const state = await page.evaluate(() => window.readfinch.call("snapshot"));
  assert.equal(state.config.schemaVersion, 15);
  assert.equal(state.config.noteSuggestion.enabled, true);
  assert.deepEqual(state.shortcutErrors, []);
  assert.equal(
    state.config.actions.find((action) => action.id === "translate").shortcut,
    isolated ? "Control+Alt+Shift+F5" : "Alt+T",
  );
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "快捷键", exact: true })
    .click();
  assert.equal(
    await page
      .getByLabel("翻译快捷键", { exact: true })
      .getAttribute("readonly"),
    "",
  );
  assert.equal(
    await page
      .getByRole("navigation", { name: "设置分类" })
      .getByRole("button")
      .count(),
    7,
  );
  assert.equal(state.config.defaults.ocrProfileId, "ocr-offline");
  assert.equal(state.config.providers.length, 1);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "截图识别", exact: true })
    .click();
  assert.equal(
    await page.getByRole("button", { name: /下载语言包|从本地导入/ }).count(),
    0,
  );
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "API 提供商", exact: true })
    .click();
  await page.getByRole("button", { name: "添加提供商", exact: true }).click();
  assert.equal(await page.locator(".provider-catalog > button").count(), 34);
  await page.getByRole("button", { name: /Xiaomi MiMo/ }).waitFor();
  await page
    .getByRole("button", { name: "关闭添加提供商", exact: true })
    .click();
  const modelInput = page.getByRole("combobox", { name: "模型", exact: true });
  await modelInput.fill("gpt-4.1");
  await page.getByRole("option", { name: /gpt-4.1-mini/ }).click();
  await page.getByRole("button", { name: /功能提供商/ }).click();
  await page
    .getByRole("switch", { name: "将 gpt-4.1-mini 用于 翻译", exact: true })
    .check();
  await page.waitForFunction(async () => {
    const { config } = await window.readfinch.call("snapshot");
    const translation = config.actions.find((a) => a.id === "translate");
    return config.providers.some(
      (p) => p.id === translation.providerId && p.model === "gpt-4.1-mini",
    );
  });
  assert.equal(
    (await page.evaluate(() => window.readfinch.call("snapshot"))).config
      .defaults.ocrProfileId,
    "ocr-offline",
  );
  const library = await page.evaluate(() =>
    window.readfinch.call("notesList", { offset: 0, search: "", notebook: "" }),
  );
  assert.equal(library.total, 0);
  const glyph = await page.evaluate(async () => {
    const i = new Image();
    i.src = "./command-icons/streamline-color-0.svg";
    await i.decode();
    return i.naturalWidth;
  });
  assert.equal(glyph, 384);
  assert.ok(state.ocrReady, "The packaged app must include both OCR languages");
  const dataUrl =
    "data:image/png;base64," +
    (await readFile("tests/fixtures/bilingual-light.png")).toString("base64");
  const started = Date.now();
  const recognized = await page.evaluate(async (image) => {
    const s = await window.readfinch.call("snapshot");
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      let text = "";
      let confidence;
      const timeout = setTimeout(() => {
        off();
        reject(Error("Packaged OCR timed out"));
      }, 60000);
      const off = window.readfinch.on("job", (event) => {
        if (event.id !== id) return;
        if (event.text !== undefined) text = event.text;
        if (event.confidence !== undefined) confidence = event.confidence;
        if (["done", "error", "cancelled"].includes(event.status)) {
          clearTimeout(timeout);
          off();
          if (event.status === "done") resolve({ text, confidence });
          else reject(Error(event.message ?? event.status));
        }
      });
      window.readfinch
        .call("recognize", {
          id,
          profileId: s.config.defaults.ocrProfileId,
          dataUrl: image,
        })
        .catch((error) => {
          clearTimeout(timeout);
          off();
          reject(error);
        });
    });
  }, dataUrl);
  assert.match(recognized.text, /Small steps/);
  assert.match(recognized.text, /你好/);
  assert.deepEqual(errors, []);
  const packageState = await app.evaluate(
    ({ app, globalShortcut }, keys) => ({
      packaged: app.isPackaged,
      name: app.getName(),
      version: app.getVersion(),
      resources: process.resourcesPath,
      developmentSelectionHook:
        typeof globalThis.__readfinchTest !== "undefined",
      actionShortcutsRegistered: keys.every((key) =>
        globalShortcut.isRegistered(key),
      ),
    }),
    state.config.actions.map((a) => a.shortcut).filter(Boolean),
  );
  assert.equal(packageState.packaged, true);
  assert.equal(packageState.name, "ReadFinch");
  assert.equal(packageState.developmentSelectionHook, false);
  assert.equal(packageState.actionShortcutsRegistered, true);
  assert.equal(
    packageState.version,
    JSON.parse(await readFile("package.json", "utf8")).version,
    "Packaged version is stale",
  );
  assert.equal(
    await page.locator(".app-version").innerText(),
    "伴读雀 " + packageState.version,
  );
  assert.ok(
    await page
      .locator(".brand-mark")
      .evaluate((image) => image.getBoundingClientRect().width > 0),
  );
  const nativeIcons = await app.evaluate(({ app, nativeImage }) => {
    const base = app.getAppPath() + "/dist/renderer/brand/";
    return ["tray.ico", "tray-paused.ico", "trayTemplate.png"].map((file) => ({
      file,
      empty: nativeImage.createFromPath(base + file).isEmpty(),
    }));
  });
  assert.ok(
    nativeIcons.every((icon) => !icon.empty),
    "Packaged native icon could not be decoded",
  );
  const referenceIcons = await page.evaluate(async () => {
    return Promise.all(
      [
        "streamline-dictionary-language-book-flat",
        "streamline-ai-edit-spark-flat",
        "ri-translate",
        "tabler-pin",
        "tabler-refresh",
      ].map(async (name) => {
        const image = new Image();
        image.src = `./reference-icons/${name}.svg`;
        try {
          await image.decode();
          return { name, loaded: image.naturalWidth > 0 };
        } catch {
          return { name, loaded: false };
        }
      }),
    );
  });
  assert.ok(
    referenceIcons.every((icon) => icon.loaded),
    "Read Frog reference icons must be bundled locally",
  );
  const report = {
    date: new Date().toISOString(),
    platform: process.platform,
    executable: path.basename(executable),
    ...packageState,
    resources: path.relative(path.dirname(executable), packageState.resources),
    isolatedShortcuts: isolated,
    providerModelAndPurposeAssignment: true,
    offlineCommandIconSheets: true,
    localNoteLibrary: true,
    ocrReady: state.ocrReady,
    nativeStatus: state.nativeStatus,
    ocrMilliseconds: Date.now() - started,
    text: recognized.text,
    confidence: recognized.confidence,
    rendererErrors: errors,
    nativeIcons,
    referenceIcons,
    note: "Packaged startup and real bundled OCR; not foreground selection or screen-capture acceptance.",
  };
  await writeFile("docs/packaged-smoke.json", JSON.stringify(report, null, 2));
  console.log(
    "Packaged app passed: startup, inline model selection and purpose assignment, action shortcuts, local SQLite notes, offline icon resources, bundled bilingual OCR and renderer.",
  );
} finally {
  await app.close();
}
