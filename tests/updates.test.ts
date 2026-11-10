import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  fetchSignedManifest,
  newerVersion,
  releaseFile,
  updateUrl,
  verifyManifest,
  type ReleaseManifest,
  type UpdateFetch,
} from "../src/core/update-manifest";
import {
  downloadVerifiedUpdate,
  verifyUpdateFile,
} from "../src/core/update-download";
import { UpdateService, type UpdateDriver } from "../src/core/update-service";
import { UpdateFailure } from "../src/core/update-manifest";
import type { UpdateState } from "../src/shared/updates";

const keys = generateKeyPairSync("ed25519");
const publicKey = keys.publicKey
  .export({ type: "spki", format: "pem" })
  .toString();
const payload = Buffer.from("Controlled update package; never executed");
function manifest(version = "1.1.0"): ReleaseManifest {
  return {
    schema: 1,
    version,
    publishedAt: "2026-11-03T00:00:00.000Z",
    notes: "A controlled test release",
    files: [
      {
        platform: "win32",
        arch: "x64",
        kind: "nsis",
        name: `ReadFinch-${version}-windows-x64-setup.exe`,
        size: payload.length,
        sha512: createHash("sha512").update(payload).digest("base64"),
      },
    ],
  };
}
function signed(value: unknown) {
  const bytes = Buffer.from(JSON.stringify(value));
  return {
    bytes,
    signature: sign(null, bytes, keys.privateKey).toString("base64"),
  };
}

