import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test(
  "macOS AX selection ranges, web text markers, secure fields, and mixed-display anchors",
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
