// Documentation images use real Electron windows and deterministic local responses.
// They contain no user account, private selection, external AI call or API key.
import { _electron as electron } from "playwright";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const englishCopy = JSON.parse(await readFile("src/shared/en.json", "utf8"));
const out = "docs/assets";
await mkdir(out, { recursive: true });
let fixture;
const server = createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  const suggestions = body.messages[0].content.startsWith(
    "Suggest vocabulary notes",
  );
  const text = suggestions
    ? JSON.stringify({ notes: fixture.notes })
    : fixture.translation;
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  for (const fragment of text.match(/[\s\S]{1,24}/g) ?? []) {
    if (res.destroyed) return;
    res.write(
      "data: " +
        JSON.stringify({ choices: [{ delta: { content: fragment } }] }) +
        "\n\n",
    );
    await new Promise((r) => setTimeout(r, 8));
  }
  res.end("data: [DONE]\n\n");
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const api = (page, method, arg) =>
  page.evaluate(({ method, arg }) => window.readfinch.call(method, arg), {
    method,
    arg,
  });
const errors = [];
const records = [];
try {
  for (const locale of ["en", "zh-CN"]) {
    const english = locale === "en";
    const source = english
      ? "Une rencontre fortuite chez un bouquiniste peut changer le cours d’une journée."
      : "A chance encounter in a secondhand bookshop was pure serendipity.";
    const words = english
      ? [
          ["rencontre fortuite", "A chance encounter, an unexpected meeting."],
          [
            "bouquiniste",
            "A bookseller who deals in secondhand or rare books.",
          ],
        ]
      : [
          ["chance encounter", "不期而遇，未经安排的偶然相逢。"],
          ["serendipity", "意外发现美好事物的幸运机缘。"],
        ];
    fixture = {
      translation: english
        ? "A chance encounter in a secondhand bookshop can change the course of a day."
        : "在一家二手书店里的不期而遇，纯属一场美好的意外。",
      notes: words.map(([term, meaning]) => ({
        term,
        summary: meaning,
        result: {
          词条: term,
          音标: null,
          词性: "noun",
          释义: meaning,
          句子: source,
          句中词形: term,
          句子翻译: null,
          记忆技巧: null,
          难度: "B2",
        },
      })),
    };
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const app = await electron.launch({
      args: [
        ".",
        "--settings",
        "--data-dir=" +
          path.resolve(".local/readme-" + locale + "-" + Date.now()),
      ],
      env,
    });
    app.on("window", (page) =>
      page.on("pageerror", (e) => errors.push(e.message)),
    );
    try {
      const main = await app.firstWindow();
      main.setDefaultTimeout(15000);
      await main.locator("main h1").waitFor();
      const state = await api(main, "snapshot");
      Object.assign(state.config.appearance, {
        language: locale,
        theme: "light",
      });
      Object.assign(state.config.providers[0], {
        name: "OpenAI",
        model: "gpt-4.1-mini",
        endpoint: "http://127.0.0.1:" + server.address().port + "/v1",
        requiresKey: false,
      });
      state.config.selection.automatic = false;
      state.config.shortcuts = { input: "", selection: "", capture: "", clipboard: "" };
      state.config.actions.forEach((a) => (a.shortcut = ""));
      state.config.defaults.targetLanguage = english ? "English" : "简体中文";
      if (english) {
        const sample = state.config.actions.find(
          (a) => a.id === "dictionary",
        ).sample;
        sample.targetLanguage = "English";
        for (const [key, value] of Object.entries(sample.values))
          sample.values[key] = englishCopy[value] ?? value;
      }
      await api(main, "saveConfig", {
        config: state.config,
        revision: state.revision,
      });
      assert.equal(
        await app.evaluate(({ app }) => app.getName()),
        "ReadFinch",
        "Legacy storage/encryption identity must be retained",
      );
      await main
        .locator(".app-version")
        .filter({ hasText: english ? "ReadFinch" : "伴读雀" })
        .waitFor();
      await api(main, "panelOpen", { source: "empty" });
      let panel;
      for (let i = 0; i < 80; i++) {
        panel = app.windows().find((p) => p.url().includes("mode=panel"));
        if (panel) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      panel.setDefaultTimeout(15000);
      await panel
        .getByLabel(english ? "Original text" : "原文", { exact: true })
        .fill(source);
      await panel.evaluate(() =>
        window.readfinch.on(
          "noteSuggestions",
          (v) => (window.__readmeSuggestion = v),
        ),
      );
      await panel
        .getByRole("button", {
          name: english ? "Translate" : "翻译",
          exact: true,
        })
        .click();
      await panel.waitForFunction(
        () => !!window.__readmeSuggestion?.items.length,
      );
      await panel.getByText(fixture.translation, { exact: true }).waitFor();
      for (const theme of ["light", "dark"]) {
        await api(main, "setTheme", { theme });
        await panel.waitForFunction(
          (t) => document.documentElement.dataset.theme === t,
          theme,
        );
        await panel.mouse.move(1, 1);
        await panel.waitForTimeout(180);
        await panel.screenshot({
          path: out + "/reading-" + locale + "-" + theme + ".png",
        });
      }
      const suggestion = await panel.evaluate(() => window.__readmeSuggestion);
      const ids = await api(panel, "saveSuggestions", {
        id: suggestion.id,
        indexes: [0, 1],
        create: true,
      });
      assert.equal(ids.length, 2);
      await api(main, "settingsOpen", { tab: "notes", noteId: ids[0] });
      await main.locator(".note-detail").waitFor();
      await main
        .locator(".note-detail")
        .getByText(words[0][0], { exact: true })
        .first()
        .waitFor();
      for (const theme of ["light", "dark"]) {
        await api(main, "setTheme", { theme });
        await main.waitForFunction(
          (t) => document.documentElement.dataset.theme === t,
          theme,
        );
        await main.waitForTimeout(180);
        await main.screenshot({
          path: out + "/notebook-" + locale + "-" + theme + ".png",
        });
      }
      await api(main, "settingsOpen", {
        tab: "actions",
        actionId: "dictionary",
      });
      await main.locator(".layout-field").waitFor();
      await main
        .locator(".layout-field")
        .evaluate((el) => el.scrollIntoView({ block: "start" }));
      for (const theme of ["light", "dark"]) {
        await api(main, "setTheme", { theme });
        await main.waitForFunction(
          (t) => document.documentElement.dataset.theme === t,
          theme,
        );
        await main.waitForTimeout(180);
        await main.locator(".layout-field").screenshot({
          path: out + "/commands-" + locale + "-" + theme + ".png",
        });
      }
      const titles = await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().map((w) => w.getTitle()),
      );
      assert.ok(titles.every((t) => t === (english ? "ReadFinch" : "伴读雀")));
      records.push({
        locale,
        notes: ids.length,
        titles,
        version: (await api(main, "snapshot")).version,
      });
    } finally {
      await app.close();
    }
  }
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/readme-assets-verification.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        records,
        rendererErrors: errors,
        scope:
          "Actual app windows; deterministic local text and suggestion responses for documentation. No external AI output, private account or user content.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "README assets rendered for English and Simplified Chinese, in light and dark.",
  );
} finally {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
