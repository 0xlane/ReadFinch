import { _electron as electron } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { prepareOriginalToolbar } from "./toolbar-trace.mjs";

const directory = await prepareOriginalToolbar();
const ipcCheck = process.argv.includes("--ipc-check");
const profile =
  process.argv.find((a) => a.startsWith("--profile="))?.slice(10) ??
  path.join(directory, "profile");
const duration = Math.min(
  180000,
  Math.max(
    1000,
    Number(
      process.argv.find((a) => a.startsWith("--duration="))?.slice(11) ?? 60000,
    ),
  ),
);
await mkdir(profile, { recursive: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
if (ipcCheck) env.READFINCH_TEST_HOOKS = "1";
else delete env.READFINCH_TEST_HOOKS;
let app;
const file = path.join(directory, "click-trace.json");
try {
  app = await electron.launch({
    args: [directory, "--data-dir=" + profile],
    env,
  });
  const main = await app.firstWindow();
  await main.locator("main h1").waitFor();
  const readTrace = async () => {
    const host = await app.evaluate(() => globalThis.__toolbarTrace);
    const renderers = [];
    for (const page of app.windows()) {
      const mode = new URL(page.url()).searchParams.get("mode");
      if (mode !== "pill" && mode !== "toolbar-menu") continue;
      try {
        renderers.push({
          mode,
          events: await page.evaluate(() => window.__toolbarDOMTrace ?? []),
        });
      } catch {}
    }
    const result = {
      version: "1.2.6",
      candidateFixes: false,
      kind: ipcCheck
        ? "DOM/IPC control only; not native pointer verification"
        : "manual native click diagnosis",
      host,
      renderers,
    };
    await writeFile(file, JSON.stringify(result, null, 2));
    return result;
  };
  if (ipcCheck) {
    await app.evaluate(({ screen }) => {
      const area = screen.getPrimaryDisplay().workArea;
      globalThis.__readfinchTest.select(
        {
          token: "ipc-control-only",
          text: "Trace fixture text.",
          app: "fixture",
          x: 300,
          y: 300,
          canReplace: false,
        },
        { x: area.x + 300, y: area.y + 300 },
      );
    });
    const end = Date.now() + 7000;
    let pill;
    while (Date.now() < end) {
      pill = app.windows().find((w) => w.url().includes("mode=pill"));
      if (pill && (await pill.locator(".toolbar-pins button").count())) break;
      await new Promise((r) => setTimeout(r, 80));
    }
    assert(pill);
    // A locked/fully occluded desktop may suspend compositor frames. This
    // control explicitly acknowledges paint to test IPC after the same show
    // gate; it does not validate rendering or native mouse delivery.
    await pill.evaluate(async () => {
      const state = await window.readfinch.call("toolbarState");
      await window.readfinch.call("toolbarPainted", {
        token: state.token,
        epoch: state.paintEpoch,
      });
    });
    // Deliberately invokes only the DOM path, without claiming it is a native
    // first-click test or attempting to send input to a locked desktop.
    await pill.evaluate(() =>
      document.querySelector(".toolbar-pins button").click(),
    );
    await new Promise((r) => setTimeout(r, 300));
    const trace = await readTrace();
    assert(
      trace.host.some(
        (e) =>
          e.kind === "selectionOpen" &&
          e.matched === true &&
          e.visible === true,
      ),
    );
    const panel = app.windows().find((w) => w.url().includes("mode=panel"));
    assert(panel);
    const interaction = await panel.evaluate(() =>
      window.readfinch.call("interactionGet"),
    );
    assert.equal(interaction.actionId, "translate");
    assert.equal(interaction.text, "Trace fixture text.");
    console.log(
      "Original v1.2.6 DOM → IPC → translation panel control passed. Native mouse delivery is still unverified.",
    );
  } else {
    console.log(
      "Recording original v1.2.6 native click diagnosis. No source text, prompts, credentials, key values or coordinates are recorded.",
    );
    console.log("Trace: " + file);
    const end = Date.now() + duration;
    while (Date.now() < end) {
      await readTrace();
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  console.log("Trace: " + file);
} finally {
  await app?.close();
}
