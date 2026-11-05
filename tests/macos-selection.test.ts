import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test(
  "macOS AX selections, secure fields, mixed-display anchors, and mouse-to-toolbar lifetime",
  { skip: process.platform !== "darwin" },
  () => {
    const dir = mkdtempSync(path.join(tmpdir(), "readfinch-ax-"));
    try {
      const executable = path.join(dir, "selection-check");
      execFileSync(
        "swiftc",
        [
          "native/macos/SelectionReading.swift",
          "tests/fixtures/macos/main.swift",
          "-o",
          executable,
        ],
        { stdio: "inherit" },
      );
      execFileSync(executable, { stdio: "inherit" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
