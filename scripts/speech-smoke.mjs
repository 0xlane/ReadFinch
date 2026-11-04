import { _electron as electron } from "playwright";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const packaged = process.argv.includes("--packaged");
const dir = path.resolve(".local/speech-smoke-" + Date.now());
const pictures = "docs/screenshots/current";
await mkdir(dir, { recursive: true });
await mkdir(pictures, { recursive: true });
const requests = [],
  checks = [],
  errors = [];
const translated =
  "The reading voice follows the language of the translated sentence.";
let hold = false,
  aborted = 0;
function tone() {
  const samples = 6400,
    hz = 8000;
  const b = Buffer.alloc(44 + samples * 2);
  b.write("RIFF");
  b.writeUInt32LE(36 + samples * 2, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(hz, 24);
  b.writeUInt32LE(hz * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    b.writeInt16LE(
      Math.round(1500 * Math.sin((2 * Math.PI * 440 * i) / hz)),
      44 + i * 2,
    );
  return b;
}
const wav = tone();
const server = createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  requests.push({ path: req.url, ...body });
  if (req.url === "/v1/audio/speech") {
    if (hold) {
      res.on("close", () => {
        if (!res.writableEnded) aborted++;
      });
      return;
    }
    res.writeHead(200, { "content-type": "audio/wav" });
    res.end(wav);
  } else if (req.url === "/v1/chat/completions") {
    res.writeHead(200, { "content-type": "application/json" });
    if (body.audio) {
      res.end(
        JSON.stringify({
          choices: [{ message: { audio: { data: wav.toString("base64") } } }],
        }),
      );
      return;
    }
    res.end(
      JSON.stringify({
        choices: [{ message: { content: translated }, finish_reason: "stop" }],
      }),
    );
  } else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const env = { ...process.env, READFINCH_TEST_HOOKS: "1" };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  ...(packaged
    ? { executablePath: path.resolve("release/win-unpacked/ReadFinch.exe") }
    : {}),
  args: [...(packaged ? [] : ["."]), "--settings", "--data-dir=" + dir],
  env,
});
const main = await app.firstWindow();
const api = (page, method, arg) =>
  page.evaluate(({ method, arg }) => window.readfinch.call(method, arg), {
    method,
    arg,
  });
