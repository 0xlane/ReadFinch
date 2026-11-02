import { _electron as electron } from "playwright";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const packaged = process.argv.includes("--packaged");
const out = "docs/screenshots/v0.9",
  dir = path.resolve(".local/schema-" + Date.now());
await mkdir(out, { recursive: true });
await mkdir(dir, { recursive: true });
const requests = [],
  errors = [],
  checks = [];
let invalid = false,
  held = false;
const release = Promise.withResolvers(),
  source = "A close reading reveals a second meaning.";
const server = createServer(async (req, res) => {
  let raw = "";
  for await (const c of req) raw += c;
  const body = JSON.parse(raw);
  requests.push(body);
  assert.deepEqual(body.response_format?.json_schema?.schema.required, [
    "释义",
    "熟悉度",
  ]);
  assert.match(body.messages[1].content, /A close reading/);
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  const part = (v) =>
    res.write(
      "data: " +
        JSON.stringify({ choices: [{ delta: { content: v } }] }) +
        "\n\n",
    );
  part('{"释义":"细读');
  if (!held) {
    held = true;
    await release.promise;
  }
  part('揭示了另一层含义。","熟悉度":' + (invalid ? '"错误"' : "0") + "}");
  res.end("data: [DONE]\n\n");
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  ...(packaged
    ? { executablePath: path.resolve("release/win-unpacked/TextHop.exe") }
    : {}),
  args: [...(packaged ? [] : ["."]), "--data-dir=" + dir],
  env,
});
app.on("window", (w) => w.on("pageerror", (e) => errors.push(e.message)));
const main = await app.firstWindow();
main.setDefaultTimeout(10000);
const api = (page, method, arg) =>
  page.evaluate(({ method, arg }) => window.texthop.call(method, arg), {
    method,
    arg,
  });
const log = (s) => {
  checks.push(s);
  console.log(s);
};
const dialog = (title) =>
  main.getByRole("dialog", { name: title, exact: true });
