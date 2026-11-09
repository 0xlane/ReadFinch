import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { Diagnostics } from "../src/core/diagnostics.ts";

if (process.platform !== "win32") throw Error("Windows is required");
const dir = path.resolve(".local/selection-recovery-" + Date.now());
await mkdir(dir, { recursive: true });
const baseline = process.argv.includes("--baseline");
let modulePath = path.resolve("src/main/native.ts");
if (baseline) {
  modulePath = path.join(dir, "native-before.ts");
  await writeFile(
    modulePath,
    execFileSync("git", ["show", "v1.2.5:src/main/native.ts"]),
  );
}
const { SelectionService } = await import(pathToFileURL(modulePath).href);
const framework = path.join(
  process.env.WINDIR,
  "Microsoft.NET/Framework64/v4.0.30319",
);
for (const name of ["NativeTarget", "SuspendSelectionHelper"]) {
  execFileSync(path.join(framework, "csc.exe"), [
    "/nologo",
    `/out:${path.join(dir, name + ".exe")}`,
    "/r:System.Windows.Forms.dll",
    "/r:System.Drawing.dll",
    "/r:System.Web.Extensions.dll",
    path.resolve("tests/fixtures/" + name + ".cs"),
  ]);
}
const diagnostics = new Diagnostics(path.join(dir, "logs"));
const service = new SelectionService(path.resolve("native"), {
  diagnostic: (event) => diagnostics.record(event),
});
const states = [];
service.on("status", (s) => states.push({ ...s, time: Date.now() }));
const target = spawn(path.join(dir, "NativeTarget.exe"), [], {
  windowsHide: false,
  stdio: ["pipe", "pipe", "pipe"],
});
target.stderr.resume();
const events = [];
createInterface({ input: target.stdout }).on("line", (line) =>
  events.push(JSON.parse(line.replace(/^\uFEFF/, ""))),
);
async function waitFor(predicate, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = predicate();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 80));
  }
  throw Error("Timed out: " + service.status);
}
const text = "Small steps make a big difference.";
try {
  await waitFor(() => events.some((e) => e.id === "ready"));
  service.start();
  await waitFor(() => service.current?.text === text);
  const first = service.child;
  console.log("Real Windows Edit selection acquired.");
  if (!baseline) {
    target.stdin.write("hang\n");
    await waitFor(() => events.some((e) => e.id === "hang"));
    await waitFor(() => !service.current, 3000);
    await waitFor(() => service.current?.text === text, 10000);
    assert.equal(
      service.child,
      first,
      "bounded native messaging must not require a helper restart",
    );
    assert.equal(service.state, "ready");
    console.log(
      "Unresponsive editor timed out safely and recovered on the same helper.",
    );
    await service.replace(
      service.current.token,
      "A replacement verified after recovery.",
    );
    target.stdin.write("status\n");
    const reply = await waitFor(() => events.find((e) => e.id === "status"));
    assert(reply.text.startsWith("A replacement verified after recovery."));
    target.stdin.write("select\n");
    await waitFor(
      () => service.current?.text === "A replacement verified after recovery.",
    );
  }
  const expected = service.current.text;
  const oldToken = service.current.token;
  execFileSync(path.join(dir, "SuspendSelectionHelper.exe"), [
    String(first.pid),
  ]);
  console.log(
    "Suspended only the test-owned native helper to simulate a permanently blocked accessibility call.",
  );
  if (baseline) {
    await waitFor(() => service.state === "error");
    await new Promise((r) => setTimeout(r, 2000));
    assert.equal(service.child, first);
    assert.equal(first.killed, false);
    console.log(
      "REPRODUCED v1.2.5: timeout status persists; stalled helper is never replaced.",
    );
  } else {
    await waitFor(
      () =>
        service.child &&
        service.child !== first &&
        service.current?.text === expected,
      25000,
    );
    assert.equal(service.state, "ready");
    assert.notEqual(service.current.token, oldToken);
    assert(
      first.exitCode !== null || first.signalCode !== null,
      "old process must exit before recovery",
    );
    assert(states.some((s) => s.state === "starting"));
    assert.equal((await service.readCurrent())?.text, expected);
    const report = await diagnostics.snapshot();
    assert(
      report.events.some(
        (e) =>
          e.event === "operation_error" &&
          e.code === "TimeoutException" &&
          e.probe?.app === "NativeTarget" &&
          e.probe?.stage === "edit-selection",
      ),
    );
    assert(report.events.some((e) => e.event === "heartbeat_timeout"));
    assert(report.events.some((e) => e.event === "helper_retry"));
    assert(report.events.filter((e) => e.event === "helper_ready").length >= 2);
    assert(!JSON.stringify(report).includes(text));
    assert(!JSON.stringify(report).includes(expected));
    await writeFile(
      path.join(dir, "diagnostics.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(
      "Diagnostic export identified NativeTarget / edit-selection / TimeoutException and helper recovery, without selected text.",
    );
    console.log(
      "PASS: helper retired, fresh native selection and shortcut read recovered without restarting the app.",
    );
  }
  await writeFile(
    path.join(dir, "verification.json"),
    JSON.stringify({ baseline, passed: true, states }, null, 2),
  );
  console.log(dir);
} finally {
  service.stop();
  target.kill();
}
