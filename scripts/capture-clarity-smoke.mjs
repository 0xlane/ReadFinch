import { _electron as electron } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const packaged = process.argv.includes("--packaged");
const dir = path.resolve(".local/capture-clarity-" + Date.now());
await mkdir(dir, { recursive: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  ...(packaged
    ? { executablePath: path.resolve("release/win-unpacked/ReadFinch.exe") }
    : {}),
  args: [...(packaged ? [] : ["."]), "--data-dir=" + dir, "--settings"],
  env,
});
const errors = [];
app.on("window", (page) =>
  page.on("pageerror", (error) => errors.push(error.message)),
);
const api = (page, method) =>
  page.evaluate((method) => window.texthop.call(method), method);
try {
  const main = await app.firstWindow();
  await main.getByRole("navigation").first().waitFor();
  const snapshot = await api(main, "snapshot");
  await api(main, "capture");
  let overlay;
  for (let i = 0; i < 100; i++) {
    overlay = app
      .windows()
      .find((w) => !w.isClosed() && w.url().includes("mode=capture"));
    if (overlay) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(overlay);
  await overlay.waitForFunction(
    () => document.querySelector(".capture-overlay > img")?.complete,
  );
  const source = await api(overlay, "captureData");
  const viewport = await overlay.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    dpr: devicePixelRatio,
  }));
  const bounds = await app.evaluate(({ screen, BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("mode=capture"),
    );
    return {
      content: window.getContentBounds(),
      display: screen.getDisplayMatching(window.getBounds()).bounds,
    };
  });
  assert.deepEqual(bounds.content, bounds.display);
  assert.deepEqual(
    [
      Math.round(viewport.width * viewport.dpr),
      Math.round(viewport.height * viewport.dpr),
    ],
    [source.width, source.height],
  );
  await overlay.mouse.click(25, 25);
  await overlay.mouse.move(35, 35);
  assert.equal(await overlay.locator(".crop-selection").count(), 0);
  const rect = {
    x: 40,
    y: 40,
    width: Math.min(640, viewport.width - 80),
    height: Math.min(300, viewport.height - 80),
  };
  await overlay.mouse.move(rect.x, rect.y);
  await overlay.mouse.down();
  await overlay.mouse.move(rect.x + rect.width, rect.y + rect.height, {
    steps: 8,
  });
  await overlay.locator('.capture-overlay[data-selecting="true"]').waitFor();
  assert.equal(await overlay.locator(".capture-hint").isVisible(), false);
  const png = await overlay.screenshot();
  const pixels = await app.evaluate(
    ({ nativeImage }, { original, shown, rect, dpr }) => {
      const source = nativeImage.createFromDataURL(original),
        preview = nativeImage.createFromBuffer(Buffer.from(shown, "base64"));
      const area = {
        x: Math.round((rect.x + 12) * dpr),
        y: Math.round((rect.y + 12) * dpr),
        width: Math.round((rect.width - 24) * dpr),
        height: Math.round((rect.height - 24) * dpr),
      };
      const a = source.crop(area).toBitmap(),
        b = preview.crop(area).toBitmap();
      let differingChannels = 0;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) differingChannels++;
      return {
        source: source.getSize(),
        preview: preview.getSize(),
        comparedChannels: a.length,
        differingChannels,
      };
    },
    {
      original: source.dataUrl,
      shown: png.toString("base64"),
      rect,
      dpr: viewport.dpr,
    },
  );
  assert.deepEqual(pixels.source, pixels.preview);
  assert.equal(pixels.differingChannels, 0);
  const closed = overlay.waitForEvent("close");
  await overlay.keyboard.press("Escape").catch((error) => {
    if (!overlay.isClosed()) throw error;
  });
  await closed;
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/" +
      (packaged ? "packaged-" : "") +
      "capture-clarity-verification.json",
    JSON.stringify(
      {
        version: snapshot.version,
        packaged,
        date: new Date().toISOString(),
        viewport,
        bounds,
        pixels,
        clickWithoutDragResets: true,
        hintHiddenDuringDrag: true,
        escapeCancels: true,
        rendererErrors: errors,
        scope:
          "Actual Electron screen capture on the current display; no synthetic screenshot or development hooks. Other DPI settings and monitors require separate runs.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Capture clarity passed: exact display bounds, 1:1 pixels, zero color-channel differences, no sticky click, and Escape cancellation.",
  );
} finally {
  await app.close();
}