const btn = (page, name) => page.getByRole("button", { name, exact: true });
const close = (dlg) => btn(dlg, "关闭").click();
async function stored(fn) {
  for (let i = 0; i < 80; i++) {
    const cfg = (await api(main, "snapshot")).config;
    if (fn(cfg)) return cfg;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Timed out waiting for the saved command");
}
try {
  const snapshot = await api(main, "snapshot");
  Object.assign(snapshot.config.appearance, {
    language: "zh-CN",
    theme: "light",
  });
  Object.assign(snapshot.config.providers[0], {
    model: "schema-fixture",
    endpoint: "http://127.0.0.1:" + server.address().port + "/v1",
    requiresKey: false,
  });
  snapshot.config.localNotebases.push({
    id: "reading",
    name: "精读笔记",
    columns: [
      { id: "definition", name: "释义", type: "string" },
      { id: "score", name: "评分", type: "number" },
      { id: "quote", name: "原文", type: "string" },
    ],
  });
  await api(main, "saveConfig", {
    config: snapshot.config,
    revision: snapshot.revision,
  });
  await main
    .getByRole("navigation")
    .getByRole("button", { name: "自定义 AI 指令", exact: true })
    .click();
  await btn(main.locator(".command-rail"), "翻译").click();
  await main.getByLabel("翻译提供商", { exact: true }).waitFor();
  await main.getByLabel("目标语言", { exact: true }).waitFor();
  await main.screenshot({ path: out + "/translation-settings.png" });
  await btn(main.locator(".command-rail"), "词典").click();
  assert.equal(
    await main.getByLabel("指令名称", { exact: true }).getAttribute("readonly"),
    "",
  );
  assert.equal(await main.locator(".schema-row").count(), 9);
  await btn(main, "定制化").click();
  await main.getByLabel("指令名称", { exact: true }).fill("词典测试副本");
  assert.equal(await main.locator(".schema-row").count(), 9);
  log(
    "The three built-ins are read-only; Customize creates an editable independent dictionary with nine fields.",
  );
  await btn(main, "添加 AI 指令").click();
  const chooser = dialog("添加指令");
  assert.deepEqual(
    await chooser.locator(".template-choices strong").allTextContents(),
    ["词典", "长难句分析", "写作改进", "空白"],
  );
  await main.screenshot({ path: out + "/command-templates.png" });
  await btn(chooser, "空白").click();
  await main.getByLabel("指令名称", { exact: true }).fill("精读卡");
  async function field(name, type, description) {
    await btn(main, "添加字段").click();
    const field = dialog("添加输出字段");
    await field.getByLabel("字段名", { exact: true }).fill(name);
    await field.getByLabel("字段类型", { exact: true }).selectOption(type);
    if (description)
      await field.getByLabel("描述", { exact: true }).fill(description);
    await btn(field, "保存").click();
  }
  await btn(main, "编辑字段「结果」").click();
  let editor = dialog("编辑输出字段");
  await editor.getByLabel("字段名", { exact: true }).fill("含义");
  await btn(editor, "保存").click();
  await field("熟悉度", "number", "按 0 到 5 评分，未知时返回 null。");
  await field("原文", "selection");
  await main.getByRole("button", { name: "移动字段「原文」" }).press("ArrowUp");
  await main.getByRole("button", { name: "移动字段「原文」" }).press("ArrowUp");
  await btn(main, "编辑字段「含义」").click();
  editor = dialog("编辑输出字段");
  await editor.getByLabel("字段名", { exact: true }).fill("熟悉度");
  assert.ok(await btn(editor, "保存").isDisabled());
  await editor.getByLabel("字段名", { exact: true }).fill("ctx");
  assert.ok(await btn(editor, "保存").isDisabled());
  await btn(editor, "取消").click();
  await btn(main, "编辑版式").click();
  let studio = dialog("编辑版式");
  const code = studio.getByRole("textbox", {
    name: "HTML + Liquid",
    exact: true,
  });
  const layout =
    '<article><small>READING NOTES</small><h2>{{ ["含义"] }}</h2><p>{{ ["原文"] }}</p><b>熟悉度 · {{ ["熟悉度"] }}</b><details open><summary>展开分析</summary><p>{{ ["原文"] }}</p></details></article>';
  await code.fill(layout);
  await close(studio);
  await btn(main, "编辑字段「含义」").click();
  editor = dialog("编辑输出字段");
  await editor.getByLabel("字段名", { exact: true }).fill("释义");
  await btn(editor, "保存").click();
  const cfg = await stored((c) =>
    c.actions.find((a) => a.name === "精读卡")?.layout.includes('["释义"]'),
  );
  const command = cfg.actions.find((a) => a.name === "精读卡");
  assert.deepEqual(
    command.outputSchema.map((f) => f.name),
    ["原文", "释义", "熟悉度"],
  );
  log(
    "Fields add, reorder and rename. Duplicate and reserved names are rejected and Liquid references follow renames.",
  );
  await btn(main, "示例数据").click();
  const sample = dialog("示例数据");
  await sample.getByLabel("选中的文字", { exact: true }).fill(source);
  await sample
    .getByLabel("释义", { exact: true })
    .fill("细读揭示了另一层含义。");
  await sample.getByLabel("熟悉度", { exact: true }).fill("3");
  await btn(sample, "应用").click();
  await btn(main, "深色预览").click();
  await btn(main, "重放").click();
  await main
    .locator('.preview-card .action-card[data-status="streaming"]')
    .waitFor({ state: "attached" });
  await main
    .locator('.preview-card .action-card[data-status="done"]')
    .waitFor({ state: "attached" });
  await main
    .locator(".preview-card")
    .getByRole("heading", { name: "细读揭示了另一层含义。" })
    .waitFor();
  await main
    .locator(".preview-card")
    .getByText("熟悉度 · 3", { exact: true })
    .waitFor();
  await main
    .locator(".output-fields")
    .evaluate((el) => el.scrollIntoView({ block: "start" }));
  await main.screenshot({ path: out + "/command-output-schema.png" });
  await btn(main, "编辑版式").click();
  studio = dialog("编辑版式");
  await btn(studio, "深色预览").click();
  await main.screenshot({ path: out + "/command-layout-studio.png" });
  await studio
    .getByRole("textbox", { name: "HTML + Liquid", exact: true })
    .fill(
      '<script>alert(1)</script><img src="https://127.0.0.1/probe"><b onclick="alert(1)">{{ ["释义"] }}</b>',
    );
  await studio.getByText("已移除版式中不支持的标签或属性。").waitFor();
  assert.equal(
    await studio
      .locator(".schema-result")
      .evaluate(
        (el) => el.shadowRoot.querySelectorAll("script,img,[onclick]").length,
      ),
    0,
  );
  await studio
    .getByRole("textbox", { name: "HTML + Liquid", exact: true })
    .fill("{% if");
  await studio.getByText(/版式无法显示/).waitFor();
  await studio
    .getByRole("textbox", { name: "HTML + Liquid", exact: true })
    .fill(command.layout);
  await close(studio);
  log(
    "The same renderer previews sample numbers, light/dark, replay, sanitized HTML and a fallback for invalid Liquid.",
  );
  await main.getByRole("tab", { name: "笔记库", exact: true }).click();
  await btn(main, "新建笔记库").click();
  const createDialog = dialog("新建笔记库");
  await createDialog.getByLabel("笔记库名称").fill("指令练习");
  await createDialog.locator("summary").click();
  await createDialog.getByLabel("新建列「熟悉度」").fill("等级");
  const meaningField = command.outputSchema.find((f) => f.name === "释义");
  await createDialog.getByLabel("笔记标题").selectOption(meaningField.id);
  await btn(createDialog, "创建并连接").click();
  const createdCfg = await stored((c) =>
    c.localNotebases.some((b) => b.name === "指令练习"),
  );
  const created = createdCfg.localNotebases.find((b) => b.name === "指令练习");
  assert.equal(created.columns[0].name, "释义");
  assert.ok(
    created.columns.some((c) => c.name === "等级" && c.type === "number"),
  );
  await main.getByLabel("选择笔记库").selectOption("reading");
  assert.deepEqual(
    await main
      .getByLabel("映射字段「熟悉度」")
      .locator("option")
      .allTextContents(),
    ["选择字段", "不保存此字段", "评分"],
  );
  await main.getByLabel("映射字段「熟悉度」").selectOption("score");
  await stored((c) =>
    Object.values(
      c.actions.find((a) => a.id === command.id).noteConnection?.mappings ?? {},
    ).includes("score"),
  );
  await main.screenshot({ path: out + "/notebase-mapping.png" });
  await btn(main, "试用指令").click();
  let panel;
  for (let i = 0; i < 50 && !panel; i++) {
    panel = app.windows().find((w) => w.url().includes("mode=panel"));
    if (!panel) await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(panel);
  panel.setDefaultTimeout(10000);
  await panel.getByLabel("原文", { exact: true }).fill(source);
  await btn(panel, "测试「精读卡」").click();
  await panel.getByRole("heading", { name: "细读", exact: true }).waitFor();
  assert.equal(await btn(panel, "保存到本地笔记库").count(), 0);
  const detail = panel
    .locator(".schema-result details")
    .filter({ has: panel.getByText("展开分析") });
  assert.equal(await detail.evaluate((d) => d.open), true);
  await detail.locator("summary").click();
  release.resolve();
  await panel.getByText("熟悉度 · 0", { exact: true }).waitFor();
  assert.equal(await detail.evaluate((d) => d.open), false);
  await btn(panel, "保存到本地笔记库").click();
  await btn(panel, "在笔记库中查看").click();
  await main
    .locator(".note-detail")
    .getByRole("heading", { name: "细读揭示了另一层含义。" })
    .waitFor();
  const list = await api(main, "notesList", {
    search: "",
    notebook: "精读笔记",
    offset: 0,
  });
  assert.equal(list.total, 1);
  assert.equal(list.notes[0].source, "细读揭示了另一层含义。");
  const note = await api(main, "noteGet", { id: list.notes[0].id });
  assert.equal(JSON.parse(note.result).评分, 0);
  assert.equal(note.source, source);
  assert.match(note.outputView.layout, /评分/);
  log(
    "A real streamed command supplies local original text, displays the first field early, and saves a typed notebook snapshot.",
  );
  invalid = true;
  await api(main, "panelOpen", { source: "action-test", actionId: command.id });
  await panel.getByLabel("原文", { exact: true }).fill(source + " More.");
  await btn(panel, "测试「精读卡」").click();
  await panel.getByText(/字段「熟悉度」的类型应为 number/).waitFor();
  assert.equal(await btn(panel, "保存到本地笔记库").count(), 0);
  invalid = false;
  await btn(panel, "重新生成").click();
  await btn(panel, "保存到本地笔记库").waitFor();
  await api(main, "settingsOpen", { tab: "actions" });
  await btn(main.locator(".command-rail"), "精读卡").click();
  await btn(main, "删除指令").click();
  await btn(dialog("删除指令？"), "确认删除").click();
  await stored((c) => !c.actions.some((a) => a.id === command.id));
  await api(main, "settingsOpen", { tab: "notes", noteId: note.id });
  await main
    .locator(".note-detail")
    .getByText("熟悉度 · 0", { exact: true })
    .waitFor();
  log(
    "Wrong model types cannot be saved. Retrying works; the saved layout and note still render after deleting the command.",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/" + (packaged ? "packaged-" : "") + "action-schema-verification.json",
    JSON.stringify(
      {
        packaged,
        checks,
        requests: requests.length,
        rendererErrors: errors,
        date: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
  );
} catch (error) {
  console.error(await main.locator("dialog[open]").allTextContents());
  await main.screenshot({ path: dir + "/failed.png" });
  throw error;
} finally {
  release.resolve();
  await app.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
