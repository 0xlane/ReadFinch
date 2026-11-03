import { _electron as electron } from "playwright";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const dir = path.resolve(".local/suggestion-smoke-" + Date.now());
const output = "docs/screenshots/current";
const packaged = process.argv.includes("--packaged");
await mkdir(dir, { recursive: true });
await mkdir(output, { recursive: true });
const passage =
  "A chance encounter in a secondhand bookshop was pure serendipity.";
const translated = "在一家二手书店里的不期而遇，纯属一场美好的意外。";
const terms = [
  {
    term: "chance encounter",
    summary: "不期而遇，偶然的相逢。",
    result: { definition: "未经安排、出乎意料的一次相遇。", example: passage },
  },
  {
    term: "serendipity",
    summary: "偶然发现美好事物的机缘。",
    result: {
      definition: "意外遇见美好事物的幸运机缘。",
      phonetic: "/ˌserənˈdɪpəti/",
      partOfSpeech: "noun",
      example: passage,
    },
  },
];
const waitTranslation = Promise.withResolvers(),
  waitLate = Promise.withResolvers();
let slowTranslation = true,
  lateStarted = false,
  lateAborted = false;
const requests = [],
  checks = [],
  errors = [];
const server = createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  const hint = body.messages[0].content.startsWith("Suggest vocabulary notes");
  requests.push({ hint, model: body.model });
  let text;
  if (hint) {
    const {
      passage: selected,
      targetLanguage,
      command,
    } = JSON.parse(body.messages[1].content);
    if (selected.includes("obsolete")) {
      lateStarted = true;
      res.on("close", () => {
        if (!res.writableEnded) lateAborted = true;
      });
      await waitLate.promise;
    }
    if (selected.includes("unavailable")) {
      res.writeHead(503);
      res.end();
      return;
    }
    const candidates = terms
      .filter((n) => selected.includes(n.term))
      .map((n) => ({
        ...n,
        summary:
          targetLanguage === "English" ? "An unexpected discovery." : n.summary,
        result:
          command === "阅读用语"
            ? "**用法** " + n.summary
            : {
                词条: n.term,
                音标: n.result.phonetic ?? null,
                词性: n.result.partOfSpeech ?? null,
                释义: n.result.definition,
                句子: n.result.example,
                句中词形: null,
                句子翻译: null,
                记忆技巧: null,
                难度: null,
              },
      }));
    text = JSON.stringify({ notes: candidates });
  } else {
    if (slowTranslation) await waitTranslation.promise;
    if (body.messages[1].content.includes("failed translation")) {
      res.writeHead(429);
      res.end();
      return;
    }
    text = translated;
  }
  if (res.destroyed) return;
  res.setHeader("Content-Type", "text/event-stream");
  res.end(
    "data: " +
      JSON.stringify({ choices: [{ delta: { content: text } }] }) +
      "\n\ndata: [DONE]\n\n",
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const env = { ...process.env, READFINCH_TEST_HOOKS: "1" };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  ...(packaged
    ? { executablePath: path.resolve("release/win-unpacked/ReadFinch.exe") }
    : {}),
  args: [...(packaged ? [] : ["."]), "--data-dir=" + dir],
  env,
});
app.on("window", (page) => page.on("pageerror", (e) => errors.push(e.message)));
const main = await app.firstWindow();
const api = (page, method, arg) =>
  page.evaluate(({ method, arg }) => window.readfinch.call(method, arg), {
    method,
    arg,
  });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, description) {
  for (let i = 0; i < 160; i++) {
    if (await check()) return;
    await pause(50);
  }
  throw Error(description);
}
const log = (value) => {
  checks.push(value);
  console.log(value);
};
const suggestCount = () => requests.filter((r) => r.hint).length;
const list = () =>
  api(main, "notesList", { offset: 0, notebook: "", search: "" });
