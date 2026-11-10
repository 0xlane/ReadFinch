import { copyFileSync, mkdirSync, existsSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
mkdirSync("native/bin", { recursive: true });
if (process.platform === "win32") {
  const jdk = process.env.JAVA_HOME;
  const bridge = "WindowsAccessBridge-64.dll";
  if (!jdk || !existsSync(path.join(jdk, "bin", bridge)))
    throw Error(
      "Set JAVA_HOME to an x64 OpenJDK with Java Access Bridge (Temurin 21 recommended).",
    );
  for (const file of [bridge, "vcruntime140.dll"])
    copyFileSync(path.join(jdk, "bin", file), path.join("native/bin", file));
  const notices = "native/bin/openjdk";
  for (const module of ["java.base", "jdk.accessibility"]) {
    const dest = path.join(notices, "legal", module);
    mkdirSync(dest, { recursive: true });
    for (const name of [
      "LICENSE",
      "ASSEMBLY_EXCEPTION",
      "ADDITIONAL_LICENSE_INFO",
    ])
      copyFileSync(
        path.join(jdk, "legal", module, name),
        path.join(dest, name),
      );
  }
  copyFileSync(path.join(jdk, "release"), path.join(notices, "release"));
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
      `/out:${path.resolve("native/bin/readfinch-selection.exe")}`,
      "/r:System.Web.Extensions.dll",
      "/r:System.Windows.Forms.dll",
      "/r:System.Drawing.dll",
      `/r:${path.join(framework, "WPF/UIAutomationClient.dll")}`,
      `/r:${path.join(framework, "WPF/UIAutomationTypes.dll")}`,
      `/r:${path.join(framework, "WPF/WindowsBase.dll")}`,
      path.resolve("native/windows/SelectionBridge.cs"),
      path.resolve("native/windows/JavaSelection.cs"),
      path.resolve("native/windows/SelectionInteraction.cs"),
      path.resolve("native/windows/SelectionInput.cs"),
    ],
    { stdio: "inherit" },
  );
} else if (process.platform === "darwin") {
  const headers = path.join(
    path.dirname(path.dirname(realpathSync(process.execPath))),
    "include/node",
  );
  if (!existsSync(path.join(headers, "node_api.h")))
    throw Error(
      "Node.js development headers are required to build the macOS panel bridge.",
    );
  execFileSync(
    "clang++",
    [
      "-std=c++17",
      "-fobjc-arc",
      "-dynamiclib",
      "-undefined",
      "dynamic_lookup",
      "-DNAPI_VERSION=8",
      "-I",
      headers,
      "-framework",
      "AppKit",
      "native/macos/PanelWindow.mm",
      "-o",
      "native/bin/readfinch-panel.node",
    ],
    { stdio: "inherit", timeout: 120000 },
  );

  execFileSync(
    "swiftc",
    [
      "native/macos/SelectionBridge.swift",
      "native/macos/SelectionReading.swift",
      "-o",
      "native/bin/readfinch-selection",
    ],
    { stdio: "inherit" },
  );
}
