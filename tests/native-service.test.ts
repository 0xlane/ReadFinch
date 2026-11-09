import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { SelectionService } from "../src/main/native";
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";
import type { Selection } from "../src/shared/api";

class FakeHelper extends EventEmitter {
  pid: number | undefined = 100;
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed = false;
  kills = 0;
  kill() {
    this.killed = true;
    this.kills++;
    return true;
  }
  send(value: object) {
    this.stdout.emit("data", JSON.stringify(value) + "\n");
  }
  exit() {
    this.emit("exit", 1, null);
  }
}
function windowsFixture(t: TestContext) {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"] });
  const helpers: FakeHelper[] = [];
  const diagnostics: unknown[] = [];
  const service = new SelectionService("fixture", {
    platform: "win32",
    diagnostic: (event) => diagnostics.push(event),
    spawn: () => {
      const helper = new FakeHelper();
      helpers.push(helper);
      return helper as unknown as ChildProcessWithoutNullStreams;
    },
  });
  t.after(() => service.stop());
  service.start();
  helpers[0].send({ type: "ready", message: "Windows UI Automation 已连接" });
  // Advance the wall clock with the callbacks, rather than jumping Date to
  // the end before the first watchdog tick is dispatched.
  return {
    service,
    helpers,
    diagnostics,
    tick: (ms: number) => {
      while (ms > 0) {
        const step = Math.min(ms, 500);
        t.mock.timers.tick(step);
        ms -= step;
      }
    },
  };
}
const selected = {
  type: "selection",
  token: "old",
  text: "Fixture",
  app: "fixture",
  x: 0,
  y: 0,
  canReplace: true,
};

test("timeout diagnostics retain the last app and operation but not content, and progress cannot mask a hang", (t) => {
  const { helpers, tick, diagnostics } = windowsFixture(t);
  helpers[0].send({ ...selected, text: "PRIVATE SOURCE" });
  for (let n = 0; n < 12; n++) {
    helpers[0].send({
      type: "probe",
      stage: "uia-text",
      targetPid: 42,
      app: "notepad++",
      text: "PRIVATE SOURCE",
      clipboard: "PRIVATE CLIPBOARD",
    });
    tick(1000);
  }
  const timeout = diagnostics.find(
    (d: any) => d.event === "heartbeat_timeout",
  ) as any;
  assert.deepEqual(timeout.probe, {
    stage: "uia-text",
    targetPid: 42,
    app: "notepad++",
  });
  assert(timeout.heartbeatAgeMs >= 10000);
  assert(!JSON.stringify(diagnostics).includes("PRIVATE"));
  assert.equal(helpers[0].kills, 1);
});

test("Windows retires a hung worker before restarting and ignores its late events", async (t) => {
  const { service, helpers, tick } = windowsFixture(t);
  const first = helpers[0];
  first.send(selected);
  tick(10500);
  const read = service.readCurrent();
  const replacement = assert.rejects(
    service.replace("old", "Revised"),
    /替换未确认/,
  );
  tick(1500);
  assert.equal(first.kills, 1);
  assert.equal(service.state, "starting");
  assert.equal(service.current, undefined);
  assert.equal(await read, undefined);
  await replacement;
  tick(3000);
  assert.equal(
    helpers.length,
    1,
    "must wait for exit, even if termination is delayed",
  );
  assert.equal(first.kills, 2);
  first.send(selected);
  assert.equal(service.current, undefined);
  first.exit();
  tick(499);
  assert.equal(helpers.length, 1);
  tick(1);
  assert.equal(helpers.length, 2);
  first.send({ type: "error", message: "old error" });
  first.send(selected);
  first.exit();
  assert.equal(service.current, undefined);
  assert.equal(service.state, "starting");
  assert.equal(
    helpers[1].stdin.read(),
    null,
    "never replay replacement or refresh commands",
  );
  helpers[1].send({ type: "ready", message: "Reconnected" });
  helpers[1].send({ ...selected, token: "new" });
  assert.equal(service.state, "ready");
  assert.equal((service.current as Selection | undefined)?.token, "new");
});

