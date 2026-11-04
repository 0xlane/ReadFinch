import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { X509Certificate } from "node:crypto";
import {
  binaryIdentifier,
  fingerprint,
  publicCertificate,
  requirement,
  withIdentity,
} from "../scripts/macos-signing.mjs";

test("signing requirements bind both the app identifier and the pinned certificate", async () => {
  const pem = await readFile(publicCertificate);
  const cert = new X509Certificate(pem);
  assert.equal(cert.verify(cert.publicKey), true);
  assert.match(fingerprint(pem), /^[A-F0-9]{40}$/);
  assert.equal(
    requirement("app.readfinch.ReadFinch", pem),
    `identifier "app.readfinch.ReadFinch" and certificate leaf = H"${fingerprint(pem)}"`,
  );
  assert.throws(() => requirement('app.readfinch" or true', pem), /Invalid/);
});

test("standalone helper identity is fixed and other binary identifiers distinguish paths", () => {
  assert.equal(
    binaryIdentifier("Contents/Resources/native/bin/readfinch-selection"),
    "app.readfinch.ReadFinch.selection-helper",
  );
  const a = binaryIdentifier("Contents/Frameworks/A/handler");
  const b = binaryIdentifier("Contents/Frameworks/B/handler");
  assert.notEqual(a, b);
  assert.equal(a, binaryIdentifier("Contents/Frameworks/A/handler"));
});

test("CI refuses missing or partial credentials instead of silently producing ad-hoc builds", async (t) => {
  const names = [
    "CI",
    "READFINCH_MACOS_SIGNING_P12",
    "READFINCH_MACOS_SIGNING_PASSWORD",
  ];
  const previous = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  t.after(() => {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  });
  process.env.CI = "true";
  delete process.env.READFINCH_MACOS_SIGNING_P12;
  delete process.env.READFINCH_MACOS_SIGNING_PASSWORD;
  const forbidden = () => assert.fail("Signing must not start");
  await assert.rejects(withIdentity(forbidden), /refusing to fall back/);
  process.env.READFINCH_MACOS_SIGNING_P12 = "fixture";
  await assert.rejects(withIdentity(forbidden), /Both macOS signing secrets/);
});
