import { _electron as electron } from "playwright";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const packaged = process.argv.includes("--packaged"),
  executable =
    process.argv.slice(2).find((arg) => !arg.startsWith("--")) ??
    "release/win-unpacked/ReadFinch.exe",
  dir = path.resolve(".local/languages-" + Date.now()),
  checks = [],
  requests = [],
  errors = [];
await mkdir(dir, { recursive: true });
let held = true;
const release = Promise.withResolvers();
const server = createServer(async (req, res) => {
  let raw = "";
  for await (const c of req) raw += c;
  const body = JSON.parse(raw);
  requests.push(body);
  const fields = body.response_format.json_schema.schema.properties;
  const english = Object.hasOwn(fields, "Term");
  const result = Object.fromEntries(Object.keys(fields).map((k) => [k, null]));
  Object.assign(
    result,
    english
      ? {
          Term: "blossom",
          Definition: "A flower on a fruit tree.",
          Pronunciation: "/ˈblɒs.əm/",
          "Part of speech": "noun",
        }
      : {
          词条: "blossom",
          释义: "花。特に果樹に咲く花。",
          音标: "/ˈblɒs.əm/",
          词性: "noun",
        },
  );
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  const stream = (v) =>
    res.write(
      "data: " +
        JSON.stringify({ choices: [{ delta: { content: v } }] }) +
        "\n\n",
    );
  const text = JSON.stringify(result),
    split = text.indexOf("blossom") + 7;
  stream(text.slice(0, split));
  if (held) {
    held = false;
    await release.promise;
  }
  stream(text.slice(split));
  res.end("data: [DONE]\n\n");
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
let app, main;
const api = (method, arg) =>
  main.evaluate(({ method, arg }) => window.readfinch.call(method, arg), {
    method,
    arg,
  });
const update = async (change) => {
  const state = await api("snapshot");
  change(state.config);
  return api("saveConfig", { config: state.config, revision: state.revision });
};
const btn = (p, name) => p.getByRole("button", { name, exact: true });
const windowMode = async (mode) => {
  for (let i = 0; i < 80; i++) {
    const p = app.windows().find((p) => p.url().includes("mode=" + mode));
    if (p) return p;
    await new Promise((r) => setTimeout(r, 80));
  }
  throw Error("Missing window " + mode);
};
try {
  app = await electron.launch({
    ...(packaged ? { executablePath: path.resolve(executable) } : {}),
    args: [...(packaged ? [] : ["."]), "--settings", "--data-dir=" + dir],
    env,
  });
  app.on("window", (p) => p.on("pageerror", (e) => errors.push(e.message)));
  main = await app.firstWindow();
  main.setDefaultTimeout(15000);
  await main.locator("main h1").waitFor();
  const startup = await api("snapshot");
  const initial = startup.config.defaults;
  assert.equal(initial.sourceLanguage, "auto");
  assert.ok(!["system", "auto", ""].includes(initial.targetLanguage));
  assert.ok(!("explanationLanguage" in initial));
  if (process.platform === "win32") {
    const displayLanguage = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "[Globalization.CultureInfo]::CurrentUICulture.Name",
      ],
      { encoding: "utf8", windowsHide: true },
    ).trim();
    const preferred = await app.evaluate(({ app }) =>
      app.getPreferredSystemLanguages(),
    );
    const first = [displayLanguage, ...preferred].find((tag) =>
      /^(en|zh)(-|$)/i.test(tag),
    );
    const expected = /^zh/i.test(first ?? "") ? "zh-CN" : "en";
    assert.equal(startup.config.appearance.language, "system");
    assert.equal(startup.interfaceLocale, expected);
    const picker = main.getByRole("combobox", {
      name: /^(界面语言|Interface language)$/,
    });
    const manual = expected === "en" ? "zh-CN" : "en";
    await picker.selectOption(manual);
    await main.waitForFunction(
      (locale) => document.documentElement.lang === locale,
      manual,
    );
    await picker.selectOption("system");
    await main.waitForFunction(
      (locale) => document.documentElement.lang === locale,
      expected,
    );
    await main
      .getByRole("heading", {
        name: expected === "en" ? "General" : "通用",
        exact: true,
      })
      .waitFor();
    const followed = await api("snapshot");
    assert.equal(followed.config.appearance.language, "system");
    assert.deepEqual(followed.config.defaults, initial);
    checks.push(
      `Windows display language ${displayLanguage}, preferred languages [${preferred.join(", ")}]: startup and returning to Follow system both use ${expected} and preserve translation preferences.`,
    );
  }
  await update((c) => {
    c.appearance.language = "zh-CN";
  });
  await main.getByRole("heading", { name: "翻译语言", exact: true }).waitFor();
  await main
    .locator(".translation-languages")
    .screenshot({ path: path.join(dir, "translation-languages-zh.png") });
  await update((c) => {
    c.appearance.language = "en";
    c.appearance.theme = "light";
    c.selection.automatic = false;
    c.noteSuggestion.enabled = false;
    c.shortcuts = { selection: "", capture: "", clipboard: "" };
    c.actions.forEach((a) => (a.shortcut = ""));
    Object.assign(c.providers[0], {
      model: "language-fixture",
      endpoint: "http://127.0.0.1:" + server.address().port + "/v1",
      requiresKey: false,
      proxy: { mode: "direct", address: "" },
    });
    c.actions.push({
      ...structuredClone(c.actions[1]),
      id: "my-command",
      name: "User command",
      system: "User-owned instructions — 日本語",
      prompt: "User-owned {{selection}}",
    });
  });
  const english = await api("snapshot");
  assert.equal(english.interfaceLocale, "en");
  assert.equal(english.config.defaults.targetLanguage, initial.targetLanguage);
  const source = main.getByRole("combobox", {
    name: "Source language",
    exact: true,
  });
  const target = main.getByRole("combobox", {
    name: "Target language",
    exact: true,
  });
  await source.selectOption("Deutsch");
  await target.selectOption("English");
  assert.equal(
    await target.locator('option[value="system"],option[value="auto"]').count(),
    0,
  );
  await main.waitForFunction(async () => {
    const d = (await window.readfinch.call("snapshot")).config.defaults;
    return d.sourceLanguage === "Deutsch" && d.targetLanguage === "English";
  });
  await main
    .locator(".translation-languages")
    .screenshot({ path: path.join(dir, "translation-languages.png") });
  for (const a of english.config.actions.filter((a) => a.id !== "my-command"))
    assert.doesNotMatch(
      a.system + JSON.stringify(a.outputSchema ?? []),
      /[\u3400-\u9fff]/,
    );
  await api("settingsOpen", { tab: "actions", actionId: "dictionary" });
  await main
    .locator(".layout-preview .definition")
    .getByText("A flower, especially one on a fruit tree.", { exact: true })
    .waitFor();
  await main.screenshot({
    path: path.join(dir, "commands-english.png"),
  });
  checks.push(
    "Fresh profiles store a concrete target. Source and target selectors autosave independently of the interface language, and only the source offers auto-detection.",
  );
  await api("panelOpen", { source: "action-test", actionId: "dictionary" });
  const panel = await windowMode("panel");
  panel.setDefaultTimeout(15000);
  await panel.getByLabel("Original text", { exact: true }).fill("blossom");
  await panel.getByRole("button", { name: /^Test .*Dictionary/ }).click();
  await panel
    .locator(".dictionary-word h2")
    .getByText("blossom", { exact: true })
    .waitFor();
  assert.match(requests[0].messages[0].content, /Use English/);
  await update((c) => {
    c.appearance.language = "zh-CN";
    c.defaults.targetLanguage = "日本語";
  });
  release.resolve();
  await panel
    .locator(".definition")
    .getByText("A flower on a fruit tree.", { exact: true })
    .waitFor();
  await btn(panel, "保存到本地笔记库").click();
  await btn(panel, "创建并保存").click();
  await btn(panel, "在笔记库中查看").waitFor();
  const list = await api("notesList", { search: "", notebook: "", offset: 0 });
  assert.equal(list.total, 1);
  const note = await api("noteGet", { id: list.notes[0].id });
  assert.equal(note.targetLanguage, "English");
  assert.match(note.result, /A flower on a fruit tree/);
  checks.push(
    "Switching UI and output languages during streaming preserves the in-flight card and saves its original language/schema to the local notebase.",
  );
  await btn(panel, "重新生成").click();
  await panel
    .locator(".definition")
    .getByText("花。特に果樹に咲く花。", { exact: true })
    .waitFor();
  assert.match(requests.at(-1).messages[0].content, /日本語/);
  assert.match(requests.at(-1).messages[1].content, /目标语言：日本語/);
  assert.doesNotMatch(
    JSON.stringify(requests.at(-1).messages),
    /\{\{(?:targetLanguage|explanationLanguage)\}\}/,
  );
  await panel.screenshot({
    path: path.join(dir, "result-japanese.png"),
  });
  checks.push(
    "Regeneration uses the new UI schema and the selected Japanese target for definitions and translations.",
  );
  await btn(panel, "保存到本地笔记库").click();
  await btn(panel, "在笔记库中查看").waitFor();
  const after = await api("snapshot");
  assert.equal(
    after.config.actions.find((a) => a.id === "my-command").system,
    "User-owned instructions — 日本語",
  );
  const stored = JSON.parse(
    await readFile(path.join(dir, "config.json"), "utf8"),
  );
  assert.equal(stored.actions[1].outputSchema[0].name, "词条");
  assert.equal(stored.actions[1].sample.targetLanguage, "简体中文");
  await update((c) => {
    c.appearance.language = "en";
  });
  await api("settingsOpen", { tab: "actions", actionId: "dictionary" });
  await main
    .locator(".layout-preview .definition")
    .getByText("花。特に果樹に咲く花。", { exact: true })
    .waitFor();
  await main.screenshot({
    path: path.join(dir, "commands-japanese-preview.png"),
  });
  assert.deepEqual(errors, []);
  checks.push(
    "Explicit output preferences and custom prompts survive locale switches; canonical storage avoids persisting derived translations.",
  );
  await writeFile(
    path.join(dir, "language-verification.json"),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        version: after.version,
        packaged,
        checks,
        rendererErrors: errors,
        scope:
          "Isolated Electron profile and local streaming fixture; unit tests cover all eight output languages.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(checks.join("\n"));
} catch (error) {
  for (const page of app?.windows() ?? [])
    console.error(
      page.url(),
      await page
        .locator("body")
        .innerText()
        .catch(() => ""),
    );
  await main
    ?.screenshot({ path: path.join(dir, "failed.png") })
    .catch(() => {});
  console.error("Diagnostics: " + dir);
  throw error;
} finally {
  release.resolve();
  await app?.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
