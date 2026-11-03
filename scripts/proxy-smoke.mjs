import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { proxyFixtures } from "./proxy-fixtures.mjs";

const packaged = process.argv.includes("--packaged");
const dataDir = path.resolve(".local/proxy-" + Date.now()),
  out = "docs/screenshots/current";
await mkdir(out, { recursive: true });
const f = await proxyFixtures(path.join(dataDir, "tls"));
const checks = [],
  errors = [];
const check = (text) => {
  checks.push(text);
  console.log(text);
};
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
let app, page, id;
async function launch() {
  app = await electron.launch({
    ...(packaged
      ? { executablePath: path.resolve("release/win-unpacked/ReadFinch.exe") }
      : {}),
    args: [
      ...(packaged ? [] : ["."]),
      "--settings",
      "--data-dir=" + dataDir,
      "--ignore-certificate-errors-spki-list=" + f.spki,
    ],
    env,
  });
  app.on("window", (p) => p.on("pageerror", (e) => errors.push(e.message)));
  page = await app.firstWindow();
  page.setDefaultTimeout(12000);
  await page.locator("main h1").waitFor();
}
const api = (method, arg) =>
  page.evaluate(({ method, arg }) => window.readfinch.call(method, arg), {
    method,
    arg,
  });
const state = () => api("snapshot");
async function update(edit) {
  const s = await state();
  edit(s.config);
  return api("saveConfig", { config: s.config, revision: s.revision });
}
const patch = (fields) =>
  update((c) =>
    Object.assign(
      c.providers.find((p) => p.id === id),
      fields,
    ),
  );
async function until(predicate, message) {
  for (let n = 0; n < 160; n++) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error("Timed out: " + message);
}
const saved = (mode) =>
  until(
    async () =>
      (await state()).config.providers.find((p) => p.id === id).proxy.mode ===
      mode,
    "proxy autosave",
  );
const proxySelect = () =>
  page.getByRole("combobox", { name: "提供商代理", exact: true });
