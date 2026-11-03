import { createHash, createPublicKey, sign } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { verifyManifest } from "../src/core/update-manifest.ts";

const directory = path.resolve(process.argv[2] ?? "release-assets");
const { version } = JSON.parse(await readFile("package.json", "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(version))
  throw Error("Only stable versions can be published by this workflow.");
if (
  process.env.GITHUB_REF_TYPE === "tag" &&
  process.env.GITHUB_REF_NAME !== "v" + version
)
  throw Error("Release tag does not match package.json.");
const privateKey = process.env.UPDATE_SIGNING_PRIVATE_KEY;
if (!privateKey)
  throw Error(
    "UPDATE_SIGNING_PRIVATE_KEY must be configured in GitHub Actions.",
  );
const { publicKey } = JSON.parse(
  await readFile("src/shared/update-key.json", "utf8"),
);
if (
  createPublicKey(privateKey).export({ type: "spki", format: "pem" }) !==
  publicKey
)
  throw Error("Signing key does not match the public key embedded in the app.");
const files = [],
  checksums = [];
const assetPattern = new RegExp(
  `^ReadFinch-${version.replaceAll(".", "\\.")}-(windows|macos|linux)-(x64|arm64)(?:-(setup|portable))?\.(exe|dmg|zip|deb|AppImage)$`,
);
for (const name of (await readdir(directory)).sort()) {
  const match = assetPattern.exec(name);
  if (!match) throw Error("Unexpected release artifact: " + name);
  const fullPath = path.join(directory, name),
    metadata = await stat(fullPath);
  if (!metadata.isFile() || metadata.size === 0)
    throw Error("Empty release artifact: " + name);
  const sha512 = createHash("sha512"),
    sha256 = createHash("sha256");
  for await (const bytes of createReadStream(fullPath)) {
    sha512.update(bytes);
    sha256.update(bytes);
  }
  checksums.push(sha256.digest("hex") + "  " + name);
  const [, platform, arch, variant, extension] = match;
  if (extension === "zip") continue; // macOS zip is offered as an alternative download.
  files.push({
    platform:
      platform === "windows"
        ? "win32"
        : platform === "macos"
          ? "darwin"
          : "linux",
    arch,
    kind:
      variant === "setup"
        ? "nsis"
        : variant === "portable"
          ? "portable"
          : extension,
    name,
    size: metadata.size,
    sha512: sha512.digest("base64"),
  });
}
for (const required of [
  "win32/x64/nsis",
  "win32/x64/portable",
  "darwin/arm64/dmg",
  "darwin/x64/dmg",
  "linux/x64/AppImage",
  "linux/x64/deb",
]) {
  if (
    !files.some(
      (file) => `${file.platform}/${file.arch}/${file.kind}` === required,
    )
  )
    throw Error("Missing required release artifact: " + required);
}
const notes = (await readFile(`docs/releases/v${version}.md`, "utf8"))
  .replace(/^#+\s*/gm, "")
  .trim();
const manifest = Buffer.from(
  JSON.stringify(
    { schema: 1, version, publishedAt: new Date().toISOString(), notes, files },
    null,
    2,
  ) + "\n",
);
const signature = sign(null, manifest, privateKey).toString("base64");
verifyManifest(manifest, signature, publicKey);
await writeFile(path.join(directory, "readfinch-update.json"), manifest);
await writeFile(
  path.join(directory, "readfinch-update.json.sig"),
  signature + "\n",
);
await writeFile(
  path.join(directory, "SHA256SUMS.txt"),
  checksums.join("\n") + "\n",
);
console.log(
  `Verified and signed ${files.length} update packages for ReadFinch ${version}.`,
);
