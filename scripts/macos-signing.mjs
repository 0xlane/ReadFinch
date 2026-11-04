import { X509Certificate, createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
export const publicCertificate = path.join(root, "build/macos-signing.pem");
export const signingHome =
  process.env.READFINCH_SIGNING_HOME ||
  path.join(homedir(), "Library/Application Support/ReadFinch Signing");
const version = "0.29.0";
const archives = {
  x64: {
    target: "x86_64-apple-darwin",
    sha256: "14ef11bedd51a8d95eafd767939ae96d5900e5a61511bef75bb21db6e7c74140",
  },
  arm64: {
    target: "aarch64-apple-darwin",
    sha256: "d1a532150adaf90048260d76359261aa716abafc45c53c5dc18845029184334a",
  },
};

export function run(command, args, { input, env, binary = false } = {}) {
  const result = spawnSync(command, args, {
    input,
    env,
    encoding: binary ? undefined : "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    // Never include command arguments, input, or inherited environment in errors.
    throw Error(
      `${path.basename(command)} failed: ${result.error?.code ?? result.stderr?.toString().trim() ?? result.status}`,
    );
  }
  return result.stdout;
}
export function fingerprint(pem) {
  return new X509Certificate(pem).fingerprint.replaceAll(":", "");
}
export function requirement(identifier, certificate) {
  if (!/^[A-Za-z0-9._-]+$/.test(identifier))
    throw Error("Invalid signing identifier");
  return `identifier "${identifier}" and certificate leaf = H"${fingerprint(certificate)}"`;
}
export function binaryIdentifier(relativePath) {
  if (relativePath === "Contents/Resources/native/bin/readfinch-selection")
    return "app.readfinch.ReadFinch.selection-helper";
  return (
    "app.readfinch.ReadFinch.code." +
    createHash("sha256").update(relativePath).digest("hex").slice(0, 24)
  );
}

export async function signingTool() {
  if (process.platform !== "darwin" || !archives[process.arch])
    throw Error("macOS signing requires an Intel or Apple silicon Mac");
  const asset = archives[process.arch];
  const name = `apple-codesign-${version}-${asset.target}`;
  const cache = path.join(root, ".local/signing-tools");
  await mkdir(cache, { recursive: true });
  const archive = path.join(cache, name + ".tar.gz");
  let bytes = await readFile(archive).catch((e) => {
    if (e.code !== "ENOENT") throw e;
  });
  if (!bytes) {
    const response = await fetch(
      `https://github.com/indygreg/apple-platform-rs/releases/download/apple-codesign/${version}/${name}.tar.gz`,
      { signal: AbortSignal.timeout(120000) },
    );
    if (!response.ok)
      throw Error(`Signing tool download failed: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256)
    throw Error("Signing tool checksum mismatch");
  await writeFile(archive, bytes, { mode: 0o600 });
  // Re-extract the one pinned binary, so a stale or altered cached executable is not used.
  run("tar", ["-xzf", archive, "-C", cache, `${name}/rcodesign`]);
  const binary = path.join(cache, name, "rcodesign");
  await chmod(binary, 0o700);
  return binary;
}

export async function withIdentity(operation) {
  const certificate = await readFile(publicCertificate, "utf8");
  const cert = new X509Certificate(certificate);
  if (
    !cert.verify(cert.publicKey) ||
    Date.now() < Date.parse(cert.validFrom) ||
    Date.now() >= Date.parse(cert.validTo)
  )
    throw Error("Pinned signing certificate is invalid or expired");
  const dir = await mkdtemp(path.join(tmpdir(), "readfinch-signing-"));
  await chmod(dir, 0o700);
  try {
    const p12 = path.join(dir, "identity.p12");
    const password = path.join(dir, "password");
    const encoded = process.env.READFINCH_MACOS_SIGNING_P12;
    const secret = process.env.READFINCH_MACOS_SIGNING_PASSWORD;
    if (encoded !== undefined || secret !== undefined) {
      if (!encoded || !secret)
        throw Error("Both macOS signing secrets are required");
      await writeFile(p12, Buffer.from(encoded, "base64"), { mode: 0o600 });
      await writeFile(password, secret, { mode: 0o600 });
    } else {
      if (process.env.CI)
        throw Error(
          "macOS signing secrets are missing; refusing to fall back to ad-hoc signing",
        );
      await copyFile(path.join(signingHome, "identity.p12"), p12);
      await copyFile(path.join(signingHome, "password"), password);
      await chmod(p12, 0o600);
      await chmod(password, 0o600);
    }
    const supplied = run("openssl", [
      "pkcs12",
      "-in",
      p12,
      "-nokeys",
      "-passin",
      `file:${password}`,
    ]);
    if (fingerprint(supplied) !== fingerprint(certificate))
      throw Error(
        "Signing identity does not match the repository's pinned public certificate",
      );
    return await operation({ dir, p12, password, certificate });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function initialize() {
  if (process.env.CI)
    throw Error(
      "Create the identity once on a maintainer's machine, never in CI",
    );
  const alreadyPinned = await readFile(publicCertificate)
    .then(() => true)
    .catch((error) => {
      if (error.code !== "ENOENT") throw error;
      return false;
    });
  if (alreadyPinned)
    throw Error(
      "This repository already pins a signing certificate. Restore the existing private identity; do not generate a replacement.",
    );
  // The exclusive directory creation prevents accidental regeneration or rotation.
  await mkdir(signingHome, { mode: 0o700 });
  const password = path.join(signingHome, "password");
  const key = path.join(signingHome, "identity.key");
  const cert = path.join(signingHome, "certificate.pem");
  const p12 = path.join(signingHome, "identity.p12");
  await writeFile(password, randomBytes(48).toString("base64url"), {
    mode: 0o600,
    flag: "wx",
  });
  try {
    run("openssl", [
      "req",
      "-x509",
      "-newkey",
      "rsa:3072",
      "-sha256",
      "-nodes",
      "-days",
      "7300",
      "-subj",
      "/CN=ReadFinch Open Source Signing/O=ReadFinch contributors",
      "-addext",
      "basicConstraints=critical,CA:FALSE",
      "-addext",
      "keyUsage=critical,digitalSignature",
      "-addext",
      "extendedKeyUsage=critical,codeSigning",
      "-keyout",
      key,
      "-out",
      cert,
    ]);
    await chmod(key, 0o600);
    // PKCS#12's widely supported PBES1 format; the password is 384 random bits.
    run("openssl", [
      "pkcs12",
      "-export",
      "-inkey",
      key,
      "-in",
      cert,
      "-out",
      p12,
      "-passout",
      `file:${password}`,
      "-keypbe",
      "PBE-SHA1-3DES",
      "-certpbe",
      "PBE-SHA1-3DES",
      "-macalg",
      "sha1",
      "-iter",
      "65536",
    ]);
    await chmod(p12, 0o600);
    await writeFile(publicCertificate, await readFile(cert), {
      flag: "wx",
      mode: 0o644,
    });
    console.log(
      `Created fixed signing identity. Back up ${signingHome}; only build/macos-signing.pem belongs in Git.`,
    );
    console.log(
      `Public certificate SHA-1: ${fingerprint(await readFile(cert))}`,
    );
  } finally {
    await rm(key, { force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const command = process.argv[2];
  if (command === "init") await initialize();
  else if (command === "tool") console.log(await signingTool());
  else if (command === "check")
    await withIdentity(({ certificate }) =>
      console.log(
        `Pinned signing identity available: ${fingerprint(certificate)}`,
      ),
    );
  else throw Error("Usage: node scripts/macos-signing.mjs init|tool|check");
}
