import test from "node:test";
import assert from "node:assert/strict";
import { defaultConfig, parseConfig, mergeConfig } from "../src/shared/config";
import { proxyAddress, ProxySchema } from "../src/shared/proxy";
import { catalogKey } from "../src/shared/models";
import { CompletionCache } from "../src/core/completion-cache";

test("proxy URLs have one unambiguous route, reject credentials and cannot inject bypass rules", () => {
  for (const [input, expected] of [
    [" http://localhost:7890 ", "http://localhost:7890"],
    ["https://proxy.example", "https://proxy.example:443"],
    ["socks5://[::1]:1081", "socks5://[::1]:1081"],
    ["socks4://localhost", "socks4://localhost:1080"],
  ])
    assert.equal(proxyAddress(input), expected);
  for (const address of [
    "localhost:7890",
    "ftp://proxy.example",
    "http://user:password@proxy.example",
    "http://proxy.example/path",
    "http://proxy.example?q=x",
    "http://proxy.example/#x",
    "http://proxy.example:0",
    "socks5://localhost:65536",
    "http://proxy.example,direct://",
    "http://proxy.example;https=direct://",
    "file:///tmp/proxy",
    "http://localhost\n:7890",
  ])
    assert.equal(
      ProxySchema.safeParse({ mode: "custom", address }).success,
      false,
      address,
    );
});

test("v13 providers inherit system proxy and copy, merge and reopen preserve independent routes", () => {
  const old: any = defaultConfig();
  old.schemaVersion = 13;
  delete old.providers[0].proxy;
  const upgraded = parseConfig(old);
  assert.equal(upgraded.schemaVersion, 17);
  assert.deepEqual(upgraded.providers[0].proxy, {
    mode: "system",
    address: "",
  });
  assert.equal(old.providers[0].proxy, undefined);
  const current = defaultConfig();
  current.providers[0].proxy = {
    mode: "custom",
    address: "socks5://localhost:1080",
  };
  const copy = structuredClone(current.providers[0]);
  copy.id = "copied";
  current.providers.push(copy);
  current.providers[0].proxy.mode = "direct";
  const merged = mergeConfig(upgraded, current);
  const reopened = parseConfig(JSON.stringify(merged));
  assert.equal(reopened.providers[0].proxy.mode, "direct");
  assert.deepEqual(reopened.providers[1].proxy, {
    mode: "custom",
    address: "socks5://localhost:1080",
  });
  const incomplete = {
    ...current.providers[0],
    proxy: { mode: "custom", address: "" },
  };
  assert.equal(
    parseConfig({ ...current, providers: [incomplete] }).providers[0].proxy
      .mode,
    "custom",
  );
});

test("changing a proxy invalidates result and model-list caches for that provider", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      choices: [{ message: { content: String(++calls) } }],
    }),
  );
  const p = { ...defaultConfig().providers[0], requiresKey: false };
  const direct = { ...p, proxy: { mode: "direct" as const, address: "" } };
  assert.notEqual(catalogKey(p), catalogKey(direct));
  assert.notEqual(
    catalogKey({
      ...p,
      proxy: { mode: "custom", address: "http://localhost:8080" },
    }),
    catalogKey({
      ...p,
      proxy: { mode: "custom", address: "http://localhost:8081" },
    }),
  );
  const cache = new CompletionCache();
  const run = (profile = p) =>
    cache.run(profile, [], undefined, new AbortController().signal, () => {});
  assert.equal(await run(), "1");
  assert.equal(await run(), "1");
  assert.equal(await run(direct), "2");
  assert.equal(await run(), "1");
});
