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
const server = createServer((req, res) => {
  if (req.url !== "/v1/models") {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ data: ids.map((id) => ({ id })) }));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let app;
try {
  app = await electron.launch({
    ...(packaged ? { executablePath: path.resolve(executable) } : {}),
    args: [...(packaged ? [] : ["."]), "--settings", "--data-dir=" + dir],
    env,
  });
  const page = await app.firstWindow(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.locator("main h1").waitFor();
  await page.evaluate(async (endpoint) => {
    const state = await window.readfinch.call("snapshot");
    state.config.appearance.language = "zh-CN";
    state.config.selection.automatic = false;
    state.config.shortcuts = { selection: "", capture: "", clipboard: "" };
    state.config.actions.forEach((a) => (a.shortcut = ""));
    Object.assign(state.config.providers[0], {
      endpoint,
      requiresKey: false,
      proxy: { mode: "direct", address: "" },
    });
    await window.readfinch.call("saveConfig", {
      config: state.config,
      revision: state.revision,
    });
    await window.readfinch.call("settingsOpen", { tab: "text" });
  }, `http://127.0.0.1:${server.address().port}/v1`);
  const custom = page.getByRole("checkbox", { name: "输入自定义模型 ID" });
  const input = page.getByRole("combobox", {
    name: "自定义模型 ID",
    exact: true,
  });
  const info = page.locator(".model-capability-line");
  const caps = page.getByRole("combobox", { name: "模型能力", exact: true });
  await page.getByRole("button", { name: "获取模型列表", exact: true }).click();
  const options = page
    .getByRole("listbox", { name: "模型候选" })
    .getByRole("option");
  await options.filter({ hasText: ids[0] }).waitFor();
  assert.equal(await options.count(), ids.length);
  await options.filter({ hasText: ids[0] }).click();
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
  assert.deepEqual(errors, []);
  console.log(
    "Exact ID, context, text fallback, advanced override and speech controls passed: " +
      dir,
  );
} finally {
  await app?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
