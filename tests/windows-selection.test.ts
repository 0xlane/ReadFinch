import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test(
  "Windows mouse gestures, keyboard suppression and toolbar snapshot lifetime",
  { skip: process.platform !== "win32" },
  () => {
    const dir = mkdtempSync(path.join(tmpdir(), "readfinch-selection-"));
    try {
      const executable = path.join(dir, "selection-check.exe");
      execFileSync(
        path.join(
          process.env.WINDIR ?? "C:/Windows",
          "Microsoft.NET/Framework64/v4.0.30319/csc.exe",
        ),
        [
          "/nologo",
          "/r:System.Drawing.dll",
          "/out:" + executable,
          path.resolve("native/windows/SelectionInteraction.cs"),
          path.resolve("tests/fixtures/WindowsSelectionInteraction.cs"),
        ],
        { stdio: "inherit", windowsHide: true },
      );
      execFileSync(executable, { stdio: "inherit", windowsHide: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
