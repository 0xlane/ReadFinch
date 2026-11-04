import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { entities } from "./sign-macos.mjs";
import {
  fingerprint,
  publicCertificate,
  requirement,
  run,
  signingTool,
} from "./macos-signing.mjs";

export async function verifyIdentity(app, { trustedCI = false } = {}) {
  const certificate = await readFile(publicCertificate, "utf8");
  const expected = fingerprint(certificate);
  const temp = await mkdtemp(path.join(tmpdir(), "readfinch-signature-check-"));
  const result = [];
  const tool = await signingTool();
  let trusted = false;
  try {
    for (const item of await entities(app)) {
      const display = spawnSync(
        "/usr/bin/codesign",
        ["--display", "--verbose=4", "-r-", item.file],
        { encoding: "utf8" },
      );
      if (display.status !== 0)
        throw Error("Unable to inspect code signature: " + item.file);
      const output = display.stdout + display.stderr;
      const dr = output.match(/^designated => (.+)$/m)?.[1];
      if (
        dr
          ?.replace("certificate root =", "certificate leaf =")
          .toLowerCase() !==
        requirement(item.identifier, certificate).toLowerCase()
      )
        throw Error("Unexpected or unstable code identity: " + item.file);
      const cms = run(tool, ["extract", "cms-pem", item.binary]);
      const supplied = run("openssl", ["pkcs7", "-print_certs"], {
        input: cms,
      });
      if (fingerprint(supplied) !== expected)
        throw Error("Unrecognized signing certificate: " + item.file);
      const cmsFile = path.join(temp, "signature.pem");
      const contentFile = path.join(temp, "code-directory");
      await writeFile(cmsFile, cms);
      await writeFile(
        contentFile,
        run(tool, ["extract", "code-directory-raw", item.binary], {
          binary: true,
        }),
      );
      // Chain trust is replaced by the exact public-certificate pin checked above.
      // OpenSSL still verifies the CMS signature over the CodeDirectory.
      run("openssl", [
        "cms",
        "-verify",
        "-binary",
        "-noverify",
        "-inform",
        "PEM",
        "-in",
        cmsFile,
        "-content",
        contentFile,
        "-out",
        "/dev/null",
      ]);
      run(tool, ["verify", item.binary]);
      const cdhash = output.match(/^CDHash=(.+)$/m)?.[1];
      if (!cdhash) throw Error("Missing signed code hash: " + item.file);
      result.push({
        path: path.relative(app, item.file) || ".",
        identifier: item.identifier,
        requirement: dr,
        cdhash,
      });
    }
    if (trustedCI) {
      if (process.env.GITHUB_ACTIONS !== "true")
        throw Error(
          "Temporary certificate trust is restricted to disposable GitHub runners",
        );
      // Trust only for the native verification tool on this disposable build host.
      // This is never performed on a user's Mac or by the distributed application.
      run("sudo", [
        "-n",
        "/usr/bin/security",
        "add-trusted-cert",
        "-d",
        "-r",
        "trustRoot",
        "-p",
        "codeSign",
        "-a",
        "/usr/bin/codesign",
        "-k",
        "/Library/Keychains/System.keychain",
        publicCertificate,
      ]);
      trusted = true;
      run("/usr/bin/codesign", [
        "--verify",
        "--deep",
        "--strict",
        "--verbose=2",
        app,
      ]);
      for (const item of result)
        run("/usr/bin/codesign", [
          "--verify",
          "-R=" + item.requirement,
          path.join(app, item.path),
        ]);
    }
    return {
      certificateSHA1: expected,
      nativeStrictVerification: trustedCI,
      entities: result,
    };
  } finally {
    if (trusted) {
      run("sudo", [
        "-n",
        "/usr/bin/security",
        "remove-trusted-cert",
        "-d",
        publicCertificate,
      ]);
      run("sudo", [
        "-n",
        "/usr/bin/security",
        "delete-certificate",
        "-Z",
        expected,
        "/Library/Keychains/System.keychain",
      ]);
    }
    await rm(temp, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const app = process.argv[2];
  if (!app)
    throw Error(
      "Usage: node scripts/verify-macos-signing.mjs app-path [--ci] [--out=report.json]",
    );
  const result = await verifyIdentity(path.resolve(app), {
    trustedCI: process.argv.includes("--ci"),
  });
  const output = process.argv.find((arg) => arg.startsWith("--out="))?.slice(6);
  if (output) await writeFile(output, JSON.stringify(result, null, 2) + "\n");
  console.log(
    `Verified ${result.entities.length} fixed certificate identities${result.nativeStrictVerification ? " and native strict signatures" : " (Gatekeeper trust is not asserted)"}.`,
  );
}
