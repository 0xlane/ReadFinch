import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  readdir,
  stat,
  writeFile,
  rm,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Diagnostics } from "../src/core/diagnostics";

test("diagnostics persist only allowlisted fields, and exports omit private text and paths", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "readfinch-logs-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const logs = new Diagnostics(dir);
  logs.record({
    event: "heartbeat_timeout",
    probe: {
      stage: "uia-text",
      targetPid: 123,
      app: "notepad++",
      text: "secret selected text",
      windowTitle: "private document",
    },
    heartbeatAgeMs: 12000,
    apiKey: "sk-secret",
    message: "C:\\Users\\private\\document.txt",
    clipboard: "secret clipboard",
  });
  logs.record({
    event: "helper_error",
    code: "EACCES",
    stack: "private stack",
  });
  logs.record({ event: "helper_error", code: "sk-secret" });
  const report = await logs.snapshot();
  assert.equal(report.events.length, 2);
  const disk = await readFile(path.join(dir, "selection.jsonl"), "utf8");
  for (const value of [
    "secret",
    "private",
    "clipboard",
    "windowTitle",
    "apiKey",
    "stack",
  ])
    assert(!disk.includes(value));
  assert.equal(report.events[0].probe?.app, "notepad++");
  const restored = new Diagnostics(dir);
  assert.deepEqual((await restored.snapshot()).events, report.events);
  // Re-validate on export, including content modified outside the logger.
  await writeFile(
    path.join(dir, "selection.jsonl"),
    disk +
      JSON.stringify({
        time: new Date().toISOString(),
        event: "helper_start",
        apiKey: "sk-secret",
      }) +
      "\npartial",
  );
  assert(!JSON.stringify(await restored.snapshot()).includes("secret"));
});

test("diagnostic logs rotate within a fixed disk budget and retain newest faults", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "readfinch-log-rotation-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const logs = new Diagnostics(dir, 256);
  for (let attempt = 1; attempt <= 30; attempt++) {
    logs.record({ event: "helper_retry", attempt, delayMs: 500 });
    await logs.snapshot();
  }
  const files = await readdir(dir);
  assert.equal(files.length, 3);
  for (const file of files)
    assert((await stat(path.join(dir, file))).size <= 256);
  const report = await logs.snapshot();
  assert.equal(report.events.at(-1)?.attempt, 30);
  assert(report.events.length < 30);
});

test("logging failure and event floods never break selection or build an unbounded queue", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "readfinch-log-failure-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const blocked = path.join(dir, "file");
  await writeFile(blocked, "fixture");
  const broken = new Diagnostics(blocked);
  assert.doesNotThrow(() => broken.record({ event: "helper_start" }));
  await assert.rejects(broken.snapshot());
  const logs = new Diagnostics(path.join(dir, "working"));
  for (let n = 0; n < 1000; n++) logs.record({ event: "helper_start" });
  const report = await logs.snapshot();
  assert(report.events.length <= 128);
  assert(report.droppedRecords >= 872);
});