async function job(method, arg, cancelAfterPartial = false) {
  return page.evaluate(
    ({ method, arg, cancelAfterPartial }) =>
      new Promise((resolve, reject) => {
        const partial = [],
          id = arg.id;
        const timer = setTimeout(() => {
          off();
          reject(Error("Timed out waiting for proxy stream"));
        }, 12000);
        const off = window.readfinch.on("job", (event) => {
          if (event.id !== id) return;
          if (event.status === "streaming" && event.text) {
            partial.push(event.text);
            if (cancelAfterPartial) void window.readfinch.call("cancel", { id });
          }
          if (["done", "error", "cancelled"].includes(event.status)) {
            clearTimeout(timer);
            off();
            resolve({ event, partial });
          }
        });
        window.readfinch.call(method, arg).catch((error) => {
          clearTimeout(timer);
          off();
          reject(error);
        });
      }),
    { method, arg, cancelAfterPartial },
  );
}
const action = (text = "A sentence.", providerId = id) => ({
  id: randomUUID(),
  actionId: "translate",
  text,
  context: "",
  sourceLanguage: "English",
  targetLanguage: "简体中文",
  providerId,
  refresh: true,
});
async function modelsThrough(name) {
  const before = f.proxyRequests.length;
  assert.deepEqual(await api("listModels", { profileId: id }), [
    "fixture-model",
  ]);
  if (name)
    assert.ok(
      f.proxyRequests.slice(before).some((r) => r.name === name),
      "Expected proxy " + name,
    );
  else
    assert.equal(
      f.proxyRequests.length,
      before,
      "Direct requests must not reach any proxy",
    );
}
try {
  await launch();
  let s = await state();
  id = s.config.providers[0].id;
  assert.deepEqual(s.config.providers[0].proxy, {
    mode: "system",
    address: "",
  });
  await update((c) => {
    c.appearance.language = "zh-CN";
    c.appearance.theme = "light";
    c.selection.automatic = false;
    c.shortcuts = { selection: "", capture: "", clipboard: "" };
    c.actions.forEach((a) => {
      a.shortcut = "";
    });
    c.cache.enabled = false;
    Object.assign(c.providers[0], {
      endpoint: f.httpOrigin + "/v1",
      model: "fixture-model",
      customModel: true,
      requiresKey: false,
      stream: true,
      timeoutMs: 3000,
    });
  });
  await api("settingsOpen", { tab: "text" });
  await page.locator("summary").filter({ hasText: "高级选项" }).click();
  assert.equal(await proxySelect().inputValue(), "system");
  await proxySelect().selectOption("custom");
  await saved("custom");
  await assert.rejects(() => api("listModels", { profileId: id }), /代理地址/);
  await page
    .getByRole("textbox", { name: "代理地址", exact: true })
    .fill(f.proxyA);
  await until(
    async () => (await state()).config.providers[0].proxy.address === f.proxyA,
    "address autosave",
  );
  for (const theme of ["light", "dark"]) {
    await api("setTheme", { theme });
    await page
      .locator(".provider-proxy")
      .screenshot({ path: out + "/provider-proxy-" + theme + ".png" });
  }
  await api("setTheme", { theme: "light" });
  await modelsThrough("A");
  await api("testText", { profileId: id });
  assert.equal(f.originRequests.at(-1).route, "A");
  const stream = await job("runAction", action());
  assert.equal(stream.event.status, "done");
  assert.ok(stream.partial.length >= 2);
  assert.equal(stream.partial.at(-1), "proxy result");
  const vision = await job("testVision", { id: randomUUID(), profileId: id });
  assert.equal(vision.event.status, "done");
  assert.ok(
    f.originRequests
      .at(-1)
      .body.messages[0].content.some((c) => c.type === "image_url"),
  );
  await update((c) => {
    c.languageDetection = { mode: "llm", providerId: id };
    c.tts.onlineProviderId = id;
  });
  assert.equal(
    await api("detectLanguage", {
      text: "Bonjour, ceci est une phrase française.",
    }),
    "fr",
  );
  const speechId = randomUUID();
  await api("speechBegin", { id: speechId });
  const audio = await api("speechAudio", {
    id: speechId,
    providerId: id,
    voice: "alloy",
    text: "Test",
    speed: 1,
  });
  assert.ok(Object.keys(audio.bytes).length > 0);
  await api("speechEnd", { id: speechId });
  assert.equal(f.originRequests.at(-1).path, "/v1/audio/speech");
  assert.ok(f.originRequests.every((r) => r.route === "A"));
  await update((c) => {
    c.tts.onlineProviderId = null;
    c.languageDetection = { mode: "basic" };
  });
  check(
    "Custom proxy autosaves and routes model discovery, connection tests, streamed text, vision, language detection and speech",
  );

  // Override only this disposable Electron session, never the operating system proxy.
  await app.evaluate(async ({ session }, address) => {
    await session.defaultSession.setProxy({
      mode: "fixed_servers",
      proxyRules: address,
      proxyBypassRules: "<-loopback>",
    });
    await session.defaultSession.closeAllConnections();
  }, f.proxyB);
  await proxySelect().selectOption("system");
  await saved("system");
  await modelsThrough("B");
  await proxySelect().selectOption("direct");
  await saved("direct");
  await modelsThrough();
  await proxySelect().selectOption("custom");
  await saved("custom");
  assert.equal(
    await page
      .getByRole("textbox", { name: "代理地址", exact: true })
      .inputValue(),
    f.proxyA,
  );
  await modelsThrough("A");
  check(
    "Global follows the app's system session; disabled bypasses it; switching modes retains the custom address",
  );

  const copied = await api("duplicateProvider", {
    id,
    revision: (await state()).revision,
  });
  assert.deepEqual(
    copied.snapshot.config.providers.find((p) => p.id === copied.id).proxy,
    { mode: "custom", address: f.proxyA },
  );
  await update((c) => {
    c.providers.find((p) => p.id === copied.id).proxy.address = f.proxyB;
  });
  const before = f.proxyRequests.length;
  const concurrent = await Promise.all([
    job("runAction", action("concurrent A")),
    job("runAction", action("concurrent B", copied.id)),
  ]);
  assert.ok(concurrent.every((r) => r.event.status === "done"));
  assert.ok(f.proxyRequests.slice(before).some((r) => r.name === "A"));
  assert.ok(f.proxyRequests.slice(before).some((r) => r.name === "B"));
  const pending = job("runAction", action("hold-proxy continues on A"));
  await until(
    () =>
      f.originRequests.some((r) =>
        JSON.stringify(r.body).includes("hold-proxy continues"),
      ),
    "original route started",
  );
  await patch({ proxy: { mode: "custom", address: f.proxyB } });
  await modelsThrough("B");
  assert.equal((await pending).event.status, "done");
  check(
    "Copied providers retain proxy settings; concurrent providers and changes during a stream stay isolated",
  );

  await patch({
    endpoint: f.httpsOrigin + "/v1",
    proxy: { mode: "custom", address: f.proxyA },
  });
  await modelsThrough("A");
  assert.ok(
    f.proxyRequests.some((r) => r.name === "A" && r.method === "CONNECT"),
  );
  await patch({ proxy: { mode: "custom", address: f.httpsProxy } });
  await modelsThrough("TLS");
  for (const version of [4, 5]) {
    await patch({
      endpoint: f.httpOrigin + "/v1",
      proxy: {
        mode: "custom",
        address: f.socksAddress.replace("socks5", "socks" + version),
      },
    });
    await modelsThrough("SOCKS" + version);
  }
  check(
    "HTTPS destinations use CONNECT; HTTPS proxies and SOCKS4/SOCKS5 proxies carry real loopback requests",
  );

  await patch({ proxy: { mode: "custom", address: f.proxyA } });
  const cancelled = await job("runAction", action("hold-proxy cancel"), true);
  assert.equal(cancelled.event.status, "cancelled");
  const prior = f.originRequests.length;
  await patch({ proxy: { mode: "custom", address: "http://127.0.0.1:1" } });
  await assert.rejects(
    () => api("listModels", { profileId: id }),
    /代理设置|超时/,
  );
  assert.equal(
    f.originRequests.length,
    prior,
    "A failed proxy must not fall back to direct",
  );
  await patch({ proxy: { mode: "custom", address: "" } });
  await assert.rejects(() => api("testText", { profileId: id }), /代理地址/);
  assert.equal(f.originRequests.length, prior);
  check(
    "Streaming cancellation works through the proxy; failed or empty custom proxies never fall back to direct",
  );

  await patch({ proxy: { mode: "custom", address: f.proxyA } });
  await app.close();
  app = undefined;
  await launch();
  assert.deepEqual(
    (await state()).config.providers.find((p) => p.id === id).proxy,
    { mode: "custom", address: f.proxyA },
  );
  await modelsThrough("A");
  assert.deepEqual(errors, []);
  check(
    "Saved per-provider proxy settings survive restart without renderer errors",
  );
  const version = JSON.parse(await readFile("package.json", "utf8")).version;
  await writeFile(
    "docs/" +
      (packaged
        ? "packaged-proxy-verification.json"
        : "proxy-verification.json"),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        version,
        checks,
        rendererErrors: errors,
        scope:
          "Isolated Electron profile and local HTTP/HTTPS/SOCKS proxies. System proxy is simulated by configuring only the isolated default session; OS settings and real provider credentials are untouched. TLS trust is pinned to the disposable fixture key.",
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await app?.close();
  await f.close();
}