const button = (page, name) => page.getByRole("button", { name, exact: true });
async function until(check, reason, timeout = 18000) {
  const deadline = Date.now() + timeout;
  do {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 80));
  } while (Date.now() < deadline);
  throw Error(reason);
}
async function mode(name) {
  await until(
    () => app.windows().some((p) => p.url().includes("mode=" + name)),
    "missing " + name,
  );
  return app.windows().find((p) => p.url().includes("mode=" + name));
}
async function instrument(page) {
  await page.evaluate(() => {
    window.__voiceEvents = [];
    const record = (kind, data = {}) =>
      window.__voiceEvents.push({ kind, ...data });
    const native = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.speechSynthesis.speak = (u) => {
      const data = {
        voice: u.voice?.name,
        rate: u.rate,
        pitch: u.pitch,
        volume: u.volume,
        text: u.text,
      };
      for (const event of ["start", "end", "error"])
        u.addEventListener(event, () => record("system-" + event, data));
      native(u);
    };
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      for (const event of ["playing", "ended", "error"])
        this.addEventListener(
          event,
          () =>
            record("audio-" + event, {
              rate: this.playbackRate,
              preservesPitch: this.preservesPitch,
              volume: this.volume,
              blob: this.src.startsWith("blob:"),
            }),
          { once: true },
        );
      return play.call(this);
    };
  });
}
async function pickVoice(name, query) {
  const field = main.getByRole("combobox", { name, exact: true });
  await field.click();
  await field.fill(query);
  await main.getByRole("option").filter({ hasText: query }).first().click();
}
async function dial(name, value) {
  const input = main.getByRole("spinbutton", { name: name + "数值" });
  await input.fill(String(value));
  await input.press("Enter");
}
async function hasEvent(page, kind) {
  return page.evaluate(
    (k) => window.__voiceEvents.some((e) => e.kind === k),
    kind,
  );
}
function checked(title) {
  checks.push(title);
  console.log(title);
}
const watch = (p) => {
  p.setDefaultTimeout(14000);
  p.on("pageerror", (e) => errors.push(e.message));
};
watch(main);
app.on("window", watch);
try {
  const snapshot = await api(main, "snapshot");
  assert.equal(snapshot.config.tts.onlineProviderId, null);
  const config = snapshot.config,
    p = config.providers[0];
  config.appearance.language = "zh-CN";
  config.appearance.theme = "light";
  config.noteSuggestion.enabled = false;
  config.defaults.targetLanguage = "English";
  Object.assign(p, {
    model: "text-fixture",
    endpoint: "http://127.0.0.1:" + server.address().port + "/v1",
    requiresKey: false,
    name: "翻译测试服务",
  });
  config.providers.push({
    ...p,
    id: "voice-fixture",
    model: "tts-fixture",
    modelKind: "speech",
    name: "语音测试服务",
  });
  await api(main, "saveConfig", { config, revision: snapshot.revision });
  await button(main, "文本转语音").click();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes("mode=main"))
      .setSize(1020, 860),
  );
  const offline = await main.evaluate(async () => {
    const get = () => speechSynthesis.getVoices().filter((v) => v.localService);
    if (!get().length)
      await new Promise((r) => {
        const timer = setTimeout(r, 3500);
        speechSynthesis.addEventListener(
          "voiceschanged",
          () => {
            clearTimeout(timer);
            r();
          },
          { once: true },
        );
      });
    return get().map((v) => ({ name: v.name, lang: v.lang }));
  });
  const english = offline.find((v) => v.lang.startsWith("en"));
  const chinese = offline.find((v) => v.lang.startsWith("zh"));
  assert.ok(
    english && chinese,
    "Windows English and Chinese system voices are required for this test",
  );
  await instrument(main);
  await pickVoice("语言音色", english.name);
  await pickVoice("兜底音色", chinese.name);
  await dial("语速", 25);
  await dial("音高", -10);
  await dial("音量", -100);
  await button(main, "试听语言语音").click();
  await until(
    () => hasEvent(main, "system-end"),
    "system voice did not finish",
    25000,
  );
  const native = await main.evaluate(() =>
    window.__voiceEvents.find((e) => e.kind === "system-start"),
  );
  assert.equal(native.voice, english.name);
  assert.equal(native.rate, 1.25);
  assert.ok(Math.abs(native.pitch - 0.9) < 0.001);
  assert.equal(native.volume, 0);
  assert.equal(requests.length, 0);
  checked(
    "System preview used the selected Windows voice and prosody, emitted start and end, and made zero network requests",
  );
  await main
    .getByLabel("在线朗读提供商", { exact: true })
    .selectOption("voice-fixture");
  await main
    .getByLabel("在线音色 ID", { exact: true })
    .fill("studio/reader-en");
  await button(main, "添加").click();
  await pickVoice("语言音色", "studio/reader-en");
  await button(main, "试听语言语音").click();
  await until(
    () => hasEvent(main, "audio-ended"),
    "online audio was not decoded and played",
  );
  const online = await main.evaluate(() =>
    window.__voiceEvents.find((e) => e.kind === "audio-playing"),
  );
  const req = requests.find((r) => r.path === "/v1/audio/speech");
  assert.equal(req.voice, "studio/reader-en");
  assert.equal(req.model, "tts-fixture");
  assert.match(req.input, /Hello/);
  assert.ok(Math.abs(req.speed * online.rate - 2 ** 0.25) < 0.002);
  assert.equal(online.preservesPitch, false);
  assert.equal(online.volume, 0);
  assert.equal(online.blob, true);
  const saved = (await api(main, "snapshot")).config.tts;
  assert.equal(saved.languageVoices.en, "api:studio/reader-en");
  assert.ok(saved.defaultVoice.startsWith("system:"));
  checked(
    "Online preview and autosave used the selected speech provider and custom voice; Chromium decoded audio and applied pitch, speed and volume",
  );
  await button(main, "试听兜底语音").click();
  await until(
    () =>
      main.evaluate(
        (v) =>
          window.__voiceEvents.some(
            (e) => e.kind === "system-end" && e.voice === v,
          ),
        chinese.name,
      ),
    "fallback system voice did not finish",
    25000,
  );
  assert.equal(requests.filter((r) => r.path === "/v1/audio/speech").length, 1);
  checked(
    "Fallback preview plays the selected Chinese system voice while English is mapped online",
  );
  hold = true;
  const count = requests.length;
  await button(main, "试听语言语音").click();
  await until(() => requests.length > count, "preview request missing");
  await button(main, "停止朗读").click();
  await until(() => aborted === 1, "cancelled request stayed open");
  hold = false;
  checked("Stop aborts an in-flight speech request before audio arrives");
  await button(main, "恢复默认").click();
  await main
    .getByRole("heading", { name: "文本转语音", exact: true })
    .scrollIntoViewIfNeeded();
  await until(
    async () => (await api(main, "snapshot")).config.tts.volume === 0,
    "reset was not saved",
  );
  if (!packaged) await main.screenshot({ path: pictures + "/tts-light.png" });
  await button(main, "通用").click();
  await button(main, "深色").click();
  await button(main, "文本转语音").click();
  await main.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  if (!packaged) await main.screenshot({ path: pictures + "/tts-dark.png" });
  assert.equal(
    await main.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await dial("音量", -100);
  await until(
    async () => (await api(main, "snapshot")).config.tts.volume === -100,
    "volume edit was not saved",
  );
  if (!packaged) {
    const passage =
      "Every morning I read the newspaper in the kitchen before I leave for work.";
    await app.evaluate(
      (_, text) =>
        globalThis.__readfinchTest.select({
          token: crypto.randomUUID(),
          app: "Reader",
          x: 540,
          y: 260,
          canReplace: false,
          text,
        }),
      passage,
    );
    const pill = await mode("pill");
    await instrument(pill);
    await button(pill, "朗读").click();
    await until(
      () => hasEvent(pill, "audio-ended"),
      "toolbar did not play the selection",
    );
    assert.ok(
      requests.some(
        (r) =>
          r.path === "/v1/audio/speech" &&
          r.input === passage &&
          r.voice === "studio/reader-en",
      ),
    );
    checked(
      "Selection toolbar detects English locally and plays the actual selected text using its online mapping",
    );
  }
  await api(main, "panelOpen", { source: "empty" });
  const panel = await mode("panel");
  await instrument(panel);
  await panel
    .getByLabel("原文", { exact: true })
    .fill("这段文字用于测试译文朗读。");
  await button(panel, "翻译").click();
  await panel.getByText(translated, { exact: true }).first().waitFor();
  await button(panel.getByRole("region", { name: "处理结果" }), "朗读").click();
  await until(
    () => hasEvent(panel, "audio-ended"),
    "translation result did not play",
  );
  assert.ok(
    requests.some(
      (r) =>
        r.path === "/v1/audio/speech" &&
        r.input === translated &&
        r.voice === "studio/reader-en",
    ),
  );
  assert.ok(
    requests.some(
      (r) => r.path === "/v1/chat/completions" && r.model === "text-fixture",
    ),
  );
  checked(
    "The translation result uses its target language with the saved voice and keeps the speech model separate from the text model",
  );
  await button(panel, "保持浮窗").click();
  const beforeSwitch = requests.length;
  hold = true;
  await button(panel.getByRole("region", { name: "处理结果" }), "朗读").click();
  await until(
    () => requests.length > beforeSwitch,
    "missing result speech request",
  );
  await button(main, "试听兜底语音").click();
  await until(
    () => aborted === 2,
    "switching windows left the old speech request running",
  );
  hold = false;
  await until(
    () =>
      main.evaluate(
        (v) =>
          window.__voiceEvents.filter(
            (e) => e.kind === "system-end" && e.voice === v,
          ).length >= 2,
        chinese.name,
      ),
    "new voice did not finish after switching windows",
  );
  checked(
    "Starting a system preview stops the online request in a different pinned result window",
  );
  const connection = await api(main, "testText", {
    profileId: "voice-fixture",
  });
  assert.ok(connection);
  assert.equal(requests.at(-1).path, "/v1/audio/speech");
  assert.equal(requests.at(-1).input, "ReadFinch");
  assert.deepEqual(errors, []);
  checked(
    "The assigned provider's connection test uses the audio endpoint; there were no renderer errors",
  );
  await button(main, "移除音色 studio/reader-en").click();
  await until(async () => {
    const { tts } = (await api(main, "snapshot")).config;
    return (
      !tts.languageVoices.en &&
      !tts.customVoices.includes("studio/reader-en") &&
      tts.defaultVoice === saved.defaultVoice
    );
  }, "removing a voice did not clear its assignment");
  checked("Removing a custom voice clears only its assignments");
  await button(main, "API 提供商").click();
  await button(main, "添加提供商").click();
  await main
    .getByRole("dialog")
    .getByRole("button", { name: "Xiaomi MiMo", exact: true })
    .click();
  await main.getByLabel("API 基础地址", { exact: true }).fill(p.endpoint);
  await main.locator("#provider-key").fill("fixture-mimo-key");
  const modelInput = main.getByRole("combobox", { name: "模型", exact: true });
  await modelInput.fill("mimo-v2.5-tts");
  await modelInput.press("Enter");
  assert.equal(
    await main.getByLabel("输入自定义模型 ID", { exact: true }).isChecked(),
    false,
  );
  await main.getByLabel("语音接口", { exact: true }).waitFor();
  assert.match(
    await main
      .getByLabel("语音接口", { exact: true })
      .locator("option:checked")
      .innerText(),
    /Xiaomi MiMo/,
  );
  assert.equal(await main.getByLabel("推理强度", { exact: true }).count(), 0);
  await main
    .getByLabel("朗读风格", { exact: true })
    .fill("Speak warmly and clearly.");
  await main.locator(".provider-disclosure").click();
  await main
    .getByRole("switch", {
      name: "将 mimo-v2.5-tts 用于 在线朗读",
      exact: true,
    })
    .check();
  assert.equal(
    await main.locator(".model-assignment-list").getByRole("switch").count(),
    1,
  );
  await main.locator(".provider-advanced > summary").click();
  assert.equal(
    await main
      .getByRole("switch", { name: "需要 API Key", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await main.getByRole("switch", { name: "流式输出", exact: true }).count(),
    0,
  );
  await main.locator(".provider-advanced > summary").click();
  await button(main, "测试连接").click();
  await until(
    () => requests.at(-1).model === "mimo-v2.5-tts",
    "MiMo connection test did not use speech",
  );
  assert.deepEqual(requests.at(-1).messages.at(-1), {
    role: "assistant",
    content: "ReadFinch",
  });
  assert.equal(requests.at(-1).audio.voice, "mimo_default");
  const mimoConfig = (await api(main, "snapshot")).config;
  const mimo = mimoConfig.providers.find((p) => p.preset === "mimo");
  assert.equal(mimoConfig.tts.onlineProviderId, mimo.id);
  assert.equal(mimo.customModel, false);
  for (const theme of ["light", "dark"]) {
    await api(main, "setTheme", { theme });
    await main.waitForFunction(
      (v) => document.documentElement.dataset.theme === v,
      theme,
    );
    await main
      .locator(".provider-model-control")
      .evaluate((el) => el.scrollIntoView({ block: "center" }));
    if (!packaged)
      await main.screenshot({
        path: pictures + "/mimo-provider-" + theme + ".png",
      });
  }
  checked(
    "MiMo provider automatically routes TTS, shows only speech features, hides irrelevant advanced toggles and tests the real speech endpoint",
  );
  await button(main, "文本转语音").click();
  const speechProvider = main.getByLabel("在线朗读提供商", { exact: true });
  assert.equal(
    await speechProvider.locator('option[value="text-default"]').count(),
    0,
  );
  await pickVoice("语言音色", "Mia");
  await main.evaluate(() => {
    window.__voiceEvents = [];
  });
  await button(main, "试听语言语音").click();
  await until(
    () => hasEvent(main, "audio-ended"),
    "MiMo WAV was not decoded and played",
  );
  assert.equal(requests.at(-1).audio.voice, "Mia");
  assert.equal(requests.at(-1).model, "mimo-v2.5-tts");
  assert.match(requests.at(-1).messages.at(-1).content, /Hello/);
  const voiceInput = main.getByRole("combobox", {
    name: "语言音色",
    exact: true,
  });
  await voiceInput.click();
  await voiceInput.fill("alloy");
  assert.equal(
    await main.getByRole("option").filter({ hasText: "alloy" }).count(),
    0,
  );
  await voiceInput.press("Escape");
  await main.reload();
  await main.getByRole("button", { name: "文本转语音", exact: true }).waitFor();
  const reopened = (await api(main, "snapshot")).config;
  assert.equal(reopened.tts.languageVoices.en, "api:Mia");
  assert.equal(
    reopened.providers.find((p) => p.id === mimo.id).speechInstructions,
    "Speak warmly and clearly.",
  );
  assert.deepEqual(errors, []);
  checked(
    "MiMo voice choices are separate from OpenAI; Chromium plays decoded MiMo audio and voice/style settings survive reload",
  );
  await writeFile(
    "docs/" + (packaged ? "packaged-" : "") + "speech-verification.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        packaged,
        systemVoices: offline,
        checks,
      },
      null,
      2,
    ) + "\n",
  );
} catch (error) {
  console.error(
    "FAILED",
    checks.at(-1),
    errors,
    await main
      .locator('[role="alert"]')
      .allTextContents()
      .catch(() => []),
  );
  throw error;
} finally {
  await app.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
