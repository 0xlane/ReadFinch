import { _electron as electron } from "playwright";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const packaged = process.argv.includes("--packaged");
const dir = path.resolve(
  ".local/credentials-" + (packaged ? "packaged-" : "") + Date.now(),
);
await mkdir(dir, { recursive: true });
const requests = [],
  checks = [],
  errors = [];
const server = createServer(async (req, res) => {
  for await (const chunk of req) {
    /* Consume the fixture request. */
  }
  requests.push({
    auth: req.headers.authorization,
    project: req.headers["x-project"],
  });
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({ choices: [{ message: { content: "Fixture OK" } }] }),
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const endpoint = `http://127.0.0.1:${server.address().port}/v1`;
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const call = (method, arg) =>
  page.evaluate(({ method, arg }) => window.readfinch.call(method, arg), {
    method,
    arg,
  });
const check = (message) => {
  checks.push(message);
  console.log(message);
};
async function until(predicate, label) {
  for (let n = 0; n < 150; n++) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Timed out: " + label);
}
async function launch() {
  app = await electron.launch({
    ...(packaged
      ? {
          executablePath: path.resolve(
            "release/mac/ReadFinch.app/Contents/MacOS/ReadFinch",
          ),
        }
      : {}),
    args: [...(packaged ? [] : ["."]), `--data-dir=${dir}`, "--settings"],
    env,
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.waitForFunction(() => document.querySelector("main h1"));
  const state = await call("snapshot");
  if (state.interfaceLocale !== "zh-CN") {
    state.config.appearance.language = "zh-CN";
    await call("saveConfig", {
      config: state.config,
      revision: state.revision,
    });
  }
  // A fresh profile and all subsequent writes must work with no encryption API.
  await app.evaluate(({ safeStorage }) => {
    for (const method of [
      "encryptString",
      "encryptStringAsync",
      "decryptString",
      "decryptStringAsync",
      "isEncryptionAvailable",
      "isAsyncEncryptionAvailable",
    ])
      safeStorage[method] = () => {
        throw Error("OS credential storage disabled in fixture");
      };
  });
  await page.getByRole("button", { name: "API 提供商", exact: true }).click();
}
const key = () => page.getByLabel("text:text-default API Key", { exact: true });
const show = () =>
  page.getByRole("checkbox", { name: "显示密钥", exact: true });
try {
  await launch();
  await page.getByLabel("API 基础地址", { exact: true }).fill(endpoint);
  await until(
    async () =>
      (await call("snapshot")).config.providers[0].endpoint === endpoint,
    "endpoint saved",
  );
  await show().check();
  await key().fill("fixture-key-one");
  await until(
    async () =>
      (await call("snapshot")).credentialIds.includes("text:text-default"),
    "key autosaved",
  );
  await until(
    async () => (await key().inputValue()) === "fixture-key-one",
    "saved key remains visible",
  );
  await show().uncheck();
  assert.equal(await key().getAttribute("type"), "password");
  await until(
    async () => (await key().inputValue()) === "",
    "hidden saved value removed from field",
  );
  await show().check();
  await until(
    async () => (await key().inputValue()) === "fixture-key-one",
    "reveal saved key",
  );
  await key().fill("fixture-key-two");
  await until(
    async () =>
      (await call("getCredential", {
        id: "text:text-default",
        expectedScope: endpoint,
      })) === "fixture-key-two",
    "edited key saved",
  );
  await call("providerHeaders", {
    id: "text-default",
    endpoint,
    value: '{"X-Project":"fixture-project"}',
  });
  await call("saveSync", {
    enabled: false,
    url: "https://dav.invalid",
    username: "fixture",
    remotePath: "settings.json",
    password: "fixture-dav",
  });
  await page.getByRole("button", { name: "测试连接", exact: true }).click();
  await until(() => requests.length > 0, "connection test");
  assert.equal(requests.at(-1).auth, "Bearer fixture-key-two");
  assert.equal(requests.at(-1).project, "fixture-project");
  check(
    "密钥自动保存、显示/隐藏、编辑及带凭据的真实本机 HTTP 连接通过（OS 加密 API 已禁用）",
  );
  const plaintext = JSON.parse(
    await readFile(path.join(dir, "credentials.json"), "utf8"),
  );
  assert.equal(plaintext["text:text-default"].value, "fixture-key-two");
  assert.equal(plaintext.webdav.value, "fixture-dav");
  assert.doesNotMatch(
    await readFile(path.join(dir, "config.json"), "utf8"),
    /fixture-key|fixture-project|fixture-dav/,
  );
  assert.doesNotMatch(
    JSON.stringify(await call("snapshot")),
    /fixture-key|fixture-project|fixture-dav/,
  );
  await page.screenshot({ path: path.join(dir, "saved-key.png") });
  await app.close();
  app = undefined;
  await launch();
  assert.equal(await show().isChecked(), false);
  await show().check();
  await until(
    async () => (await key().inputValue()) === "fixture-key-two",
    "restart reveals key",
  );
  assert.equal((await call("snapshot")).sync.hasPassword, true);
  assert.match(
    await call("providerHeaders", { id: "text-default", endpoint }),
    /fixture-project/,
  );
  check(
    "真实重启后密钥、请求头和 WebDAV 密码保留，查看开关默认关闭，普通配置及快照不包含密钥",
  );
  const state = await call("snapshot");
  const copy = await call("duplicateProvider", {
    id: "text-default",
    revision: state.revision,
  });
  assert.equal(
    await call("getCredential", {
      id: "text:" + copy.id,
      expectedScope: endpoint,
    }),
    "fixture-key-two",
  );
  await page
    .getByLabel("API 基础地址", { exact: true })
    .fill(endpoint + "/changed");
  await until(
    async () =>
      (await call("snapshot")).config.providers[0].endpoint ===
      endpoint + "/changed",
    "changed endpoint",
  );
  assert.equal(await show().isChecked(), false);
  await show().check();
  assert.equal(await key().inputValue(), "");
  assert.equal(
    await call("getCredential", {
      id: "text:text-default",
      expectedScope: endpoint + "/changed",
    }),
    "",
  );
  await assert.rejects(
    call("getCredential", { id: "text:text-default", expectedScope: endpoint }),
    /服务地址已改变/,
  );
  await page.getByLabel("API 基础地址", { exact: true }).fill(endpoint);
  await until(
    async () =>
      (await call("snapshot")).credentialIds.includes("text:text-default"),
    "original scope restored",
  );
  await show().check();
  await until(
    async () => (await key().inputValue()) === "fixture-key-two",
    "restored endpoint key",
  );
  await page.getByRole("button", { name: "移除凭据", exact: true }).click();
  await until(
    async () =>
      !(await call("snapshot")).credentialIds.includes("text:text-default"),
    "key removed",
  );
  assert.equal(await key().inputValue(), "");
  check("复制提供商保留凭据；切换服务地址不显示或发送原密钥；删除立即生效");
  await call("panelOpen", { source: "empty" });
  await until(
    () => app.windows().some((p) => p.url().includes("mode=panel")),
    "panel window",
  );
  const panel = app.windows().find((p) => p.url().includes("mode=panel"));
  await assert.rejects(
    panel.evaluate(
      ({ id, expectedScope }) =>
        window.readfinch.call("getCredential", { id, expectedScope }),
      { id: "text:" + copy.id, expectedScope: endpoint },
    ),
    /凭据字段无效/,
  );
  check("结果浮窗不能读取已保存密钥，仅设置窗口可读取");
  const platform = await app.evaluate(({ systemPreferences, app }) => ({
    os: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    accessibility:
      process.platform === "darwin"
        ? systemPreferences.isTrustedAccessibilityClient(false)
        : null,
    screenRecording:
      process.platform === "darwin"
        ? systemPreferences.getMediaAccessStatus("screen")
        : null,
    version: app.getVersion(),
    packaged: app.isPackaged,
  }));
  const native = await call("snapshot");
  await app.close();
  app = undefined;
  await launch();
  assert.equal(
    await call("getCredential", {
      id: "text:text-default",
      expectedScope: endpoint,
    }),
    "",
  );
  check("删除后重启不会恢复旧密钥");
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(dir, "result.json"),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        platform,
        nativeState: native.nativeState,
        nativeStatus: native.nativeStatus,
        checks,
        errors,
      },
      null,
      2,
    ),
  );
  console.log("Report:", path.join(dir, "result.json"));
} finally {
  await app?.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
