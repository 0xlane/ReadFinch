import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";

const { version, productName } = JSON.parse(
  await readFile("package.json", "utf8"),
);
const files = [
  `release/${productName} ${version}.exe`,
  `release/${productName} Setup ${version}.exe`,
  `release/win-unpacked/${productName}.exe`,
  "release/win-unpacked/resources/app.asar",
];
const artifacts = [];
for (const path of files) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  artifacts.push({
    path,
    bytes: (await stat(path)).size,
    sha256: hash.digest("hex"),
  });
}
await writeFile(
  "docs/release-manifest.json",
  JSON.stringify(
    {
      date: new Date().toISOString(),
      version,
      platform: "Windows x64",
      signed: false,
      artifacts,
      verification:
        "Windows packaged checks use an isolated profile and local fixtures. See installation-verification.json for the separately verified current-user installation; interactive installer and uninstaller UI were not exercised.",
    },
    null,
    2,
  ) + "\n",
);
console.log(`Release manifest written for ${version}.`);
