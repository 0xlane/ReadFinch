import { _electron as electron } from "playwright";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";
import assert from "node:assert/strict";
if (process.platform !== "win32")
  throw Error(
    "This smoke test requires Windows; use the documented platform checklist elsewhere.",
  );
await mkdir(".local", { recursive: true });
await mkdir("docs/screenshots", { recursive: true });
const framework = path.join(
  process.env.WINDIR,
  "Microsoft.NET/Framework64/v4.0.30319",
);
const targetFile = path.resolve(".local/NativeTarget.exe");
execFileSync(path.join(framework, "csc.exe"), [
  "/nologo",
  `/out:${targetFile}`,
  "/r:System.Windows.Forms.dll",
  "/r:System.Drawing.dll",
  "/r:System.Web.Extensions.dll",
  path.resolve("tests/fixtures/NativeTarget.cs"),
]);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  args: [
    ".",
    `--data-dir=${path.resolve(".local/native-smoke-" + Date.now())}`,
  ],
  env,
});
let target;
const errors = [];
let previousSelection;
try {
  const main = await app.firstWindow();
  main.on("pageerror", (e) => errors.push(e.message));
  await main.getByRole("heading", { name: "通用", exact: true }).waitFor();
  target = spawn(targetFile, [], {
    windowsHide: false,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const lines = createInterface({ input: target.stdout });
  const events = [];
  const pending = new Map();
  lines.on("line", (line) => {
    try {
      const data = JSON.parse(line.replace(/^\uFEFF/, ""));
      events.push(data);
      pending.get(data.id)?.(data);
      pending.delete(data.id);
    } catch {}
  });
  async function waitReply(id) {
    const found = events.findLast((e) => e.id === id);
    if (found) return found;
    return new Promise((resolve, reject) => {
      pending.set(id, resolve);
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(Error("Native target timeout: " + id));
        }
      }, 7000).unref();
    });
  }
  async function command(op) {
    for (let i = events.length - 1; i >= 0; i--)
      if (events[i].id === op) events.splice(i, 1);
    target.stdin.write(op + "\n");
    return waitReply(op);
  }
  console.log("Target ready", await waitReply("ready"));
  console.log(
    "请将 ReadFinch Native Test 编辑器切换到前台；测试只操作这份专用样例文本。无法获得前台时将在 60 秒后报告未通过。",
  );
  const waitWindow = async (mode) => {
    for (let n = 0; n < 600; n++) {
      const win = app.windows().find((w) => w.url().includes("mode=" + mode));
      if (
        win &&
        (await win.evaluate(() => !!document.querySelector("#root > *")))
      )
        return win;
      await new Promise((r) => setTimeout(r, 100));
    }
    console.log("Target", await command("status"));
    console.log(
      "Bridge",
      await main.evaluate(
        async () => (await window.readfinch.call("snapshot")).nativeStatus,
      ),
    );
    throw Error(
      "未出现 " +
        mode +
        " 窗口；请检查专用测试编辑器是否拥有前台焦点及平台权限。本次原生交互验收未通过。",
    );
  };
  // Showing the non-activating floating control must preserve the target focus.
  const pill = await waitWindow("pill");
  const original = await command("status");
  assert.equal(
    original.foreground,
    original.hwnd,
    "floating control stole focus",
  );
  await pill.screenshot({ path: "docs/screenshots/native-floating.png" });
  await pill.getByRole("button", { name: "翻译", exact: true }).click();
  const panel = await waitWindow("panel");
  await panel.locator(".rf-source-text").waitFor();
  assert.equal(
    await panel.locator(".rf-source-text").innerText(),
    "Small steps make a big difference.",
  );
  await panel.screenshot({ path: "docs/screenshots/native-panel.png" });
  // Read the observed selection token in an isolated test window, from the bridge event.
  await panel.evaluate(() => {
    window.__testSelection = null;
    window.readfinch.on(
      "interaction",
      (value) => (window.__testSelection = value.selection),
    );
  });
  await command("change");
  await command("select");
  await new Promise((r) => setTimeout(r, 500));
  await pill.getByRole("button", { name: "翻译", exact: true }).click();
  await panel.waitForFunction(() => !!window.__testSelection);
  previousSelection = await panel.evaluate(() => window.__testSelection);
  assert.equal(previousSelection.canReplace, true);
  await panel.evaluate(
    async (token) =>
      window.readfinch.call("replace", {
        token,
        text: "Small changes, lasting impact.",
      }),
    previousSelection.token,
  );
  assert.match(
    (await command("status")).text,
    /^Small changes, lasting impact\./,
  );
  await command("select");
  await new Promise((r) => setTimeout(r, 500));
  await pill.getByRole("button", { name: "翻译", exact: true }).click();
  await panel.waitForFunction(
    (old) => window.__testSelection?.token !== old,
    previousSelection.token,
  );
  const stale = await panel.evaluate(() => window.__testSelection.token);
  await command("change");
  await new Promise((r) => setTimeout(r, 350));
  const rejected = await panel.evaluate(async (token) => {
    try {
      await window.readfinch.call("replace", {
        token,
        text: "MUST NOT BE INSERTED",
      });
      return false;
    } catch {
      return true;
    }
  }, stale);
  assert.ok(rejected, "stale replacement was accepted");
  assert.ok(!(await command("status")).text.includes("MUST NOT"));
  // Real desktop capture, real overlay crop, real Tesseract OCR.
  await command("clear");
  await new Promise((r) => setTimeout(r, 200));
  const targetRect = await command("status");
  assert.equal(targetRect.foreground, targetRect.hwnd, "The sample editor must be in front before OCR capture");
  await main.evaluate(() => window.readfinch.call("capture"));
  const overlay = await waitWindow("capture");
  const display = await app.evaluate(({ screen }) => {
    const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    return { bounds: d.bounds, scaleFactor: d.scaleFactor };
  });
  const x = targetRect.x / display.scaleFactor - display.bounds.x;
  const y = targetRect.y / display.scaleFactor - display.bounds.y;
  await overlay.mouse.move(x + 5, y + 5);
  await overlay.mouse.down();
  await overlay.mouse.move(
    x + targetRect.width / display.scaleFactor - 5,
    y + targetRect.height / display.scaleFactor - 5,
    { steps: 8 },
  );
  await overlay.mouse.up();
  await panel.waitForFunction(
    () =>
      document
        .querySelector(".source-editor")
        ?.value.includes("lasting impact"),
    { timeout: 30000 },
  );
  await panel.screenshot({ path: "docs/screenshots/native-capture-ocr.png" });
  const text = await panel.getByLabel("原文", { exact: true }).inputValue();
  assert.match(text, /世界/);
  assert.equal(errors.length, 0, errors.join("\n"));
  await writeFile(
    "docs/native-smoke.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        platform: "win32",
        automaticSelection: true,
        pillPreservedFocus: true,
        standardEditReplacement: true,
        staleReplacementRejected: true,
        desktopCapture: true,
        regionCrop: true,
        ocrText: text,
        scaleFactor: display.scaleFactor,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "Native smoke passed: selection, focus, guarded replacement, capture, crop and real OCR.",
  );
} finally {
  target?.stdin.write("quit\n");
  target?.kill();
  await app.close();
}
