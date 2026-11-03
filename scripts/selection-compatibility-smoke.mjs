import { _electron as electron } from "playwright";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

if (process.platform !== "win32")
  throw Error("This integration test requires an unlocked Windows desktop.");
const packaged = process.argv.includes("--packaged");
const dir = path.resolve(".local/selection-compatibility-" + Date.now());
await mkdir(dir, { recursive: true });
const reply =
  "The reply remains selectable while a button keeps keyboard focus.";
const embedded = "An embedded document has its own text selection.";
const html = `<!doctype html><html><head><title>ReadFinch Selection Fixture</title>
<style>body{font:20px Segoe UI;padding:28px;line-height:1.7;background:white;color:#222}
p{margin:16px 0}textarea{width:95%;height:45px;font:18px Segoe UI}button{padding:8px}
iframe{width:95%;height:80px;border:1px solid #ccc}</style></head><body>
<h2>Desktop selection compatibility</h2><p id="reply">${reply}</p>
<textarea id="composer" aria-label="Composer" placeholder="Empty composer"></textarea>
<p><button id="away">Keep focus here</button></p><p id="duplicate">${reply}</p>
<iframe src="http://localhost:PORT/frame" title="Embedded document"></iframe>
<p><input type="password" aria-label="Test password" id="password" value="fixture-only"></p>
</body></html>`;
const server = createServer((req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(
    req.url === "/frame"
      ? `<body style="font:18px Segoe UI"><p id="frame-reply">${embedded}</p><button id="away">Frame focus</button></body>`
      : html.replace("PORT", String(server.address().port)),
  );
});
await new Promise((resolve) => server.listen(0, resolve));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.READFINCH_TEST_HOOKS;
let app, target;
const cases = [];
cases.push = function (...values) {
  for (const value of values) console.log("Passed: " + value.name);
  return Array.prototype.push.apply(this, values);
};
const errors = [];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  app = await electron.launch({
    ...(packaged
      ? { executablePath: path.resolve("release/win-unpacked/ReadFinch.exe") }
      : {}),
    args: [...(packaged ? [] : ["."]), "--settings", "--data-dir=" + dir],
    env,
  });
  const main = await app.firstWindow();
  main.on("pageerror", (error) => errors.push(error.message));
  await main.locator("main h1").waitFor();
  await main.evaluate(async () => {
    const state = await window.readfinch.call("snapshot");
    state.config.selection.automatic = true;
    state.config.shortcuts = { selection: "", clipboard: "", capture: "" };
    state.config.actions.forEach((action) => (action.shortcut = ""));
    await window.readfinch.call("saveConfig", {
      config: state.config,
      revision: state.revision,
    });
  });
  target = await electron.launch({
    args: [
      path.resolve("tests/fixtures/SelectionWebTarget.cjs"),
      "--fixture-url=http://127.0.0.1:" + server.address().port,
    ],
    env,
  });
  const page = await target.firstWindow();
  await page.locator("#reply").waitFor();
  await page.frameLocator("iframe").locator("#frame-reply").waitFor();
  const frame = page.frames().find((frame) => frame.url().endsWith("/frame"));
  assert.ok(frame, "Embedded document did not load");

  async function select(document, id) {
    await document.evaluate((id) => {
      const range = window.document.createRange();
      range.selectNodeContents(window.document.getElementById(id));
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      // A non-text focused control reproduces the old focus-only UIA failure.
      window.document.getElementById("away").focus();
    }, id);
  }
  async function selection() {
    return main.evaluate(() => window.readfinch.call("selectionGet"));
  }
  async function expectSelection(text, label, timeout = 5000) {
    const started = Date.now();
    do {
      const value = await selection();
      if (value?.app === "electron" && value.text === text) {
        assert.equal(value.canReplace, false);
        cases.push({ name: label, passed: true });
        return value;
      }
      await pause(100);
    } while (Date.now() - started < timeout);
    // Never include selections from other user windows in test output.
    const native = await main.evaluate(async () => {
      const state = await window.readfinch.call("snapshot");
      return { state: state.nativeState, status: state.nativeStatus };
    });
    const focused = await page.evaluate(() => document.hasFocus());
    throw Error(
      "Native selection did not match the fixture: " +
        label +
        "; " +
        JSON.stringify({ native, fixtureFocused: focused }),
    );
  }
  async function expectEmpty(label) {
    const deadline = Date.now() + 5000;
    while ((await selection()) && Date.now() < deadline) await pause(100);
    assert.equal((await selection()) == null, true, label);
    // A stale provider must not cause the selection to return on the next poll.
    await pause(500);
    assert.equal((await selection()) == null, true, label);
    cases.push({ name: label, passed: true });
  }

  await select(page, "reply");
  console.log(
    "Activate ReadFinch Selection Fixture to start the native UIA checks (60-second limit).",
  );
  const first = await expectSelection(
    reply,
    "Document selection with a focused button",
    60000,
  );
  assert.equal(await page.evaluate(() => document.activeElement.id), "away");
  // Check the real automatic toolbar, without injecting a synthetic selection.
  const deadline = Date.now() + 5000;
  let toolbarVisible = false;
  while (!toolbarVisible && Date.now() < deadline) {
    toolbarVisible = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some(
        (window) =>
          window.webContents.getURL().includes("mode=pill") &&
          window.isVisible(),
      ),
    );
    if (!toolbarVisible) await pause(100);
  }
  assert.ok(toolbarVisible, "Native selection did not show the toolbar");
  const toolbar = app
    .windows()
    .find((window) => window.url().includes("mode=pill"));
  assert.ok(toolbar);
  await toolbar.locator("button").first().waitFor();
  assert.equal(
    await page.evaluate(() => document.hasFocus()),
    true,
    "Toolbar stole focus",
  );
  cases.push({
    name: "Automatic toolbar preserves target focus",
    passed: true,
  });

  await select(page, "duplicate");
  let second;
  for (let i = 0; i < 50; i++) {
    second = await selection();
    if (second?.token !== first.token && second?.text === reply) break;
    await pause(100);
  }
  assert.equal(second?.text, reply);
  assert.notEqual(
    second?.token,
    first.token,
    "Same text at a new position was deduplicated",
  );
  cases.push({
    name: "Identical text in a different paragraph updates the selection",
    passed: true,
  });
  await page.evaluate(() => getSelection().removeAllRanges());
  await expectEmpty("Clearing selection invalidates the cached document");
  await page.evaluate(() => {
    document.getElementById("composer").focus();
  });
  await expectEmpty("Empty composer caret does not show the toolbar");

  await select(frame, "frame-reply");
  await expectSelection(
    embedded,
    "Cross-site embedded document with a focused child button",
  );
  await frame.evaluate(() => getSelection().removeAllRanges());
  await expectEmpty("Clearing an embedded selection invalidates it");

  await select(page, "reply");
  await expectSelection(reply, "Outer document can be selected again");
  await toolbar.locator("button").first().waitFor();
  assert.equal(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.webContents.getURL().includes("mode=pill"))
        .isVisible(),
    ),
    true,
  );
  cases.push({
    name: "Toolbar content reappears after clearing and reselecting",
    passed: true,
  });
  await page.evaluate(() => document.getElementById("password").focus());
  await expectEmpty("Password focus suppresses selection reads");
  await page.evaluate(() => {
    getSelection().removeAllRanges();
    document.getElementById("away").focus();
  });
  await expectEmpty("No stale selection after leaving the password field");
  assert.deepEqual(errors, []);
  const version = await app.evaluate(({ app }) => app.getVersion());
  const report = {
    date: new Date().toISOString(),
    version,
    packaged,
    platform: process.platform,
    source:
      "Real Windows UI Automation from a separate Electron fixture; no synthetic selection hooks, clipboard writes, or external services.",
    limitation:
      "Equivalent embedded-web desktop scenarios; this test does not automate or certify the ChatGPT application.",
    cases,
    rendererErrors: errors,
  };
  await writeFile(
    `docs/selection-compatibility${packaged ? "-packaged" : ""}.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await target?.close();
  await app?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
