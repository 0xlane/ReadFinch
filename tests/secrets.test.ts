import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Secrets } from "../src/main/secrets";

const scope = "https://fixture.invalid/v1";
async function fixture(t: TestContext) {
  const dir = await mkdtemp(path.join(tmpdir(), "readfinch-secrets-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test("local credentials persist without an OS key store and remain endpoint-scoped", async (t) => {
  const dir = await fixture(t);
  const unavailable = async () => {
    throw Error("No key store");
  };
  const secrets = new Secrets(dir, unavailable);
  await secrets.init();
  await Promise.all([
    secrets.set("text:provider", "fixture-key", scope),
    secrets.set("headers:provider", '{"X-Test":"fixture"}', scope),
    secrets.set("webdav", "fixture-password", "https://dav.invalid|user"),
  ]);
  const restarted = new Secrets(dir, unavailable);
  await restarted.init();
  assert.equal(await restarted.get("text:provider", scope), "fixture-key");
  assert.equal(
    await restarted.get("text:provider", "https://other.invalid"),
    undefined,
  );
  assert.deepEqual(restarted.ids(() => scope).sort(), [
    "headers:provider",
    "text:provider",
  ]);
  assert.equal(
    await restarted.get("headers:provider", scope),
    '{"X-Test":"fixture"}',
  );
  assert.equal(
    await restarted.get("webdav", "https://dav.invalid|user"),
    "fixture-password",
  );
  assert.match(
    await readFile(path.join(dir, "credentials.json"), "utf8"),
    /fixture-key/,
  );
  if (process.platform !== "win32")
    assert.equal(
      (await stat(path.join(dir, "credentials.json"))).mode & 0o777,
      0o600,
    );
  await assert.rejects(restarted.set("invalid", "key", scope));
  await assert.rejects(
    restarted.set("text:provider", "x".repeat(16001), scope),
  );
  await restarted.set("text:provider", "replacement", scope);
  await restarted.set("text:provider", "", scope);
  await restarted.init();
  assert.equal(await restarted.get("text:provider", scope), undefined);
});

test("legacy migration preserves unreadable originals and never resurrects a deleted key", async (t) => {
  const dir = await fixture(t);
  const legacy = JSON.stringify({
    "text:provider": { ciphertext: "old-encrypted", scope },
    "text:unreadable": { ciphertext: "unreadable", scope },
  });
  await writeFile(path.join(dir, "credentials.enc.json"), legacy);
  let calls = 0;
  const secrets = new Secrets(dir, async (ciphertext) => {
    calls++;
    if (ciphertext === "unreadable") throw Error("Unavailable");
    return "migrated-key";
  });
  await secrets.init();
  assert.equal(calls, 2);
  assert.equal(await secrets.get("text:provider", scope), "migrated-key");
  assert.equal(await secrets.get("text:unreadable", scope), undefined);
  assert.equal(
    await readFile(path.join(dir, "credentials.enc.json"), "utf8"),
    legacy,
  );
  await secrets.set("text:provider", "", scope);
  await secrets.set("text:unreadable", "new-key", scope);
  await secrets.init();
  assert.equal(calls, 2);
  assert.equal(await secrets.get("text:provider", scope), undefined);
  assert.equal(await secrets.get("text:unreadable", scope), "new-key");
});