test("Windows unexpected exits recover, with capped backoff until sustained health", (t) => {
  const { service, helpers, tick } = windowsFixture(t);
  for (const delay of [500, 1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
    const count = helpers.length;
    helpers.at(-1)!.exit();
    tick(delay - 1);
    assert.equal(helpers.length, count);
    tick(1);
    assert.equal(helpers.length, count + 1);
    helpers.at(-1)!.send({ type: "ready", message: "Connected" });
  }
  for (let n = 0; n < 30; n++) {
    tick(1000);
    helpers.at(-1)!.send({ type: "heartbeat" });
  }
  assert.equal(service.state, "ready");
  const count = helpers.length;
  helpers.at(-1)!.exit();
  tick(500);
  assert.equal(helpers.length, count + 1, "healthy heartbeats reset backoff");
});

test("Windows spawn failures retry once per backoff, not twice for error and exit", (t) => {
  const { helpers, tick } = windowsFixture(t);
  helpers[0].pid = undefined;
  helpers[0].emit("error", Error("ENOENT"));
  helpers[0].exit();
  tick(500);
  assert.equal(helpers.length, 2);
});

test("stop cancels scheduled recovery and late exits cannot restart a stopped service", (t) => {
  const { service, helpers, tick } = windowsFixture(t);
  helpers[0].exit();
  service.stop();
  tick(60000);
  helpers[0].exit();
  assert.equal(helpers.length, 1);
  service.start();
  service.start();
  assert.equal(helpers.length, 2, "start is idempotent");
  helpers[0].send(selected);
  assert.equal(service.current, undefined);
  service.stop();
  helpers[1].exit();
  tick(60000);
  assert.equal(helpers.length, 2);
});

test("Windows helper with healthy heartbeats is not restarted during long sessions", (t) => {
  const { service, helpers, tick } = windowsFixture(t);
  for (let n = 0; n < 8 * 60 * 60; n++) {
    tick(1000);
    helpers[0].send({ type: "heartbeat" });
  }
  assert.equal(service.state, "ready");
  assert.equal(helpers.length, 1);
  assert.equal(helpers[0].kills, 0);
});

async function fixture(t: TestContext, code: string) {
  const dir = await mkdtemp(path.join(tmpdir(), "readfinch-native-"));
  await mkdir(path.join(dir, "bin"));
  await writeFile(
    path.join(dir, "bin/readfinch-selection"),
    `#!${process.execPath}\n${code}`,
    { mode: 0o700 },
  );
  const service = new SelectionService(dir);
  t.after(async () => {
    service.stop();
    await rm(dir, { recursive: true, force: true });
  });
  return service;
}
// These fixtures exercise the macOS process protocol without desktop permissions.
const macOnly = { skip: process.platform !== "darwin" };
const childOf = (service: SelectionService) =>
  (service as unknown as { child: ChildProcessWithoutNullStreams }).child;

test(
  "an exited helper retains its actionable error instead of becoming a timeout",
  macOnly,
  async (t) => {
    const service = await fixture(
      t,
      `console.log(JSON.stringify({type:"error",message:"Allow Accessibility"})); process.exit(1);`,
    );
    t.mock.timers.enable({ apis: ["setInterval", "Date"] });
    service.start();
    await once(childOf(service), "close");
    assert.equal(service.status, "Allow Accessibility");
    t.mock.timers.tick(30000);
    assert.equal(service.status, "Allow Accessibility");
    assert.equal(service.state, "error");
  },
);

test(
  "permission wait survives heartbeats and reconnects without restarting",
  macOnly,
  async (t) => {
    const service = await fixture(
      t,
      `
    console.log(JSON.stringify({type:"permission",message:"Allow Accessibility"}));
    require("node:readline").createInterface({input:process.stdin}).on("line", line => console.log(line));
  `,
    );
    t.mock.timers.enable({ apis: ["setInterval", "Date"] });
    const waiting = once(service, "status");
    service.start();
    await waiting;
    assert.equal(service.state, "limited");
    t.mock.timers.tick(30000);
    assert.equal(service.status, "Allow Accessibility");
    const connected = once(service, "status");
    childOf(service).stdin.write(
      JSON.stringify({ type: "ready", message: "Connected" }) + "\n",
    );
    await connected;
    assert.equal(service.state, "ready");
    const selected = once(service, "selection");
    childOf(service).stdin.write(
      JSON.stringify({
        type: "selection",
        token: "fixture",
        text: "Fixture text",
        app: "fixture",
        x: 0,
        y: 0,
        canReplace: false,
      }) + "\n",
    );
    await selected;
    assert.equal(service.current?.text, "Fixture text");
    const revoked = once(service, "status");
    childOf(service).stdin.write(
      JSON.stringify({ type: "permission", message: "Allow Accessibility" }) +
        "\n",
    );
    await revoked;
    assert.equal(service.state, "limited");
    assert.equal(service.current, undefined);
  },
);
