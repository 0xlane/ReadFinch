import { _electron as electron } from "playwright";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const dataDir = path.resolve(".local/upgrade-" + Date.now());
await mkdir(dataDir, { recursive: true });
const requests = [],
  checks = [];
const server = createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  requests.push({ body, auth: req.headers.authorization });
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({ choices: [{ message: { content: "ReadFinch OK" } }] }),
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const endpoint = `http://127.0.0.1:${server.address().port}/v1`;
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const launch = async () => {
  app = await electron.launch({
    args: [".", `--data-dir=${dataDir}`, "--settings"],
    env,
  });
  page = await app.firstWindow();
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
  await page.getByRole("heading", { name: "通用", exact: true }).waitFor();
};
const call = (method, arg) =>
  page.evaluate(({ method, arg }) => window.readfinch.call(method, arg), {
    method,
    arg,
  });
try {
  // Produce genuine OS-encrypted test keys, then install the previous schema
  // while the app is closed. These are fixtures, never user credentials.
  await launch();
  const current = (await call("snapshot")).config;
  const encrypted = await app.evaluate(async ({ safeStorage }) => {
    return Promise.all(
      ["legacy-text-fixture", "legacy-vision-fixture"].map(async (key) =>
        (await safeStorage.encryptStringAsync(key)).toString("base64"),
      ),
    );
  });
  await app.close();
  app = undefined;
  await rm(path.join(dataDir, "credentials.json"));
  const { providers, languageDetection, cache, ...rest } = current;
  const {
    description,
    enabled,
    preset,
    temperature,
    customModel,
    instruction,
    proxy,
    ...oldText
  } = providers[0];
  const oldId = oldText.id;
  const legacy = {
    ...rest,
    schemaVersion: 2,
    textProfiles: [{ ...oldText, endpoint, model: "legacy-text-model" }],
    ocrProfiles: [
      {
        id: "ocr-offline",
        name: "本地文字识别",
        kind: "offline",
        endpoint: "http://localhost",
        model: "eng+chi_sim",
        requiresKey: false,
        timeoutMs: 120000,
        instruction,
      },
      {
        id: oldId,
        name: "旧视觉服务",
        kind: "openai",
        endpoint,
        model: "legacy-vision-model",
        requiresKey: true,
        timeoutMs: 60000,
        instruction,
      },
      {
        id: "retired-ollama",
        name: "旧本地模型",
        kind: "ollama",
        endpoint: "http://localhost:11434",
        model: "legacy-vision",
        requiresKey: false,
        timeoutMs: 60000,
        instruction,
      },
    ],
    defaults: { ...rest.defaults, ocrProfileId: oldId },
  };
  await writeFile(path.join(dataDir, "config.json"), JSON.stringify(legacy));
  await writeFile(
    path.join(dataDir, "credentials.enc.json"),
    JSON.stringify({
      ["text:" + oldId]: { ciphertext: encrypted[0], scope: endpoint },
      ["ocr:" + oldId]: { ciphertext: encrypted[1], scope: endpoint },
    }),
  );
  await launch();
  let state = await call("snapshot");
  assert.equal(state.config.schemaVersion, 17);
  assert.equal(state.config.providers.length, 2);
  const textProvider = state.config.providers.find(
    (p) => p.model === "legacy-text-model",
  );
  const visionProvider = state.config.providers.find(
    (p) => p.model === "legacy-vision-model",
  );
  assert.equal(textProvider.id, oldId);
  assert.notEqual(visionProvider.id, oldId);
  assert.equal(state.config.defaults.ocrProfileId, visionProvider.id);
  assert.deepEqual(
    state.credentialIds.sort(),
    ["text:" + textProvider.id, "text:" + visionProvider.id].sort(),
  );
  assert.equal(requests.length, 0);
  assert.deepEqual(
    JSON.parse(await readFile(path.join(dataDir, "config.json"), "utf8")),
    legacy,
  );
  checks.push(
    "Schema v2 upgrades providers and migrates legacy OS-encrypted credentials to local plain text without requests",
  );
  await call("testText", { profileId: textProvider.id });
  await page.evaluate(async (profileId) => {
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(Error("Vision test timed out"));
      }, 15000);
      const off = window.readfinch.on("job", (event) => {
        if (
          event.id !== id ||
          !["done", "error", "cancelled"].includes(event.status)
        )
          return;
        clearTimeout(timer);
        off();
        event.status === "done"
          ? resolve()
          : reject(Error(event.message ?? event.status));
      });
      window.readfinch.call("testVision", { id, profileId }).catch((error) => {
        clearTimeout(timer);
        off();
        reject(error);
      });
    });
  }, visionProvider.id);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].auth, "Bearer legacy-text-fixture");
  assert.equal(requests[1].auth, "Bearer legacy-vision-fixture");
  assert.equal(requests[1].body.model, "legacy-vision-model");
  assert.match(
    requests[1].body.messages[0].content[1].image_url.url,
    /^data:image\/png;base64,/,
  );
  checks.push(
    "Migrated text and vision credentials authenticate distinct real HTTP fixture requests, with actual PNG image input",
  );
  await call("saveConfig", { config: state.config, revision: state.revision });
  assert.deepEqual(
    JSON.parse(await readFile(path.join(dataDir, "config.json.bak"), "utf8")),
    legacy,
  );
  const saved = await readFile(path.join(dataDir, "config.json"), "utf8");
  assert.equal(JSON.parse(saved).schemaVersion, 17);
  assert.doesNotMatch(
    saved,
    /legacy-text-fixture|legacy-vision-fixture|ciphertext/,
  );
  assert.doesNotMatch(
    await readFile(path.join(dataDir, "credentials.enc.json"), "utf8"),
    /legacy-text-fixture|legacy-vision-fixture/,
  );
  const credentials = JSON.parse(
    await readFile(path.join(dataDir, "credentials.json"), "utf8"),
  );
  assert.equal(
    credentials["text:" + textProvider.id].value,
    "legacy-text-fixture",
  );
  assert.equal(
    credentials["text:" + visionProvider.id].value,
    "legacy-vision-fixture",
  );
  await app.close();
  app = undefined;
  await launch();
  state = await call("snapshot");
  assert.equal(state.config.providers.length, 2);
  assert.equal(state.config.defaults.ocrProfileId, visionProvider.id);
  assert.deepEqual(
    state.credentialIds.sort(),
    ["text:" + textProvider.id, "text:" + visionProvider.id].sort(),
  );
  assert.equal(requests.length, 2);
  checks.push(
    "First save backs up the original v2 config; schema v15 and local keys survive restart; portable config excludes credentials",
  );
  await app.close();
  app = undefined;
  const oldMulti = {
    ...current,
    schemaVersion: 4,
    providers: [
      {
        ...current.providers[0],
        id: oldId,
        endpoint,
        model: "daily",
        models: ["daily", "lookup", "vision"],
        visionModel: "vision",
      },
    ],
    defaults: { ...current.defaults, ocrProfileId: oldId },
    actions: current.actions.map((a) => ({
      ...a,
      model: a.id === "dictionary" ? "lookup" : "",
    })),
  };
  delete oldMulti.languageDetection;
  delete oldMulti.providers[0].proxy;
  await writeFile(path.join(dataDir, "config.json"), JSON.stringify(oldMulti));
  await launch();
  state = await call("snapshot");
  assert.equal(state.config.providers.length, 3);
  assert.equal(
    state.config.providers.find(
      (p) =>
        p.id ===
        state.config.actions.find((a) => a.id === "dictionary").providerId,
    ).model,
    "lookup",
  );
  assert.equal(
    state.config.providers.find(
      (p) => p.id === state.config.defaults.ocrProfileId,
    ).model,
    "vision",
  );
  for (const p of state.config.providers) {
    await call("testText", { profileId: p.id });
    assert.equal(requests.at(-1).body.model, p.model);
    assert.equal(requests.at(-1).auth, "Bearer legacy-text-fixture");
  }
  checks.push(
    "Schema v4 splits a multi-model account, retaining per-action and OCR bindings and endpoint-scoped local credentials on all three providers",
  );
  await writeFile(
    "docs/upgrade-verification.json",
    JSON.stringify(
      {
        version: JSON.parse(await readFile("package.json", "utf8")).version,
        date: new Date().toISOString(),
        checks,
        scope:
          "Actual Electron restart and OS safeStorage encryption, isolated schema v2/v4 fixtures, localhost HTTP requests; no user data used.",
      },
      null,
      2,
    ),
  );
  console.log("Upgrade smoke passed:", checks.length, "checks.");
} finally {
  await app?.close();
  server.close();
  server.closeAllConnections();
}
