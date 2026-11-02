import {defaultConfig} from "../src/shared/config";
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ConfigStore, digest } from "../src/core/store";
import { DavSync, type DavSettings } from "../src/core/sync";
async function setup() {
  let content: string | null = null;
  let version = 0;
  let failure = "";
  let etags = true;
  let writes = 0;
  let onGet: (() => void) | undefined;
  const etag = () => `"v${version}"`;
  const server = createServer(async (req, res) => {
    if (failure === "auth") {
      res.writeHead(401);
      res.end();
      return;
    }
    if (failure === "interrupt") {
      req.socket.destroy();
      return;
    }
    if (req.url !== "/TextHop/config.json") {
      res.writeHead(404);
      res.end();
      return;
    }
    if (req.method === "GET") {
      const callback = onGet;
      onGet = undefined;
      callback?.();
      if (failure === "oversized") {
        res.setHeader("Content-Type", "application/json");
        res.write(" ".repeat(2_000_001));
        res.end();
        return;
      }
      if (content === null) {
        res.writeHead(404);
        res.end();
        return;
      }
      if (etags) res.setHeader("ETag", etag());
      res.setHeader("Content-Type", "application/json");
      res.end(failure === "invalid" ? "{bad" : content);
      return;
    }
    if (req.method === "PUT") {
      if (failure === "race") {
        version++;
        failure = "";
      }
      if (
        (req.headers["if-none-match"] === "*" && content !== null) ||
        (req.headers["if-match"] && req.headers["if-match"] !== etag())
      ) {
        res.writeHead(412);
        res.end();
        return;
      }
      assert.ok(
        req.headers["if-match"] || req.headers["if-none-match"],
        "all uploads are conditional",
      );
      let body = "";
      for await (const c of req) body += c;
      content = body;
      version++;
      writes++;
      res.setHeader("ETag", etag());
      res.writeHead(201);
      res.end();
      return;
    }
    res.writeHead(405);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const settings: DavSettings = {
    enabled: true,
    url: `http://127.0.0.1:${address.port}`,
    username: "",
    remotePath: "TextHop/config.json",
  };
  const a = new ConfigStore(
    await mkdtemp(path.join(os.tmpdir(), "texthop-a-")),
  );
  const b = new ConfigStore(
    await mkdtemp(path.join(os.tmpdir(), "texthop-b-")),
  );
  await a.init();
  await b.init();
  const da = new DavSync(
    a,
    () => settings,
    async () => undefined,
  );
  const db = new DavSync(
    b,
    () => settings,
    async () => undefined,
  );
  return {
    a,
    b,
    da,
    db,
    settings,
    onRead: (callback: () => void) => {
      onGet = callback;
    },
    setFailure: (v: string) => (failure = v),
    setEtags: (v: boolean) => (etags = v),
    deleteRemote: () => {
      content = null;
      version++;
    },
    remote: () => content,
    writes: () => writes,
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
}
test("two independent profiles exchange changes and deletions through actual HTTP", async () => {
  const f = await setup();
  try {
    assert.equal((await f.da.sync()).status, "synced");
    assert.equal((await f.db.sync()).status, "synced");
    const c = f.a.config;
    c.actions[0].name = "设备 A 翻译";
    c.actions.splice(2, 1);
    await f.a.save(c);
    await f.da.sync();
    await f.db.sync();
    assert.equal(digest(f.a.config), digest(f.b.config));
    assert.equal(f.b.config.actions.length, defaultConfig().actions.length - 1);
    assert.ok((await readdir(path.join(f.b.dir, "backups"))).length);
  } finally {
    await f.close();
  }
});
test("an in-flight sync stays bound to its original server when settings change", async () => {
  const f = await setup();
  try {
    await f.da.sync();
    const endpoint = f.settings.url + "/TextHop/config.json";
    const updated = f.a.config;
    updated.appearance.theme = "dark";
    await f.a.save(updated);
    f.onRead(() => {
      f.settings.url = "http://127.0.0.1:1/new-server";
    });
    assert.equal((await f.da.sync()).status, "synced");
    assert.equal(f.writes(), 2);
    assert.equal(JSON.parse(f.remote()!).appearance.theme, "dark");
    assert.equal((await f.da.state())?.endpoint, endpoint);
  } finally {
    await f.close();
  }
});
test("oversized chunked remote content is rejected before changing local state", async () => {
  const f = await setup();
  try {
    await f.da.sync();
    const before = await readFile(f.a.file, "utf8");
    const baseline = await f.da.state();
    f.setFailure("oversized");
    await assert.rejects(() => f.da.sync(), /超过 2 MB/);
    assert.equal(await readFile(f.a.file, "utf8"), before);
    assert.deepEqual(await f.da.state(), baseline);
  } finally {
    await f.close();
  }
});
test("initial sync requires a decision, rechecks version, and preserves both backups", async () => {
  const f = await setup();
  try {
    await f.da.sync();
    const c = f.b.config;
    c.actions[0].name = "B";
    await f.b.save(c);
    const result = await f.db.sync();
    assert.equal(result.status, "conflict");
    assert.equal((await f.db.sync("local", result.token)).status, "synced");
    assert.equal(JSON.parse(f.remote()!).actions[0].name, "B");
    assert.ok((await readdir(path.join(f.b.dir, "backups"))).length >= 2);
  } finally {
    await f.close();
  }
});
test("concurrent edits and deletions conflict; stale resolutions cannot overwrite", async () => {
  const f = await setup();
  try {
    await f.da.sync();
    await f.db.sync();
    const ca = f.a.config;
    ca.actions.pop();
    await f.a.save(ca);
    const cb = f.b.config;
    cb.actions[0].name = "B edit";
    await f.b.save(cb);
    await f.da.sync();
    const conflict = await f.db.sync();
    assert.equal(conflict.status, "conflict");
    const newer = f.a.config;
    newer.appearance.theme = "dark";
    await f.a.save(newer);
    await f.da.sync();
    const stale = await f.db.sync("local", conflict.token);
    assert.equal(stale.status, "conflict");
    assert.equal(f.b.config.actions[0].name, "B edit");
    await f.db.sync("remote", stale.token);
    assert.equal(digest(f.a.config), digest(f.b.config));
  } finally {
    await f.close();
  }
});
test("authentication, interruption, invalid data and 412 never destroy valid local settings", async () => {
  const f = await setup();
  try {
    await f.da.sync();
    const c = f.a.config;
    c.appearance.theme = "dark";
    await f.a.save(c);
    const before = await readFile(f.a.file, "utf8");
    for (const failure of ["auth", "interrupt", "invalid", "race"]) {
      f.setFailure(failure);
      await assert.rejects(() => f.da.sync());
      assert.equal(await readFile(f.a.file, "utf8"), before);
    }
    f.setFailure("");
    f.deleteRemote();
    assert.equal((await f.da.sync()).status, "conflict");
  } finally {
    await f.close();
  }
});
test("weak or missing ETags block unprotected upload", async () => {
  const f = await setup();
  try {
    await f.da.sync();
    const before = f.remote();
    const c = f.a.config;
    c.appearance.theme = "dark";
    await f.a.save(c);
    f.setEtags(false);
    const conflict = await f.da.sync();
    assert.equal(conflict.status, "conflict");
    const limited = await f.da.sync("local", conflict.token);
    assert.equal(limited.status, "limited");
    assert.equal(f.remote(), before);
  } finally {
    await f.close();
  }
});