test("stable updates are monotonic, architecture-specific, and use fixed public release origins", () => {
  assert.ok(newerVersion("1.0.0", "0.15.3"));
  assert.ok(newerVersion("1.0.0", "1.0.0-beta.1"));
  for (const [next, old] of [
    ["1.0.0", "1.0.0"],
    ["0.9.0", "1.0.0"],
    ["1.1.0-beta.1", "1.0.0"],
    ["1.2.3/../x", "1.0.0"],
  ])
    assert.equal(newerVersion(next, old), false);
  assert.equal(
    releaseFile(manifest(), "win32", "x64", "nsis").name,
    "ReadFinch-1.1.0-windows-x64-setup.exe",
  );
  assert.throws(() => releaseFile(manifest(), "win32", "arm64", "nsis"));
  assert.equal(
    updateUrl("github", "1.1.0", "ReadFinch-1.1.0-windows-x64-setup.exe"),
    "https://github.com/0xlane/ReadFinch/releases/download/v1.1.0/ReadFinch-1.1.0-windows-x64-setup.exe",
  );
  assert.equal(
    updateUrl("gh-proxy"),
    "https://gh-proxy.com/https://github.com/0xlane/ReadFinch/releases/latest/download/readfinch-update.json",
  );
});
test("only the pinned Ed25519 key can authenticate a bounded release manifest", () => {
  const data = signed(manifest());
  assert.deepEqual(
    verifyManifest(data.bytes, data.signature, publicKey),
    manifest(),
  );
  const other = generateKeyPairSync("ed25519");
  assert.throws(() =>
    verifyManifest(
      data.bytes,
      sign(null, data.bytes, other.privateKey).toString("base64"),
      publicKey,
    ),
  );
  assert.throws(() =>
    verifyManifest(
      Buffer.from(data.bytes.toString().replace("1.1.0", "9.9.9")),
      data.signature,
      publicKey,
    ),
  );
  assert.throws(() => verifyManifest(data.bytes, "", publicKey));
  assert.throws(() =>
    verifyManifest(Buffer.alloc(129 * 1024), data.signature, publicKey),
  );
  for (const changes of [
    { name: "../../untrusted.exe" },
    { name: "ReadFinch-9.9.9-windows-x64-setup.exe" },
    { sha512: "invalid" },
    { size: 3 * 1024 ** 3 },
  ]) {
    const value = manifest();
    Object.assign(value.files[0], changes);
    const invalid = signed(value);
    assert.throws(() =>
      verifyManifest(invalid.bytes, invalid.signature, publicKey),
    );
  }
  const duplicate = manifest();
  duplicate.files.push(duplicate.files[0]);
  const invalid = signed(duplicate);
  assert.throws(() =>
    verifyManifest(invalid.bytes, invalid.signature, publicKey),
  );
});
test("manifest transport falls back from GitHub to gh-proxy and never sends credentials", async () => {
  const data = signed(manifest()),
    calls: string[] = [],
    sources: string[] = [];
  const fetcher: UpdateFetch = async (url, init) => {
    calls.push(url);
    assert.equal(init.credentials, "omit");
    assert.equal(init.headers, undefined);
    if (!url.startsWith("https://gh-proxy.com/"))
      return new Response("unavailable", { status: 503 });
    return new Response(
      url.endsWith(".sig") ? data.signature : new Uint8Array(data.bytes),
    );
  };
  const result = await fetchSignedManifest(fetcher, publicKey, (source) =>
    sources.push(source),
  );
  assert.equal(result.source, "gh-proxy");
  assert.deepEqual(sources, ["github", "gh-proxy"]);
  assert.equal(calls.length, 3);
});
test("manifest signature failure cannot be bypassed by trying the proxy", async () => {
  const data = signed(manifest()),
    calls: string[] = [];
  await assert.rejects(
    fetchSignedManifest(
      async (url) => {
        calls.push(url);
        return new Response(
          url.endsWith(".sig")
            ? "A".repeat(86) + "=="
            : new Uint8Array(data.bytes),
        );
      },
      publicKey,
      () => {},
    ),
    /校验失败/,
  );
  assert.equal(calls.length, 2);
  assert.ok(calls.every((url) => url.startsWith("https://github.com/")));
});
test("cancelling a manifest request never starts the proxy request", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(
    fetchSignedManifest(
      async () => {
        calls++;
        controller.abort();
        throw Error("aborted");
      },
      publicKey,
      () => {},
      controller.signal,
    ),
  );
  assert.equal(calls, 1);
});
test("verified downloads reject truncated, oversized, tampered and cancelled packages and remove partial files", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "readfinch-updates-"));
  try {
    const file = manifest().files[0];
    const download = (
      body: Uint8Array,
      signal = new AbortController().signal,
    ) =>
      downloadVerifiedUpdate({
        fetch: async () => new Response(new Uint8Array(body)),
        url: "https://example.invalid/fixture",
        file,
        directory,
        signal,
        progress: () => {},
      });
    for (const body of [
      payload.subarray(1),
      Buffer.concat([payload, Buffer.from("x")]),
      Buffer.alloc(payload.length),
    ]) {
      await assert.rejects(download(body));
      assert.deepEqual(await readdir(directory), []);
    }
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(download(payload, controller.signal));
    assert.deepEqual(await readdir(directory), []);
    const result = await download(payload);
    assert.deepEqual(await readFile(result), payload);
    assert.ok(await verifyUpdateFile(result, file));
    await writeFile(result, "tampered");
    assert.equal(await verifyUpdateFile(result, file), false);
    await download(payload);
    assert.ok(await verifyUpdateFile(result, file));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function fixture(
  options: {
    automatic?: boolean;
    version?: string;
    manual?: boolean;
    mode?: "development" | "restart";
    failDirect?: boolean;
    failAll?: boolean;
  } = {},
) {
  const states: UpdateState[] = [],
    routes: string[] = [],
    flags: boolean[] = [];
  let checks = 0,
    installs = 0;
  const driver: UpdateDriver = {
    async manifest(signal, change) {
      checks++;
      signal.throwIfAborted();
      change("github");
      return { manifest: manifest(options.version), source: "github" };
    },
    async download(_manifest, _file, source, signal, progress) {
      routes.push(source);
      signal.throwIfAborted();
      if (options.failAll || (options.failDirect && source === "github"))
        throw Error("Controlled transport failure");
      progress({ percent: 50, transferred: 20, total: 40, bytesPerSecond: 10 });
    },
    setAutomatic(value) {
      flags.push(value);
    },
    async install() {
      installs++;
    },
  };
  const service = new UpdateService({
    version: "1.0.0",
    platform: "win32",
    arch: "x64",
    kind: "nsis",
    installMode: options.mode ?? (options.manual ? "manual" : "automatic"),
    automatic: options.automatic ?? true,
    driver,
    changed: (state) => states.push(structuredClone(state)),
  });
  return {
    service,
    driver,
    states,
    routes,
    flags,
    checks: () => checks,
    installs: () => installs,
  };
}
test("automatic updates check, download, fall back once, and wait for explicit restart or quit", async () => {
  const f = fixture({ failDirect: true });
  await f.service.check(true);
  assert.equal(f.service.state.status, "downloaded");
  assert.deepEqual(f.routes, ["github", "gh-proxy"]);
  assert.equal(f.installs(), 0);
  assert.ok(f.states.some((state) => state.progress?.percent === 50));
  await f.service.install();
  assert.equal(f.installs(), 1);
});
test("turning automatic updates off leaves manual check and download available without implicit installation", async () => {
  const f = fixture({ automatic: false });
  await f.service.check();
  assert.equal(f.service.state.status, "available");
  assert.deepEqual(f.routes, []);
  await f.service.download();
  assert.equal(f.service.state.status, "downloaded");
  assert.equal(f.installs(), 0);
  assert.deepEqual(f.flags, [false]);
});
test("repeated checks share one operation and never downgrade or overwrite a ready update", async () => {
  const f = fixture();
  const first = f.service.check(),
    second = f.service.check();
  assert.equal(first, second);
  await first;
  await f.service.check();
  assert.equal(f.checks(), 1);
  for (const version of ["1.0.0", "0.15.3"]) {
    const same = fixture({ version });
    await same.service.check();
    assert.equal(same.service.state.status, "latest");
    assert.deepEqual(same.routes, []);
  }
});
test("download failure retains a verified release for retry without exposing raw transport errors", async () => {
  const f = fixture({ failAll: true });
  await f.service.check();
  assert.equal(f.service.state.status, "error");
  assert.equal(f.service.state.availableVersion, "1.1.0");
  assert.ok(!f.service.state.error?.includes("Controlled"));
  f.driver.download = async () => {};
  await f.service.download();
  assert.equal(f.service.state.status, "downloaded");
});
test("disabling automatic updates cancels an automatic download and never tries the proxy", async () => {
  const f = fixture();
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  f.driver.download = async (_manifest, _file, source, signal) => {
    f.routes.push(source);
    started();
    await new Promise((_resolve, reject) =>
      signal.addEventListener("abort", () => reject(Error("cancelled")), {
        once: true,
      }),
    );
  };
  const checking = f.service.check(true);
  await ready;
  f.service.setAutomatic(false);
  await checking;
  assert.deepEqual(f.routes, ["github"]);
  assert.equal(f.service.state.status, "available");
  assert.equal(f.service.state.automatic, false);
  assert.equal(f.installs(), 0);
  f.service.stop();
});
test("manual package handoff remains ready, and development builds never contact the update service", async () => {
  const manual = fixture({ manual: true });
  await manual.service.check();
  await manual.service.install();
  assert.equal(manual.service.state.status, "downloaded");
  const dev = fixture({ mode: "development" });
  await dev.service.check();
  assert.equal(dev.checks(), 0);
  assert.equal(dev.service.state.status, "error");
  await assert.rejects(dev.service.install());
});

test("restart installation waits for the user and preparation failures remain retryable", async () => {
  const f = fixture({ mode: "restart" });
  await f.service.check(true);
  assert.equal(f.service.state.status, "downloaded");
  assert.equal(f.installs(), 0);
  f.driver.install = async () => {
    throw new UpdateFailure("安装包校验失败，已停止更新。");
  };
  await f.service.install();
  assert.equal(f.service.state.status, "downloaded");
  assert.equal(f.service.state.error, "安装包校验失败，已停止更新。");
  f.driver.install = async () => {};
  await f.service.install();
  assert.equal(f.service.state.status, "installing");
  assert.equal(f.service.state.error, undefined);
});
