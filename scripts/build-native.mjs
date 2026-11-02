import { mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
mkdirSync("native/bin", { recursive: true });
if (process.platform === "win32") {
  const framework = path.join(
    process.env.WINDIR ?? "C:/Windows",
    "Microsoft.NET/Framework64/v4.0.30319",
  );
  const csc = path.join(framework, "csc.exe");
  if (!existsSync(csc))
    throw Error(
      "Install .NET Framework 4.8 developer tools to build the selection helper.",
    );
  execFileSync(
    csc,
    [
      "/nologo",
      "/target:exe",
      "/platform:anycpu",
      `/out:${path.resolve("native/bin/texthop-selection.exe")}`,
      "/r:System.Web.Extensions.dll",
      `/r:${path.join(framework, "WPF/UIAutomationClient.dll")}`,
      `/r:${path.join(framework, "WPF/UIAutomationTypes.dll")}`,
      `/r:${path.join(framework, "WPF/WindowsBase.dll")}`,
      path.resolve("native/windows/SelectionBridge.cs"),
    ],
    { stdio: "inherit" },
  );
} else if (process.platform === "darwin") {
  execFileSync(
    "swiftc",
    [
      "native/macos/SelectionBridge.swift",
      "-o",
      "native/bin/texthop-selection",
    ],
    { stdio: "inherit" },
  );
}
