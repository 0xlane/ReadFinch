import { createHash } from "node:crypto";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import {
  binaryIdentifier,
  requirement,
  run,
  signingTool,
  withIdentity,
} from "./macos-signing.mjs";

const macho = new Set([
  0xfeedface, 0xcefaedfe, 0xfeedfacf, 0xcffaedfe, 0xcafebabe, 0xbebafeca,
  0xcafebabf, 0xbfbafeca,
]);
export async function entities(app) {
  const bundles = [],
    binaries = [],
    mainExecutables = new Set();
  async function walk(file) {
    const info = await lstat(file);
    if (info.isSymbolicLink()) return;
    if (info.isDirectory()) {
      if (file.endsWith(".app") || file.endsWith(".framework")) {
        const plist = file.endsWith(".app")
          ? path.join(file, "Contents/Info.plist")
          : path.join(file, "Resources/Info.plist");
        const identifier = run("/usr/libexec/PlistBuddy", [
          "-c",
          "Print :CFBundleIdentifier",
          plist,
        ]).trim();
        const executable = run("/usr/libexec/PlistBuddy", [
          "-c",
          "Print :CFBundleExecutable",
          plist,
        ]).trim();
        const main = file.endsWith(".app")
          ? path.join(file, "Contents/MacOS", executable)
          : path.join(file, executable);
        mainExecutables.add(await realpath(main));
        bundles.push({
          file,
          binary: await realpath(main),
          identifier,
          application: file.endsWith(".app"),
        });
      }
      for (const child of await readdir(file))
        await walk(path.join(file, child));
    } else if (info.isFile() && info.size >= 4 && !file.endsWith(".class")) {
      const handle = await open(file, "r");
      try {
        const header = Buffer.alloc(4);
        await handle.read(header, 0, 4, 0);
        if (macho.has(header.readUInt32BE())) binaries.push(file);
      } finally {
        await handle.close();
      }
    }
  }
  await walk(app);
  return [
    ...bundles,
    ...binaries
      .filter((file) => !mainExecutables.has(file))
      .map((file) => ({
        file,
        binary: file,
        identifier: binaryIdentifier(
          path.relative(app, file).split(path.sep).join("/"),
        ),
        application: false,
      })),
  ];
}

export default async function sign(options) {
  const tool = await signingTool();
  return withIdentity(async ({ dir, p12, password, certificate }) => {
    const args = [
      "sign",
      "--config-file",
      "/dev/null",
      "--p12-file",
      p12,
      "--p12-password-file",
      password,
      "--timestamp-url",
      "none",
    ];
    const items = await entities(options.app);
    for (const item of items) {
      const relative = path
        .relative(options.app, item.file)
        .split(path.sep)
        .join("/");
      const scoped = (value) => (relative ? `${relative}:${value}` : value);
      const compiled = path.join(
        dir,
        createHash("sha256").update(relative).digest("hex") + ".req",
      );
      run("/usr/bin/csreq", [
        "-r",
        "=" + requirement(item.identifier, certificate),
        "-b",
        compiled,
      ]);
      args.push(
        "--binary-identifier",
        scoped(item.identifier),
        "--code-requirements-file",
        scoped(compiled),
      );
      if (item.application) {
        const settings = await options.optionsForFile?.(item.file);
        if (settings?.entitlements)
          args.push("--entitlements-xml-file", scoped(settings.entitlements));
      }
    }
    run(tool, [...args, options.app]);
    console.log(
      `Signed ${items.length} code entities with the pinned ReadFinch certificate.`,
    );
  });
}
