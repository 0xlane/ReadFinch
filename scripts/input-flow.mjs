import { _electron as electron } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import assert from "node:assert/strict";

const output = "docs/screenshots/current";
await mkdir(output, { recursive: true });
const requests = [];
const checks = [];
checks.push = function (...values) {
  console.log(...values);
  return Array.prototype.push.apply(this, values);
};
const errors = [];
const server = createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const input = JSON.parse(raw || "{}");
  requests.push(input);
  const vision =
    Array.isArray(input.messages?.[0]?.content) &&
    input.messages[0].content.some((part) => part.type === "image_url");
  const text = vision
    ? input.model === "ocr-delayed"
      ? "OLD IMAGE RESPONSE MUST NOT APPEAR"
      : "Remote OCR fixture text."
    : JSON.stringify({
        场合: null,
        标注: null,
        改后: "Small steps make a meaningful difference.",
        总评: "本机测试样例，检查 OCR 校对文字传给文字指令。",
      });
  if (input.model === "ocr-delayed")
    await new Promise((resolve) => setTimeout(resolve, 900));
  if (res.destroyed) return;
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  res.end(
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`,
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const env = { ...process.env, READFINCH_TEST_HOOKS: "1" };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  args: [".", `--data-dir=${path.resolve(".local/input-flow-" + Date.now())}`],
  env,
});
app.on("window", (page) =>
  page.on("pageerror", (error) => errors.push(error.message)),
);
const main = await app.firstWindow();
main.setDefaultTimeout(15000);
const call = (page, method, arg) =>
  page.evaluate(({ method, arg }) => window.readfinch.call(method, arg), {
    method,
    arg,
  });
const visible = (mode) =>
  app.evaluate(
    ({ BrowserWindow }, mode) =>
      BrowserWindow.getAllWindows().some(
        (win) =>
          win.webContents.getURL().includes(`mode=${mode}`) && win.isVisible(),
      ),
    mode,
  );
async function modePage(mode) {
  for (let count = 0; count < 150; count++) {
    const page = app
      .windows()
      .find((item) => !item.isClosed() && item.url().includes(`mode=${mode}`));
    if (page && (await page.locator("#root > *").count())) {
      page.setDefaultTimeout(15000);
      return page;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const panel = app.windows().find((w) => w.url().includes("mode=panel"));
  const reason = await panel?.locator('[role="alert"]').allTextContents();
  throw Error(`Missing ${mode} window: ${reason?.join(" ")}`);
}
async function useOcr(id, model = "ocr-fixture") {
  await main.evaluate(
    async ({ id, model, endpoint }) => {
      const s = await window.readfinch.call("snapshot");
      Object.assign(s.config.providers[0], {
        endpoint,
        requiresKey: false,
        model: "text-fixture",
        name: "文字模型 · fixture",
      });
      if (!s.config.providers.some((profile) => profile.id === "ocr-fixture"))
        s.config.providers.push({
          ...s.config.providers[0],
          id: "ocr-fixture",
          name: "远程识别 · fixture",
          model,
          endpoint,
          requiresKey: false,
        });
      s.config.providers.find((profile) => profile.id === "ocr-fixture").model =
        model;
      s.config.defaults.ocrProfileId = id;
      await window.readfinch.call("saveConfig", {
        config: s.config,
        revision: s.revision,
      });
    },
    { id, model, endpoint: `http://127.0.0.1:${server.address().port}/v1` },
  );
}
async function acquiredImage(dataUrl, source = "capture") {
  await app.evaluate(
    (_, { dataUrl, source }) => globalThis.__readfinchTest.image(dataUrl, source),
    { dataUrl, source },
  );
}
const dataUrl =
  "data:image/png;base64," +
  (await readFile("tests/fixtures/bilingual-light.png")).toString("base64");
