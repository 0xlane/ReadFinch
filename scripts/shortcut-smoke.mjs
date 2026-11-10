import { _electron as electron } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import assert from "node:assert/strict";

const isolated = process.argv.includes("--isolated-shortcuts");
const verifyOnly = process.argv.includes("--verify-only");
const output = verifyOnly
  ? path.resolve(".local/shortcut-verification-" + Date.now())
  : "docs/screenshots/current";
await mkdir(output, { recursive: true });
const checks = [],
  errors = [],
  requests = [];
const check = (message) => {
  checks.push(message);
  console.log(message);
};
const server = createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const input = JSON.parse(raw || "{}");
  requests.push(input);
  const prompt = String(input.messages?.[0]?.content || "");
  const result = input.response_format?.json_schema?.schema?.required?.includes(
    "释义",
  )
    ? JSON.stringify({
        词条: "keyboard",
        句中词形: null,
        难度: null,
        记忆技巧: null,
        释义: "键盘。测试响应。",
        音标: "/ˈkiːbɔːrd/",
        词性: "noun",
        句子: "Use the keyboard.",
        句子翻译: "使用键盘。",
      })
    : prompt.includes("grammar")
      ? JSON.stringify({
          场合: null,
          标注: null,
          改后: "Corrected text from the OCR window.",
          总评: "本机测试响应。",
        })
      : "快捷键翻译测试响应。";
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  res.end(
    `data: ${JSON.stringify({ choices: [{ delta: { content: result } }] })}\n\ndata: [DONE]\n\n`,
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const env = { ...process.env, READFINCH_TEST_HOOKS: "1" };
delete env.ELECTRON_RUN_AS_NODE;
const runtime = await electron.launch({
  args: [".", `--data-dir=${path.resolve(".local/shortcuts-" + Date.now())}`],
  env,
});
runtime.on("window", (page) => {
  page.setDefaultTimeout(12000);
  page.on("pageerror", (error) => errors.push(error.message));
});
const main = await runtime.firstWindow();
main.setDefaultTimeout(12000);
const call = (page, method, arg) =>
  page.evaluate(({ method, arg }) => window.readfinch.call(method, arg), {
    method,
    arg,
  });
async function waitFor(predicate, message) {
  for (let i = 0; i < 120; i++) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error("Timed out: " + message);
}
async function modePage(mode) {
  let page;
  await waitFor(async () => {
    page = runtime
      .windows()
      .find((page) => page.url().includes("mode=" + mode));
    return page && (await page.locator("#root > *").count());
  }, mode);
  return page;
}
const selection = (text) => ({
  token: "fixture-" + Date.now(),
  text,
  app: "keyboard-fixture",
  x: 400,
  y: 250,
  canReplace: false,
});
async function trigger(id, text, delay = 0, target = "external") {
  await runtime.evaluate(
    (_, { id, value, delay, target }) => {
      if (target === "external")
        globalThis.__readfinchTest.nextSelection(value, delay);
      globalThis.__readfinchTest.shortcut(id, target);
    },
    {
      id,
      value: text === undefined ? undefined : selection(text),
      delay,
      target,
    },
  );
}
async function editConfig(mutate) {
  const s = await call(main, "snapshot");
  mutate(s.config);
  return call(main, "saveConfig", { config: s.config, revision: s.revision });
}
async function record(label, key) {
  const input = main.getByLabel(label, { exact: true });
  await input.click();
  await waitFor(
    () =>
      runtime.evaluate(({ globalShortcut }) => globalShortcut.isSuspended()),
    "shortcuts suspended for recording",
  );
  await main
    .getByText("按组合键 · Esc 取消 · Backspace 清空", { exact: true })
    .waitFor();
  await input.press(key);
  await waitFor(
    async () =>
      !(await runtime.evaluate(({ globalShortcut }) =>
        globalShortcut.isSuspended(),
      )),
    "recording released",
  );
}
let panel;
try {
  await main.evaluate(async () => {
    const s = await window.readfinch.call("snapshot");
    if (s.interfaceLocale !== "zh-CN") {
      s.config.appearance.language = "zh-CN";
      await window.readfinch.call("saveConfig", {
        config: s.config,
        revision: s.revision,
      });
    }
  });
  await main.getByRole("heading", { name: "通用", exact: true }).waitFor();
  if (isolated)
    await editConfig((config) => {
      config.shortcuts = {
        input: "Control+Alt+Shift+F4",
        selection: "Control+Alt+Shift+F8",
        capture: "Control+Alt+Shift+F11",
        clipboard: "Control+Alt+Shift+F12",
      };
      [
        "Control+Alt+Shift+F5",
        "Control+Alt+Shift+F6",
        "Control+Alt+Shift+F7",
      ].forEach((key, index) => {
        config.actions.find(
          (a) => a.id === ["translate", "dictionary", "polish"][index],
        ).shortcut = key;
      });
    });
  const initial = await call(main, "snapshot");
  const translationKey = initial.config.actions[0].shortcut;
  const dictionaryKey = initial.config.actions[1].shortcut;
  const captureKey = initial.config.shortcuts.capture;
  const isRegistered = (key) =>
    runtime.evaluate(
      ({ globalShortcut }, key) => globalShortcut.isRegistered(key),
      key,
    );
  assert.deepEqual(initial.shortcutErrors, []);
  const registration = await runtime.evaluate(
    ({ globalShortcut }, keys) =>
      Object.fromEntries(
        keys.map((key) => [key, globalShortcut.isRegistered(key)]),
      ),
    [
      ...initial.config.actions.map((a) => a.shortcut).filter(Boolean),
      ...Object.values(initial.config.shortcuts),
    ],
  );
  assert.ok(
    Object.values(registration).every(Boolean),
    JSON.stringify(registration),
  );
  check(
    isolated
      ? "All seven isolated bindings are registered with the actual Electron OS API; installed app keeps its default keys"
      : "All seven default shortcuts are registered with the actual Electron OS API",
  );
  await editConfig((config) => {
    config.selection.automatic = false;
    // Isolate primary action requests when counting repeated key presses.
    config.noteSuggestion.enabled = false;
    Object.assign(config.providers[0], {
      endpoint: `http://127.0.0.1:${server.address().port}/v1`,
      model: "shortcut-fixture",
      requiresKey: false,
    });
  });
  await runtime.evaluate(
    (_, value) => globalThis.__readfinchTest.select(value),
    selection("STALE MOUSE SELECTION"),
  );
  await trigger(
    "action:translate",
    "Fresh keyboard selection for translation.",
  );
  panel = await modePage("panel");
  await waitFor(() => requests.length === 1, "first translation request");
  await panel.getByRole("button", { name: "重新生成", exact: true }).waitFor();
  assert.equal(requests.length, 1);
  assert.match(JSON.stringify(requests[0]), /Fresh keyboard selection/);
  assert.doesNotMatch(JSON.stringify(requests[0]), /STALE MOUSE/);
  await trigger("action:dictionary", "keyboard");
  await panel.getByRole("heading", { name: "keyboard", exact: true }).waitFor();
  assert.equal(requests.length, 2);
  check(
    "Direct translation and dictionary use a fresh key-press selection even with automatic toolbar disabled (selection/keypress callbacks are fixtures)",
  );
  await trigger("action:translate", undefined);
  await panel.getByText("未读到选中文字", { exact: true }).waitFor();
  assert.equal(requests.length, 2);
  check("Missing fresh selection cannot submit cached text or start OCR");
  await trigger("selection", "Open only the action menu.");
  await panel.getByRole("button", { name: "翻译", exact: true }).waitFor();
  assert.equal(requests.length, 2);
  await trigger(
    "action:dictionary",
    "Should not run in settings",
    0,
    "settings",
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(requests.length, 2);
  check(
    "Selection menu stays manual; action shortcuts do not run from settings inputs",
  );

  await call(main, "settingsOpen", { tab: "shortcuts" });
  await record("翻译快捷键", "Escape");
  assert.equal(
    (await call(main, "snapshot")).config.actions[0].shortcut,
    translationKey,
  );
  await record("翻译快捷键", "Control+Alt+F9");
  await waitFor(
    async () =>
      (await call(main, "snapshot")).config.actions[0].shortcut ===
      "Control+Alt+F9",
    "autosaved translation shortcut",
  );
  assert.equal(await isRegistered(translationKey), false);
  assert.equal(await isRegistered("Control+Alt+F9"), true);
  check(
    "Recorder suspends OS shortcuts, Esc preserves the binding, and changes autosave and replace the old OS registration",
  );
  await record("翻译快捷键", dictionaryKey);
  await main
    .getByText(/翻译.*词典.*快捷键冲突|词典.*翻译.*快捷键冲突/)
    .waitFor();
  assert.equal(
    (await call(main, "snapshot")).config.actions[0].shortcut,
    "Control+Alt+F9",
  );
  await record("翻译快捷键", "Control+Alt+F9");
  await main.locator(".alert.error").waitFor({ state: "hidden" });
  await record("词典快捷键", "Backspace");
  await waitFor(
    async () =>
      (await call(main, "snapshot")).config.actions[1].shortcut === "",
    "cleared shortcut persisted",
  );
  assert.equal(await isRegistered(dictionaryKey), false);
  await record("词典快捷键", dictionaryKey);
  await waitFor(
    async () =>
      (await call(main, "snapshot")).config.actions[1].shortcut ===
      dictionaryKey,
    "dictionary shortcut restored",
  );
  await record("框选屏幕文字（OCR）快捷键", "Backspace");
  await waitFor(
    async () => (await call(main, "snapshot")).config.shortcuts.capture === "",
    "capture shortcut disabled",
  );
  assert.equal(await isRegistered(captureKey), false);
  await editConfig((config) => {
    config.shortcuts.capture = initial.config.shortcuts.capture;
  });
  check(
    "Duplicate combinations keep the last valid binding; clearing an action or OCR entry shortcut unregisters it after autosave",
  );

  await record("翻译快捷键", translationKey);
  await waitFor(
    async () =>
      (await call(main, "snapshot")).config.actions[0].shortcut ===
      translationKey,
    "default translation restored for screenshots",
  );
  await call(main, "setTheme", { theme: "light" });
  await main
    .locator(".settings-card")
    .filter({
      has: main.getByRole("heading", { name: "全局快捷键", exact: true }),
    })
    .evaluate((element) => element.scrollIntoView({ block: "start" }));
  await main.screenshot({ path: output + "/shortcuts-light.png" });
  await call(main, "setTheme", { theme: "dark" });
  await main.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  await main.screenshot({ path: output + "/shortcuts-dark.png" });
  assert.equal(
    await main.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  check(
    "Shortcut settings render in light and dark themes without horizontal overflow",
  );
  await main
    .getByRole("navigation")
    .getByRole("button", { name: "自定义 AI 指令", exact: true })
    .click();
  await main.getByRole("button", { name: "复制", exact: true }).click();
  await main.getByLabel("指令名称", { exact: true }).fill("快捷键自定义指令");
  await call(main, "settingsOpen", { tab: "shortcuts" });
  assert.equal(
    await main
      .getByLabel("快捷键自定义指令快捷键", { exact: true })
      .inputValue(),
    "",
  );
  await record("快捷键自定义指令快捷键", "Control+Alt+F10");
  await waitFor(
    async () =>
      (await call(main, "snapshot")).config.actions.some(
        (a) =>
          a.name === "快捷键自定义指令" && a.shortcut === "Control+Alt+F10",
      ),
    "custom shortcut saved",
  );
  const custom = (await call(main, "snapshot")).config.actions.find(
    (action) => action.name === "快捷键自定义指令",
  );
  assert.ok(custom);
  assert.equal(custom.shortcut, "Control+Alt+F10");
  await trigger("action:" + custom.id, "custom shortcut selection");
  await waitFor(() => requests.length === 3, "custom action request");
  assert.match(JSON.stringify(requests.at(-1)), /custom shortcut selection/);
  await editConfig((config) => {
    config.actions.find((action) => action.id === custom.id).enabled = false;
  });
  assert.equal(await isRegistered("Control+Alt+F10"), false);
  check(
    "Duplicating an action clears its shortcut; custom bindings autosave and unregister when disabled",
  );

  const dataUrl =
    "data:image/png;base64," +
    (await readFile("tests/fixtures/bilingual-light.png")).toString("base64");
  await runtime.evaluate(
    (_, dataUrl) => globalThis.__readfinchTest.image(dataUrl),
    dataUrl,
  );
  await panel.waitForFunction(
    () =>
      document.querySelector(".source-editor")?.value.includes("Small steps") &&
      !document.querySelector(".job-progress"),
    { timeout: 30000 },
  );
  await panel
    .getByLabel("原文", { exact: true })
    .fill("Manually corrected OCR text for keyboard action.");
  await trigger("action:polish", undefined, 0, "panel");
  await panel
    .getByText("Corrected text from the OCR window.", { exact: true })
    .waitFor();
  assert.equal(requests.length, 4);
  assert.match(JSON.stringify(requests.at(-1)), /Manually corrected OCR text/);
  await panel.screenshot({ path: output + "/ocr-shortcut-writing-dark.png" });
  check(
    "In the OCR popup, an action shortcut uses the currently corrected text (real bundled OCR, fixture model reply)",
  );
  await trigger("action:translate", "Repeated shortcut test.");
  await waitFor(() => requests.length === 5, "first repeat test request");
  await trigger("action:translate", "Repeated shortcut test.");
  await trigger("action:translate", "Repeated shortcut test.");
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(requests.length, 5);
  await trigger("action:dictionary", "SLOW STALE SELECTION", 700);
  await trigger("action:polish", "Latest shortcut selection.");
  await waitFor(() => requests.length === 6, "latest shortcut request");
  await new Promise((resolve) => setTimeout(resolve, 800));
  assert.equal(requests.length, 6);
  assert.match(JSON.stringify(requests.at(-1)), /Latest shortcut selection/);
  await trigger("action:dictionary", "DISMISSED SELECTION", 400);
  await call(panel, "window", { command: "dismiss" });
  await new Promise((resolve) => setTimeout(resolve, 550));
  assert.equal(requests.length, 6);
  assert.equal(
    await runtime.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some(
        (win) =>
          win.webContents.getURL().includes("mode=panel") && win.isVisible(),
      ),
    ),
    false,
  );
  check(
    "Repeated held-key callbacks are suppressed; late reads cannot override a newer shortcut or reopen a dismissed popup",
  );
  await runtime.evaluate(
    (_, value) => globalThis.__readfinchTest.select(value),
    selection("NATIVE PROTOCOL CACHE MUST NOT RETURN"),
  );
  assert.equal((await call(main, "snapshot")).nativeState, "ready");
  const nativeReadStarted = Date.now();
  const nativeRead = await runtime.evaluate(() =>
    globalThis.__readfinchTest.readNativeSelection(),
  );
  const nativeReadMilliseconds = Date.now() - nativeReadStarted;
  assert.ok(
    nativeReadMilliseconds < 1500,
    "Fresh read must complete before the 1800 ms timeout fallback",
  );
  assert.equal((await call(main, "snapshot")).nativeState, "ready");
  assert.notEqual(nativeRead?.text, "NATIVE PROTOCOL CACHE MUST NOT RETURN");
  check(
    "The running native helper answers refresh IPC without returning an injected old cache; external foreground text remains unverified",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    verifyOnly
      ? path.join(output, "verification.json")
      : "docs/shortcut-verification.json",
    JSON.stringify(
      {
        version: JSON.parse(await readFile("package.json", "utf8")).version,
        date: new Date().toISOString(),
        checks,
        registration,
        isolatedShortcuts: isolated,
        requests: requests.length,
        rendererErrors: errors,
        nativeReadMilliseconds,
        scope:
          "Actual Electron global registration, recorder UI and native refresh IPC. Selection values and global callback invocation are development fixtures; physical OS key presses with real external foreground selection require interactive acceptance. Local OCR is real; model replies are localhost fixtures.",
      },
      null,
      2,
    ),
  );
  console.log("Shortcut smoke passed:", checks.length, "checks.");
} catch (error) {
  console.error(error);
  if (panel) {
    await panel
      .screenshot({ path: output + "/failure-panel.png" })
      .catch(() => {});
    console.error(
      "Popup at failure:",
      await panel
        .locator("body")
        .innerText()
        .catch(() => "unavailable"),
    );
  }
  await main.screenshot({ path: output + "/failure.png" }).catch(() => {});
  throw error;
} finally {
  server.close();
  server.closeAllConnections();
  await runtime.close();
}
