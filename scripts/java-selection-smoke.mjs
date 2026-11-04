import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as pause } from "node:timers/promises";
import { _electron as electron } from "playwright";

if (process.platform !== "win32")
  throw Error("Requires a Windows desktop and an x64 JDK.");
const dir = path.resolve(".local/java-selection-" + Date.now());
await mkdir(dir, { recursive: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.READFINCH_TEST_HOOKS;
const packaged = process.argv
  .find((arg) => arg.startsWith("--executable="))
  ?.slice("--executable=".length);
const withoutBridge = process.argv.includes("--without-bridge");
const app = await electron.launch({
  ...(packaged ? { executablePath: path.resolve(packaged) } : {}),
  args: [...(packaged ? [] : ["."]), "--settings", "--data-dir=" + dir],
  env,
});
let target;
try {
  const main = await app.firstWindow();
  await main.locator("main h1").waitFor();
  if (withoutBridge)
    await main.evaluate(async () => {
      const { config, revision } = await window.readfinch.call("snapshot");
      config.shortcuts.selection = "Control+Alt+Shift+F10";
      await window.readfinch.call("saveConfig", { config, revision });
    });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].hide(),
  );
  const selection = () =>
    main.evaluate(() => window.readfinch.call("selectionGet"));
  const toolbarVisible = () =>
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some(
        (w) => w.webContents.getURL().includes("mode=pill") && w.isVisible(),
      ),
    );
  const until = async (read, condition, message) => {
    const deadline = Date.now() + 12000;
    do {
      const value = await read();
      if (condition(value)) return value;
      await pause(80);
    } while (Date.now() < deadline);
    throw Error(message);
  };
  target = spawn(
    path.join(process.env.JAVA_HOME, "bin/java.exe"),
    [
      "-Djavax.accessibility.assistive_technologies=" +
        (withoutBridge ? "" : "com.sun.java.accessibility.AccessBridge"),
      path.resolve("tests/fixtures/SelectionSwingTarget.java"),
    ],
    { windowsHide: true, stdio: ["pipe", "pipe", "inherit"] },
  );
  const replies = createInterface({ input: target.stdout })[
    Symbol.asyncIterator
  ]();
  const reply = () =>
    Promise.race([replies.next(), pause(10000, {}, { ref: false })]);
  const ready = /^ready (\d+)$/.exec((await reply()).value ?? "");
  assert.ok(ready, "Swing fixture failed to start");
  const focusProbe = path.join(dir, "FocusSwingWindow.exe");
  execFileSync(
    path.join(
      process.env.WINDIR,
      "Microsoft.NET/Framework64/v4.0.30319/csc.exe",
    ),
    [
      "/nologo",
      "/out:" + focusProbe,
      path.resolve("tests/fixtures/FocusSwingWindow.cs"),
    ],
    { windowsHide: true },
  );
  const focusFixture = () =>
    execFileSync(focusProbe, [ready[1]], { windowsHide: true });
  focusFixture();
  async function command(name) {
    target.stdin.write(name + "\n");
    const next = await reply();
    assert.equal(next.value, name, "Swing fixture did not acknowledge " + name);
  }
  await command("first");
  if (withoutBridge) {
    // Allow the client to discover any registered JVM before requesting help.
    await pause(2200);
    assert.ok((await selection()) == null);
    focusFixture();
    await command("shortcut");
    const panel = await until(
      () => app.windows().find((w) => w.url().includes("mode=panel")),
      Boolean,
      "Selection shortcut did not open a panel",
    );
    await panel
      .locator(".selection-fallback")
      .getByText(/Java Access Bridge/)
      .waitFor();
    console.log(
      "A real selection shortcut shows Java setup help when the bridge is disabled.",
    );
  } else {
    const matches = (s) =>
      s?.app === "java" && s.text === "HttpHeaders" && !s.canReplace;
    const first = await until(
      selection,
      matches,
      "Java editor selection was not read",
    ).catch(async (error) => {
      target.stdin.write("focus\n");
      const focus = (await reply()).value;
      const { nativeState, nativeStatus } = await main.evaluate(() =>
        window.readfinch.call("snapshot"),
      );
      throw Error(
        error.message +
          " " +
          JSON.stringify({ focus, nativeState, nativeStatus }),
      );
    });
    await until(toolbarVisible, Boolean, "Automatic toolbar did not appear");
    const pill = app.windows().find((w) => w.url().includes("mode=pill"));
    await pill.getByRole("toolbar").getByRole("button").first().waitFor();
    await pause(600);
    assert.equal(
      (await selection())?.token,
      first.token,
      "A stationary selection flickered",
    );
    await command("second");
    await until(
      selection,
      (s) => matches(s) && s.token !== first.token,
      "Second occurrence was missed",
    );
    await command("long");
    await until(
      selection,
      (s) => s?.app === "java" && s.text === "alpha 你好 ".repeat(200),
      "Java selection was truncated",
    );
    for (const name of ["clear", "password"]) {
      if (name === "password") {
        await command("nontext");
        await until(
          async () => {
            target.stdin.write("focus\n");
            return (await reply()).value;
          },
          (focus) => focus?.endsWith("toolFocused=true"),
          "Fixture tool window did not take focus",
        );
        await until(
          selection,
          matches,
          "Editor under the pointer was missed while a tool window had focus",
        );
        await until(
          toolbarVisible,
          Boolean,
          "Toolbar did not open for the pointed editor",
        );
      }
      await command(name);
      await until(
        selection,
        (s) => s == null,
        "Unexpected selection after " + name,
      );
      await until(
        toolbarVisible,
        (visible) => !visible,
        "Toolbar remained after " + name,
      );
      await pause(350);
      assert.ok(
        (await selection()) == null,
        "Stale Java selection after " + name,
      );
    }
    console.log(
      "Swing selection, tool-window focus, automatic toolbar, duplicate words, long Unicode selections, deselection and password fields passed.",
    );
  }
} finally {
  target?.stdin.end("quit\n");
  await app.close();
}