let panel;
let screenCapture;
try {
  await main.evaluate(async () => {
    const s = await window.readfinch.call("snapshot");
    if (s.interfaceLocale !== "zh-CN") {
      s.config.appearance.language = "zh-CN";
      await window.readfinch.call("saveConfig", {
        config: s.config,
        revision: s.revision,
      });
    }
  });
  await main.getByRole("heading", { name: "通用", exact: true }).waitFor();
  await call(main, "setTheme", { theme: "light" });
  await app.evaluate(() => globalThis.__readfinchTest.clearSelection());
  await call(main, "selectionOpen", { actionId: "translate" });
  panel = await modePage("panel");
  await panel.getByText("未读到选中文字", { exact: true }).waitFor();
  assert.equal(await visible("capture"), false);
  assert.equal(requests.length, 0);
  await panel.getByRole("button", { name: /框选文字/ }).waitFor();
  await panel.screenshot({ path: output + "/selection-unavailable-light.png" });
  checks.push(
    "missing selection shows an explicit capture route; no implicit screenshot or model request",
  );

  await panel.getByRole("button", { name: "输入文字", exact: true }).click();
  await panel
    .getByLabel("原文", { exact: true })
    .fill("Keep this draft when capture is cancelled.");
  await panel.getByRole("button", { name: "保持浮窗", exact: true }).click();
  await panel.evaluate(() => {
    window.__inputJobs = [];
    window.readfinch.on("job", (event) =>
      window.__inputJobs.push({ kind: event.kind, status: event.status }),
    );
  });
  for (const cancel of ["Escape", "right-click"]) {
    await call(panel, "capture");
    const overlay = await modePage("capture");
    await overlay.locator(".capture-overlay > img").waitFor();
    const closed = overlay.waitForEvent("close");
    const gesture =
      cancel === "Escape"
        ? overlay.keyboard.press("Escape")
        : overlay.mouse.click(80, 80, { button: "right" });
    await gesture.catch((error) => {
      if (!overlay.isClosed()) throw error;
    });
    await closed;
    for (let tries = 0; tries < 40 && !(await visible("panel")); tries++)
      await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(
      await visible("panel"),
      true,
      `Capture cancellation (${cancel}) must restore the result window`,
    );
    assert.equal(
      await panel.getByLabel("原文", { exact: true }).inputValue(),
      "Keep this draft when capture is cancelled.",
    );
    assert.equal(
      await panel
        .getByRole("button", { name: "取消置顶", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((win) => win.webContents.getURL().includes("mode=panel"))
        .emit("blur"),
    );
    assert.equal(
      await visible("panel"),
      true,
      "Capture cancellation must restore native pin state too",
    );
  }
  assert.equal((await panel.evaluate(() => window.__inputJobs)).length, 0);
  checks.push(
    "Esc and right-click cancel the real capture overlay, restore draft and pin, and never start OCR",
  );

  await useOcr("ocr-offline");
  await acquiredImage(dataUrl, "image");
  await panel.waitForFunction(() =>
    document.querySelector(".source-editor")?.value.includes("你好"),
  );
  await panel.getByRole("button", { name: "重新识别", exact: true }).waitFor();
  assert.equal(requests.length, 0);
  await panel.screenshot({ path: output + "/ocr-review-light.png" });
  await call(main, "setTheme", { theme: "dark" });
  await panel.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  await panel.screenshot({ path: output + "/ocr-review-dark.png" });
  const corrected =
    "Small steps makes a meaningful difference. Corrected by the reader.";
  await panel.getByLabel("原文", { exact: true }).fill(corrected);
  await panel.getByRole("button", { name: "写作改进", exact: true }).click();
  await panel.getByRole("button", { name: "复制结果", exact: true }).waitFor();
  assert.ok(JSON.stringify(requests[0].messages).includes(corrected));
  assert.ok(
    requests[0].messages.every(
      (message) => typeof message.content === "string",
    ),
    "Text actions receive corrected text, never the screenshot",
  );
  assert.equal(
    await panel.getByRole("button", { name: "替换原文", exact: true }).count(),
    0,
  );
  assert.equal(await panel.locator(".capture-source").count(), 0);
  await panel.getByRole("button", { name: "核对原图", exact: true }).click();
  await panel.getByAltText("文字来源原图").waitFor();
  await panel.getByRole("button", { name: "收起原图", exact: true }).click();
  await panel
    .locator(".interaction-shell")
    .screenshot({ path: output + "/ocr-to-writing-dark.png" });
  await panel.getByRole("button", { name: "校对文字", exact: true }).click();
  assert.equal(
    await panel.getByLabel("原文", { exact: true }).inputValue(),
    corrected,
  );
  checks.push(
    "local OCR starts once without a text model; corrected text reuses action cards, preserves its image, and never offers replacement",
  );

  await useOcr("ocr-fixture");
  const beforeRemote = requests.length;
  await acquiredImage(dataUrl);
  await panel.getByRole("button", { name: "识别文字", exact: true }).waitFor();
  await panel.waitForTimeout(500);
  assert.equal(
    requests.length,
    beforeRemote,
    "A remote OCR profile must wait for an explicit recognition click",
  );
  await panel.getByText(/点击识别后，将原图发送到/).waitFor();
  await panel.screenshot({ path: output + "/ocr-remote-preview-dark.png" });
  await panel.getByRole("button", { name: "识别文字", exact: true }).click();
  await panel.waitForFunction(
    () =>
      document.querySelector(".source-editor")?.value ===
      "Remote OCR fixture text.",
  );
  await panel.getByRole("button", { name: "重新识别", exact: true }).waitFor();
  assert.equal(requests.length, beforeRemote + 1);
  assert.ok(
    requests
      .at(-1)
      .messages[0].content.some((part) => part.type === "image_url"),
  );
  checks.push(
    "remote OCR displays its destination and sends one image only after the recognition click",
  );

  await useOcr("ocr-fixture", "ocr-delayed");
  await acquiredImage(dataUrl);
  await panel.getByRole("button", { name: "识别文字", exact: true }).click();
  await panel.getByRole("button", { name: "停止", exact: true }).waitFor();
  assert.equal(
    await panel.getByRole("button", { name: "翻译", exact: true }).isEnabled(),
    false,
  );
  await panel.getByRole("button", { name: "停止", exact: true }).click();
  await useOcr("ocr-offline");
  await acquiredImage(dataUrl);
  await panel.waitForFunction(() =>
    document.querySelector(".source-editor")?.value.includes("Small steps"),
  );
  await panel.getByRole("button", { name: "重新识别", exact: true }).waitFor();
  await panel.waitForTimeout(1000);
  assert.ok(
    !(await panel.getByLabel("原文", { exact: true }).inputValue()).includes(
      "OLD IMAGE",
    ),
  );
  checks.push(
    "OCR cancellation/new images isolate late results; text actions stay disabled while recognizing",
  );

  const blank = await panel.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 120;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 320, 120);
    return canvas.toDataURL();
  });
  await acquiredImage(blank);
  await panel.getByText(/没有识别到文字/).waitFor();
  assert.equal(
    await panel.getByRole("button", { name: "翻译", exact: true }).isEnabled(),
    false,
  );
  await panel.getByRole("button", { name: "重新框选", exact: true }).waitFor();
  checks.push(
    "an empty real OCR result offers recapture and cannot trigger a text action",
  );

  // Exercise real screen pixels and cropping independently of foreground control.
  // Also try a sample window; record whether the desktop compositor displays it.
  await call(main, "setTheme", { theme: "light" });
  await call(panel, "window", { command: "dismiss" });
  const bounds = await app.evaluate(async ({ BrowserWindow, screen }) => {
    const display = screen.getDisplayNearestPoint(
      screen.getCursorScreenPoint(),
    );
    const area = display.workArea;
    const win = new BrowserWindow({
      x: area.x + 32,
      y: area.y + 32,
      width: Math.min(800, area.width - 64),
      height: 340,
      frame: false,
      alwaysOnTop: true,
      backgroundColor: "#ffffff",
      webPreferences: { sandbox: true },
    });
    globalThis.__inputSample = win;
    await win.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent(
          '<html><body style="margin:24px;background:white;color:black;font:30px Arial,sans-serif;line-height:1.65">ReadFinch SCREEN OCR 2468<br>Small steps make a big difference.<br>你好，世界！<br>C:\\Projects\\ReadFinch</body></html>',
        ),
    );
    win.show();
    win.moveTop();
    return {
      window: win.getBounds(),
      display: display.bounds,
      scale: display.scaleFactor,
    };
  });
  await call(main, "capture");
  const overlay = await modePage("capture");
  await overlay.locator(".capture-overlay > img").waitFor();
  const screenSource = await call(overlay, "captureData");
  const viewport = await overlay.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    dpr: devicePixelRatio,
  }));
  assert.deepEqual(
    [viewport.width, viewport.height],
    [bounds.display.width, bounds.display.height],
    "The overlay must cover the entire display, including the taskbar, without native frame padding",
  );
  assert.deepEqual(
    [
      Math.round(viewport.width * viewport.dpr),
      Math.round(viewport.height * viewport.dpr),
    ],
    [screenSource.width, screenSource.height],
    "The frozen screenshot must display at 1:1 device pixels",
  );
  // A click without dragging must not leave a sticky rectangle following the cursor.
  await overlay.mouse.click(20, 20);
  await overlay.mouse.move(25, 25);
  assert.equal(await overlay.locator(".crop-selection").count(), 0);
  const left = bounds.window.x - bounds.display.x + 8;
  const top = bounds.window.y - bounds.display.y + 8;
  await overlay.mouse.move(left, top);
  await overlay.mouse.down();
  await overlay.mouse.move(left + bounds.window.width - 16, top + 275, {
    steps: 8,
  });
  await overlay.locator('.capture-overlay[data-selecting="true"]').waitFor();
  assert.equal(await overlay.locator(".capture-hint").isVisible(), false);
  const overlayPng = await overlay.screenshot();
  const previewPixels = await app.evaluate(
    ({ nativeImage }, { source, displayed, rect, dpr }) => {
      const original = nativeImage.createFromDataURL(source);
      const rendered = nativeImage.createFromBuffer(
        Buffer.from(displayed, "base64"),
      );
      const roi = {
        x: Math.round((rect.x + 12) * dpr),
        y: Math.round((rect.y + 12) * dpr),
        width: Math.round((rect.width - 24) * dpr),
        height: Math.round((rect.height - 24) * dpr),
      };
      const a = original.crop(roi).toBitmap(),
        b = rendered.crop(roi).toBitmap();
      let differences = 0;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) differences++;
      return {
        source: original.getSize(),
        displayed: rendered.getSize(),
        differingChannels: differences,
        comparedChannels: a.length,
      };
    },
    {
      source: screenSource.dataUrl,
      displayed: overlayPng.toString("base64"),
      rect: { x: left, y: top, width: bounds.window.width - 16, height: 275 },
      dpr: viewport.dpr,
    },
  );
  assert.deepEqual(previewPixels.displayed, previewPixels.source);
  assert.equal(
    previewPixels.differingChannels,
    0,
    "Clear selection must show the original screen pixels without resampling",
  );
  checks.push(
    "The actual selection preview is pixel-identical to the native screenshot at current DPI; taskbar sizing and click-without-drag are correct",
  );
  await overlay.mouse.up().catch((error) => {
    if (!overlay.isClosed()) throw error;
  });
  await panel.getByRole("heading", { name: "屏幕取词", exact: true }).waitFor();
  await panel.getByRole("button", { name: "重新识别", exact: true }).waitFor();
  const captured = await call(panel, "interactionGet");
  assert.equal(captured.source, "capture");
  const pixelCheck = await panel.evaluate(
    async ({ original, actual, rect, viewport }) => {
      const load = async (src) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        return img;
      };
      const source = await load(original.dataUrl);
      const target = await load(actual.dataUrl);
      const crop = {
        x: Math.round((rect.x * source.width) / viewport.width),
        y: Math.round((rect.y * source.height) / viewport.height),
        width: Math.round((rect.width * source.width) / viewport.width),
        height: Math.round((rect.height * source.height) / viewport.height),
      };
      const hash = async (image, x, y, width, height) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, x, y, width, height, 0, 0, width, height);
        return [
          ...new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              ctx.getImageData(0, 0, width, height).data,
            ),
          ),
        ]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
      };
      return {
        expected: crop,
        actual: { width: target.width, height: target.height },
        equal:
          (await hash(source, crop.x, crop.y, crop.width, crop.height)) ===
          (await hash(target, 0, 0, target.width, target.height)),
      };
    },
    {
      original: screenSource,
      actual: captured.capture,
      rect: { x: left, y: top, width: bounds.window.width - 16, height: 275 },
      viewport,
    },
  );
  assert.deepEqual(pixelCheck.actual, {
    width: pixelCheck.expected.width,
    height: pixelCheck.expected.height,
  });
  assert.equal(
    pixelCheck.equal,
    true,
    "The OCR image must contain exactly the pixels inside the dragged region",
  );
  const recognized = await panel
    .getByLabel("原文", { exact: true })
    .inputValue();
  const sampleVisible =
    /SCREEN OCR/.test(recognized) &&
    /2468/.test(recognized) &&
    /你好/.test(recognized);
  screenCapture = {
    scaleFactor: bounds.scale,
    cropPixelsMatch: true,
    previewPixelsMatch: true,
    previewPixels,
    viewport,
    ocrCompleted: true,
    controlledSampleRecognized: sampleVisible,
    ...(sampleVisible
      ? {}
      : {
          limitation:
            "The controlled sample window did not appear in the compositor capture. Foreground sample-text acceptance remains unverified; image-fixture bilingual OCR passed independently.",
        }),
  };
  await app.evaluate(() => {
    globalThis.__inputSample.destroy();
  });
  if (sampleVisible)
    await panel.screenshot({ path: output + "/screen-capture-ocr-light.png" });
  checks.push(
    "actual desktop capture matches the pointer-selected pixels at current scaling and automatically completes local OCR",
  );

  assert.deepEqual(errors, []);
  await writeFile(
    "docs/input-flow-verification.json",
    JSON.stringify(
      {
        version: JSON.parse(await readFile("package.json", "utf8")).version,
        date: new Date().toISOString(),
        checks,
        requests: requests.length,
        rendererErrors: errors,
        screenCapture,
        scope:
          "Real Electron windows, desktop capture/crop pixel comparison, and bundled Tesseract. Imported images use development hooks; remote OCR and text use a local HTTP fixture. Controlled foreground content, native UIA selection and external model quality are not implied by these checks.",
      },
      null,
      2,
    ),
  );
  console.log(
    `Input flow passed: ${checks.length} checks.\n` + checks.join("\n"),
  );
  if (!screenCapture.controlledSampleRecognized)
    console.log(
      "Foreground sample acceptance: not verified; see report limitation.",
    );
} catch (error) {
  if (panel && (await visible("panel")))
    await panel.screenshot({ path: output + "/failure.png" }).catch(() => {});
  throw error;
} finally {
  await app
    .evaluate(() => {
      if (globalThis.__inputSample && !globalThis.__inputSample.isDestroyed())
        globalThis.__inputSample.destroy();
    })
    .catch(() => {});
  server.close();
  server.closeAllConnections();
  await app.close();
}