async function select(text) {
  await app.evaluate(
    (_, text) =>
      globalThis.__readfinchTest.select({
        token: crypto.randomUUID(),
        app: "Reader",
        text,
        x: 460,
        y: 250,
        canReplace: false,
      }),
    text,
  );
}
async function enterText(text) {
  await api(main, "panelOpen", { source: "empty" });
  await until(
    () => app.windows().some((p) => p.url().includes("mode=panel")),
    "missing text entry",
  );
  const panel = app.windows().find((p) => p.url().includes("mode=panel"));
  await panel.getByLabel("原文", { exact: true }).fill(text);
  return panel.getByRole("button", { name: "翻译", exact: true });
}
async function translate(text) {
  if (packaged) {
    await (await enterText(text)).click();
    return;
  }
  await select(text);
  await api(main, "selectionOpen", { actionId: "translate" });
}
try {
  const s = await api(main, "snapshot");
  s.config.appearance.language = "zh-CN";
  s.config.appearance.theme = "light";
  const p = s.config.providers[0];
  Object.assign(p, {
    model: "translation-fixture",
    name: "翻译服务",
    endpoint: "http://127.0.0.1:" + server.address().port + "/v1",
    requiresKey: false,
  });
  s.config.providers.push({
    ...p,
    id: "vocabulary",
    name: "词条服务",
    model: "vocabulary-fixture",
  });
  s.config.localNotebases.push({
    id: "phrases",
    name: "阅读用语集",
    columns: [
      { id: "term", name: "原文", type: "string" },
      { id: "content", name: "结果", type: "string" },
    ],
  });
  s.config.actions.push({
    ...s.config.actions[2],
    id: "my-phrases",
    outputSchema: undefined,
    layout: undefined,
    sample: undefined,
    name: "阅读用语",
    noteConnection: {
      providerId: "local",
      notebaseId: "phrases",
      mappings: { selection: "term", result: "content" },
    },
    pinned: false,
    shortcut: "",
  });
  await api(main, "saveConfig", { config: s.config, revision: s.revision });
  await main
    .getByLabel("推荐提供商", { exact: true })
    .selectOption("vocabulary");
  await until(
    async () =>
      (await api(main, "snapshot")).config.noteSuggestion.providerId ===
      "vocabulary",
    "recommendation provider did not autosave",
  );
  await api(main, "settingsOpen", { tab: "text" });
  await main.waitForFunction(
    () =>
      document.querySelector('select[aria-label="猜你想存的提供商"]')?.value ===
      "vocabulary",
  );
  let trigger;
  if (packaged) {
    trigger = await enterText(passage);
  } else {
    await select(passage);
    await until(
      () => app.windows().some((p) => p.url().includes("mode=pill")),
      "missing selection toolbar",
    );
    const pill = app.windows().find((p) => p.url().includes("mode=pill"));
    trigger = pill.getByRole("button", { name: "翻译", exact: true });
  }
  await trigger.waitFor();
  assert.equal(requests.length, 0);
  await trigger.click();
  await until(
    () => app.windows().some((p) => p.url().includes("mode=panel")),
    "missing result window",
  );
  const panel = app.windows().find((p) => p.url().includes("mode=panel"));
  panel.setDefaultTimeout(12000);
  await panel.getByRole("button", { name: "保持浮窗" }).click();
  const card = panel.getByRole("region", { name: "猜你想存" });
  await until(
    () => requests.length === 2,
    "translation and suggestion should both start",
  );
  assert.equal(requests.find((r) => r.hint).model, "vocabulary-fixture");
  assert.equal(requests.find((r) => !r.hint).model, "translation-fixture");
  assert.equal(await card.count(), 0);
  assert.equal((await list()).total, 0);
  slowTranslation = false;
  waitTranslation.resolve();
  await card.getByRole("checkbox", { name: "serendipity" }).waitFor();
  assert.equal(await card.getByRole("checkbox").count(), 2);
  assert.equal((await list()).total, 0);
  if (!packaged)
    await panel.screenshot({ path: output + "/suggested-notes-light.png" });
  await api(main, "setTheme", { theme: "dark" });
  await panel.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  if (!packaged)
    await panel.screenshot({ path: output + "/suggested-notes-dark.png" });
  await api(main, "setTheme", { theme: "light" });
  log(
    "An explicit translation starts two independently routed requests; recommendations appear only after the translation, without writing any notes.",
  );
  const first = card.getByRole("checkbox", { name: "chance encounter" });
  const second = card.getByRole("checkbox", { name: "serendipity" });
  await first.uncheck();
  await second.uncheck();
  assert.ok(
    await card.getByRole("button", { name: "保存", exact: true }).isDisabled(),
  );
  await second.check();
  await card.getByRole("button", { name: "保存", exact: true }).click();
  await card.getByRole("button", { name: "创建并保存", exact: true }).click();
  await card.getByRole("button", { name: "已保存", exact: true }).waitFor();
  const saved = await list();
  assert.equal(saved.total, 1);
  const note = await api(main, "noteGet", { id: saved.notes[0].id });
  assert.equal(note.source, "serendipity");
  assert.equal(note.excerpt, passage);
  assert.equal(note.model, "vocabulary-fixture");
  assert.equal(note.sourceApp, packaged ? "" : "Reader");
  await card.getByRole("button", { name: "词典" }).click();
  await main
    .locator(".note-detail .definition")
    .filter({ hasText: "幸运机缘" })
    .waitFor();
  assert.equal(
    await main.locator(".note-detail .note-source").innerText(),
    passage,
  );
  log(
    "Saving only the checked term opens its structured local note with the exact passage, source app and recommendation model.",
  );
  await translate(passage);
  await card.getByRole("button", { name: "保存", exact: true }).waitFor();
  assert.equal(requests.length, 2, "both answers should be cached");
  await panel.getByLabel("目标语言").selectOption("English");
  await card
    .getByText("An unexpected discovery.", { exact: true })
    .first()
    .waitFor();
  assert.equal(suggestCount(), 2);
  assert.equal(
    (await api(main, "snapshot")).config.defaults.targetLanguage,
    "English",
  );
  await translate("An obsolete chance encounter");
  await until(() => lateStarted, "missing slow suggestion");
  await panel.getByRole("button", { name: "重新生成", exact: true }).waitFor();
  await translate("Another bookshop, another serendipity.");
  await card.getByRole("checkbox", { name: "serendipity" }).waitFor();
  await until(
    () => lateAborted,
    "changing selection did not abort the delayed request",
  );
  waitLate.resolve();
  assert.equal(await card.getByRole("checkbox").count(), 1);
  assert.equal(
    await card.getByRole("checkbox", { name: "chance encounter" }).count(),
    0,
  );
  log(
    "Identical runs reuse the cache; changing the target refreshes the card and a new selection cancels the previous response.",
  );
  await card.getByRole("switch", { name: "显示猜你想存" }).click();
  await card.waitFor({ state: "detached" });
  assert.equal(
    (await api(main, "snapshot")).config.noteSuggestion.enabled,
    false,
  );
  const before = suggestCount();
  await translate("No recommendation should run for this serendipity.");
  await panel
    .locator(".rf-translation")
    .filter({ hasText: translated })
    .waitFor();
  assert.equal(suggestCount(), before);
  await api(main, "settingsOpen", { tab: "general" });
  const enabled = main.getByRole("switch", { name: "显示猜你想存" });
  await enabled.click();
  await main.getByLabel("推荐指令", { exact: true }).selectOption("my-phrases");
  await until(async () => {
    const n = (await api(main, "snapshot")).config.noteSuggestion;
    return n.enabled && n.actionId === "my-phrases";
  }, "settings did not persist");
  await translate("A chance encounter on the train.");
  await card.getByRole("button", { name: "保存", exact: true }).click();
  await card.getByRole("button", { name: "阅读用语集" }).click();
  await main
    .locator(".note-detail .markdown")
    .filter({ hasText: "不期而遇" })
    .waitFor();
  assert.equal((await list()).total, 2);
  log(
    "The card switch stops future recommendation requests; re-enabling with a custom command saves Markdown to its own notebook.",
  );
  for (const text of ["An empty result.", "Suggestion service unavailable."]) {
    await translate(text);
    await panel.locator(".rf-source-text").filter({ hasText: text }).waitFor();
    await panel.getByRole("button", { name: "保存到本地笔记库" }).waitFor();
    assert.equal(await card.count(), 0);
    assert.equal(await panel.getByRole("alert").count(), 0);
  }
  await translate("A chance encounter with a failed translation");
  await panel.getByRole("alert").waitFor();
  assert.equal(await card.count(), 0);
  assert.equal((await list()).total, 2);
  assert.deepEqual(errors, []);
  log(
    "Empty and failed recommendations leave the translation usable; a failed translation never offers to save suggestions.",
  );
  await writeFile(
    packaged
      ? "docs/packaged-note-suggestion-verification.json"
      : "docs/note-suggestion-verification.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        version: s.version,
        packaged,
        checks,
        rendererErrors: errors,
        fixture: packaged
          ? "Packaged executable, text entered in the result window, loopback SSE provider and isolated SQLite"
          : "Loopback SSE provider, synthetic desktop selection and isolated SQLite",
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  waitTranslation.resolve();
  waitLate.resolve();
  await app.close();
  server.closeAllConnections();
  server.close();
}
