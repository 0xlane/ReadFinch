import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  canReplaceMacApplication,
  macApplication,
  prepareMacUpdate,
} from "../src/core/macos-update";

test("macOS application paths reject development executables and missing helpers", () => {
  assert.equal(
    macApplication("/Applications/ReadFinch.app/Contents/MacOS/ReadFinch"),
    "/Applications/ReadFinch.app",
  );
  assert.equal(
    canReplaceMacApplication(process.execPath, "/missing-updater"),
    false,
  );
});

test("macOS updater commits only after staging is ready and reports helper failures", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "readfinch-update-ipc-"));
  try {
    const receipt = path.join(dir, "committed");
    const options = {
      helper: "fixture",
      application: "/Applications/ReadFinch.app",
      downloaded: "/tmp/package.dmg",
      version: "1.1.0",
      dataDirectory: dir,
      file: {
        platform: "darwin" as const,
        arch: "x64" as const,
        kind: "dmg" as const,
        name: "fixture.dmg",
        size: 123,
        sha512: "fixture",
      },
    };
    const source = `
      import { createInterface } from 'node:readline';
      import { writeFileSync } from 'node:fs';
      const reader = createInterface({ input: process.stdin });
      let first = true;
      reader.on('line', line => {
        if (first) {
          first = false;
          const request = JSON.parse(line);
          if (request.size !== 123 || request.version !== '1.1.0') process.exit(1);
          process.stdout.write('ready\\n');
        } else if (line === 'commit') {
          writeFileSync(${JSON.stringify(receipt)}, 'yes');
          process.exit(0);
        }
      });
    `;
    const launch = (source: string) =>
      ((
        _file: string,
        _args: string[],
        settings: Parameters<typeof spawn>[2],
      ) =>
        spawn(
          process.execPath,
          ["--input-type=module", "-e", source],
          settings,
        )) as typeof spawn;
    const commit = await prepareMacUpdate(options, launch(source));
    await assert.rejects(readFile(receipt));
    await commit();
    for (let attempt = 0; attempt < 100; attempt++) {
      if ((await readFile(receipt, "utf8").catch(() => "")) === "yes") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(await readFile(receipt, "utf8"), "yes");
    await assert.rejects(commit());
    await assert.rejects(
      prepareMacUpdate(options, launch("console.log('error:packageMismatch')")),
      /无法自动替换/,
    );
    await assert.rejects(
      prepareMacUpdate(options, launch("process.exit(1)")),
      /无法自动替换/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test(
  "macOS native updater stages real DMGs and rolls back failed launches",
  { skip: process.platform !== "darwin", timeout: 180000 },
  async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "readfinch-update-native-"));
    try {
      const binary = path.join(dir, "installer-test");
      const helper = path.join(dir, "readfinch-updater");
      const host = path.join(dir, "fixture-host");
      execFileSync(
        "swiftc",
        [
          "native/macos/UpdateInstaller.swift",
          "native/macos/UpdateHelper.swift",
          "-o",
          helper,
        ],
        { stdio: "inherit", timeout: 120000 },
      );
      execFileSync(
        "swiftc",
        [
          "-parse-as-library",
          "tests/fixtures/macos-update/Host.swift",
          "-o",
          host,
        ],
        { stdio: "inherit", timeout: 120000 },
      );
      execFileSync(
        "swiftc",
        [
          "native/macos/UpdateInstaller.swift",
          "tests/fixtures/macos-update/main.swift",
          "-o",
          binary,
        ],
        { stdio: "inherit", timeout: 120000 },
      );
      execFileSync(binary, [helper, host], {
        stdio: "inherit",
        timeout: 120000,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
