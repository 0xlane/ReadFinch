import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { SelectionService } from "../src/main/native";

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
