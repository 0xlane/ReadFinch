import { _electron as electron } from "playwright";
import { createServer, request } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const packaged = process.argv.includes("--packaged"),
  dataDir = path.resolve(".local/provider-integration-" + Date.now()),
  checks = [],
  errors = [],
  calls = [];
await mkdir(dataDir, { recursive: true });
const origin = createServer(async (req, res) => {
  let raw = "";
  for await (const c of req) raw += c;
  const body = raw ? JSON.parse(raw) : null;
  calls.push({ url: req.url, body, proxy: req.headers["x-fixture-proxy"] });
  if (req.url.startsWith("/translate")) {
    assert.ok(!raw.includes("Translate into"));
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify([[["你好，来自纯翻译。", "Hello"]]]));
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.write(
    "data: " +
      JSON.stringify({
        candidates: [
          { index: 0, content: { role: "model", parts: [{ text: "你好，" }] } },
        ],
      }) +
      "\n\n",
  );
  setTimeout(
    () =>
      res.end(
        "data: " +
          JSON.stringify({
            candidates: [
              {
                index: 0,
                content: { role: "model", parts: [{ text: "来自 Gemini。" }] },
                finishReason: "STOP",
              },
            ],
          }) +
          "\n\n",
      ),
    80,
  );
});
const proxy = createServer((req, res) => {
  const target = new URL(req.url),
    pass = request(
      target,
      {
        method: req.method,
        headers: {
          ...req.headers,
          "x-fixture-proxy": "yes",
          host: target.host,
        },
      },
      (upstream) => {
        res.writeHead(upstream.statusCode, upstream.headers);
        upstream.pipe(res);
      },
    );
  pass.on("error", () => {
    res.writeHead(502);
    res.end();
  });
  req.pipe(pass);
});
const listen = (s) => new Promise((r) => s.listen(0, "127.0.0.1", r));
await listen(origin);
await listen(proxy);
const endpoint = "http://127.0.0.1:" + origin.address().port;
const env = { ...process.env, READFINCH_TEST_HOOKS: "1" };
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({
    ...(packaged
      ? { executablePath: path.resolve("release/win-unpacked/ReadFinch.exe") }
      : { args: [] }),
    args: [...(packaged ? [] : ["."]), "--settings", "--data-dir=" + dataDir],
    env,
  });
  app.on("window", (p) => p.on("pageerror", (e) => errors.push(e.message)));
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  await page.locator("main h1").waitFor();
  const api = (method, arg) =>
    page.evaluate(({ method, arg }) => window.readfinch.call(method, arg), {
      method,
      arg,
    });
  let s = await api("snapshot"),
    template = s.config.providers[0];
  s.config.appearance.language = "zh-CN";
  s.config.appearance.theme = "light";
  s.config.selection.automatic = true;
  s.config.noteSuggestion.enabled = false;
  s.config.shortcuts = { input: "", selection: "", capture: "", clipboard: "" };
  s.config.actions.forEach((a) => (a.shortcut = ""));
  s.config.providers.push(
    {
      ...template,
      id: "native-fixture",
      name: "Gemini fixture",
      preset: "gemini",
      model: "fixture",
      requiresKey: false,
      stream: true,
      endpoint: endpoint + "/v1beta",
      proxy: {
        mode: "custom",
        address: "http://127.0.0.1:" + proxy.address().port,
      },
    },
    {
      ...template,
      id: "translation-fixture",
      name: "Google fixture",
      preset: "google-translate",
      model: "",
      requiresKey: false,
      endpoint: endpoint + "/translate",
      proxy: { mode: "direct", address: "" },
    },
  );
  s.config.actions.find((a) => a.id === "translate").providerId =
    "translation-fixture";
  await api("saveConfig", { config: s.config, revision: s.revision });
  await api("testText", { profileId: "native-fixture" });
  assert.ok(calls.at(-1).proxy === "yes");
  checks.push(
    "Native Gemini streaming connection test uses the configured desktop proxy",
  );
  const image = "data:image/png;base64,iVBORw0KGgo=";
  await page.evaluate(
    ({ image }) =>
      new Promise((resolve, reject) => {
        const id = crypto.randomUUID(),
          timer = setTimeout(() => reject(Error("OCR timeout")), 10000);
        const off = window.readfinch.on("job", (e) => {
          if (e.id !== id || !["done", "error", "cancelled"].includes(e.status))
            return;
          clearTimeout(timer);
          off();
          e.status === "done" ? resolve() : reject(Error(e.message));
        });
        window.readfinch
          .call("recognize", {
            id,
            profileId: "native-fixture",
            dataUrl: image,
          })
          .catch(reject);
      }),
    { image },
  );
  assert.match(JSON.stringify(calls.at(-1).body), /iVBORw0KGgo=/);
  checks.push(
    "Desktop OCR reaches native Gemini with image data and the same proxy",
  );
  if (packaged)
    await api("panelOpen", { source: "action-test", actionId: "translate" });
  else
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes("mode=main"))
        .show();
      globalThis.__readfinchTest.select({
        token: "provider-fixture",
        text: "Hello",
        app: "Provider fixture",
        x: 600,
        y: 260,
        canReplace: false,
      });
    });
  const windowMode = async (mode) => {
    for (let i = 0; i < 100; i++) {
      const p = app.windows().find((p) => p.url().includes("mode=" + mode));
      if (p) return p;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw Error("Missing window " + mode);
  };
  if (!packaged) {
    const pill = await windowMode("pill");
    await pill.getByRole("button", { name: "翻译", exact: true }).click();
  }
  const panel = await windowMode("panel");
  panel.setDefaultTimeout(15000);
  if (packaged) {
    await panel.getByLabel("原文", { exact: true }).fill("Hello");
    await panel
      .getByRole("button", { name: "测试「翻译」", exact: true })
      .click();
  }
  await panel.getByText("你好，来自纯翻译。", { exact: true }).waitFor();
  const field = panel.getByRole("combobox", {
    name: "文字提供商",
    exact: true,
  });
  await field.selectOption("native-fixture");
  await panel.getByText("你好，来自 Gemini。", { exact: true }).waitFor();
  await field.selectOption("translation-fixture");
  await panel.getByText("你好，来自纯翻译。", { exact: true }).waitFor();
  assert.equal(
    calls.filter((c) => c.url.startsWith("/translate")).length,
    1,
    "Pure translations are cached",
  );
  checks.push(
    (packaged ? "Command trial" : "Selection translation") +
      " works without a model; switching between native and pure providers updates the result and reuses cache",
  );
  await panel.screenshot({
    path: "docs/screenshots/current/translation-service-result.png",
  });
  const dictionary = panel.getByRole("button", { name: "词典", exact: true });
  if (await dictionary.count()) {
    await dictionary.click();
    assert.equal(
      await panel
        .getByRole("combobox", { name: "文字提供商", exact: true })
        .locator('option[value="translation-fixture"]')
        .count(),
      0,
    );
  }
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/" + (packaged ? "packaged-" : "") + "provider-integration.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        version: (await api("snapshot")).version,
        checks,
        rendererErrors: errors,
        scope:
          "Isolated Electron profile, local HTTP origin and proxy; no paid provider credentials.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(checks.join("\n"));
} finally {
  await app?.close();
  for (const server of [origin, proxy]) {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}
