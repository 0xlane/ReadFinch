import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import electron from "electron";

if (process.platform !== "darwin") throw Error("Requires macOS");
const directory = await mkdtemp(path.join(tmpdir(), "readfinch-panel-abi-"));
const entry = path.join(directory, "check.cjs");
const bridge = path.resolve("native/bin/readfinch-panel.node");
await writeFile(
  entry,
  `
const {app, BrowserWindow} = require('electron');
const assert = require('node:assert/strict');
app.setPath('userData', ${JSON.stringify(directory)});
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const bridge = require(${JSON.stringify(bridge)});
  const main = new BrowserWindow({show:false});
  const panel = new BrowserWindow({show:false,type:'panel',frame:false});
  await Promise.all([main.loadURL('about:blank'), panel.loadURL('about:blank')]);
  try {
    assert.equal(bridge.configure(main.getNativeWindowHandle()), false);
    assert.equal(bridge.configure(panel.getNativeWindowHandle()), true);
    assert.equal(bridge.configure(panel.getNativeWindowHandle()), true);
    assert.equal(bridge.makeKeyWindow(panel.getNativeWindowHandle()), false);
    assert.equal(main.isVisible(), false);
    assert.equal(panel.isVisible(), false);
    console.log('Native panel bridge loads, preserves normal windows, and configures panels idempotently.');
  } finally { panel.destroy(); main.destroy(); }
  setImmediate(() => app.quit());
}).catch(error => {console.error(error);app.exit(1);});
`,
);
try {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const { stdout } = await promisify(execFile)(electron, [entry], {
    env,
    timeout: 30000,
    killSignal: "SIGKILL",
    maxBuffer: 1024 * 1024,
  });
  process.stdout.write(stdout);
} finally {
  await rm(directory, { recursive: true, force: true });
}
