import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { PublicModelDirectory } from "../src/core/public-model-directory";
import {
  ModelDirectory,
  parseDirectory,
  directoryUrls,
} from "../src/shared/model-directory";
import {
  bundledDirectory,
  modelKind,
  speechProtocol,
  withCatalogMatch,
} from "../src/shared/model-capabilities";
import { chooseProviderModel } from "../src/shared/provider-model";
import {
  createProvider,
  defaultConfig,
  parseConfig,
} from "../src/shared/config";
import {
  providerCanServe,
  assignProvider,
  modelOptions,
} from "../src/shared/models";

const canonical = {
  lens: {
    id: "lab/lens",
    name: "Lens",
    modalities: { input: ["text", "image"], output: ["text"] },
    limit: { context: 32000 },
  },
  draw: {
    id: "lab/draw",
    name: "Image generator",
    type: "image",
    modalities: { input: ["text", "image"], output: ["image"] },
  },
};
const router = {
  data: [
    {
      id: "other/lens",
      name: "Lens",
      architecture: { input_modalities: ["text"], output_modalities: ["text"] },
    },
    {
      id: "lab/voice",
      name: "Voice",
      architecture: {
        input_modalities: ["text"],
        output_modalities: ["audio"],
      },
    },
  ],
};
test("exact model IDs and unambiguous bare IDs resolve; ambiguous and lookalike names stay text", () => {
  const data = {
    modelsDev: parseDirectory("modelsDev", canonical),
    openRouter: parseDirectory("openRouter", router),
  };
  const index = new ModelDirectory(data);
  assert.equal(index.lookup("lab", "lens")?.context, 32000);
  assert.equal(index.lookup("custom", "lab/lens")?.kind, "vision");
  assert.equal(index.lookup("custom", "voice")?.kind, "speech");
  for (const id of [
    "lens",
    "lab/draw",
    "next/lens",
    "lab/lens-v2",
    "gpt-6-private-vision",
    "my-tts-deployment",
  ]) {
    assert.equal(index.lookup("custom", id), undefined);
    assert.equal(modelKind({ preset: "custom", model: id }, index), "text");
  }
  const hit = bundledDirectory.lookup("openai", "deepseek-v4.1-flash-1017");
  assert.equal(hit?.kind, "vision");
  assert.equal(hit?.id, "deepseek/deepseek-v4.1-flash-1017");
  const collision = new ModelDirectory({
    modelsDev: [hit!, { ...hit!, id: "private-lab/deepseek-v4.1-flash-1017" }],
    openRouter: [],
  });
  const ambiguous = chooseProviderModel(
    createProvider("custom", "gateway"),
    "deepseek-v4.1-flash-1017",
    true,
    collision,
  );
  assert.equal(modelKind(ambiguous), "text");
  assert.equal(modelKind(ambiguous, bundledDirectory), "text");
  assert.equal(withCatalogMatch(ambiguous, bundledDirectory), ambiguous);
  const partial = new ModelDirectory({
    modelsDev: [hit!],
    openRouter: [{ ...hit!, kind: "text" }],
    bundledSources: ["modelsDev"],
  });
  assert.equal(partial.lookup("custom", hit!.id)?.kind, "text");
  assert.equal(
    bundledDirectory.lookup("custom", "deepseek-v4.1-flash-1017-private"),
    undefined,
  );
  const config = defaultConfig();
  let p = chooseProviderModel(
    createProvider("custom", "test"),
    "lab/lens",
    false,
    index,
  );
  config.providers.push(p);
  assert.equal(providerCanServe(p, "ocr"), true);
  assert.equal(
    parseConfig(assignProvider(config, "ocr", p.id)).defaults.ocrProfileId,
    p.id,
  );
  assert.deepEqual(
    modelOptions(config, p.id, ["lab/voice", "private-tts"], index).map((m) => [
      m.id,
      m.kind,
    ]),
    [
      ["lab/voice", "speech"],
      ["private-tts", "text"],
    ],
  );
  p = chooseProviderModel(
    { ...p, modelKind: "speech" },
    "lab/lens-v2",
    true,
    index,
  );
  assert.equal(modelKind(p), "text");
  assert.equal(providerCanServe(p, "ocr"), false);
  assert.equal(providerCanServe(p, "tts"), false);
});

test("model metadata recognizes provider paths and vendor spellings without changing the wire ID", () => {
  const entries = [
    {
      id: "alibaba/qwen2-5-vl-72b-instruct",
      name: "Qwen VL",
      kind: "vision" as const,
    },
    {
      id: "google/gemini-2.5-flash",
      name: "Gemini Flash",
      kind: "vision" as const,
    },
    {
      id: "anthropic/claude-sonnet-4.5",
      name: "Sonnet",
      kind: "vision" as const,
    },
    {
      id: "deepseek/deepseek-v4.1-flash-1017",
      name: "DeepSeek",
      kind: "vision" as const,
    },
  ];
  const directory = new ModelDirectory({ modelsDev: entries, openRouter: [] });
  for (const [i, inputs] of [
    [
      "Qwen/Qwen2.5-VL-72B-Instruct",
      "openrouter/QWEN/Qwen2.5-VL-72B-Instruct:free",
      "QWEN2.5 VL 72B Instruct",
    ],
    [
      "models/gemini-2.5-flash",
      "projects/sample/locations/us/publishers/google/models/gemini-2.5-flash",
      "GOOGLE/GEMINI-2.5-FLASH (free)",
    ],
    [
      "anthropic/claude-sonnet-4-5@20250929",
      "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    ],
    [
      "accounts/fireworks/models/deepseek-v4p1-flash-1017",
      "deepseek-ai/DeepSeek_V4.1_Flash_1017",
    ],
  ].entries()) {
    for (const input of inputs) {
      const profile = chooseProviderModel(
        createProvider("custom", "relay"),
        input,
        false,
        directory,
      );
      assert.equal(profile.model, input);
      assert.equal(directory.lookup("custom", input)?.id, entries[i].id, input);
      assert.equal(modelKind(profile, directory), "vision");
    }
  }
  for (const id of [
    "gemini-2.5-flash-private",
    "google/gemini-2.5-flash:batch",
    "deepseek/deepseek-v4.1-flash",
    "anthropic/claude-sonnet-4.5-2025-09-29",
    "google/claude-sonnet-4.5",
  ])
    assert.equal(directory.lookup("custom", id), undefined, id);
  const colliding = new ModelDirectory({
    modelsDev: [
      { id: "one/model-2.5", name: "Vision", kind: "vision" },
      { id: "two/model-2-5", name: "Speech", kind: "speech" },
    ],
    openRouter: [],
  });
  assert.equal(colliding.match("custom", "gateway/Model_2-5:free"), null);
  assert.equal(
    colliding.lookup("custom", "gateway/TWO/Model_2-5")?.kind,
    "speech",
  );
  const voice = {
    preset: "custom",
    model: "gateway/XIAOMI/MiMo-V2.5-TTS:cloud",
  };
  assert.equal(modelKind(voice), "speech");
  assert.equal(speechProtocol(voice), "mimo");
  assert.equal(modelKind({ ...voice, model: "openai/TTS-1-HD" }), "speech");
  assert.equal(modelKind({ ...voice, model: "google/TTS-1-HD" }), "text");
  assert.equal(
    bundledDirectory.lookup("custom", "openrouter/gpt-4o")?.kind,
    "vision",
  );
});

test("public catalog refresh shares requests, persists exact metadata, and retains stale data when only one source fails", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "readfinch-directory-"));
  let now = 2e12,
    failCanonical = false;
  const requests: string[] = [];
  const fetcher: typeof fetch = async (resource, init) => {
    const url = String(resource);
    requests.push(url);
    assert.equal(init?.credentials, "omit");
    assert.equal(init?.headers, undefined);
    if (url === directoryUrls.modelsDev)
      return Response.json(failCanonical ? {} : canonical);
    assert.equal(url, directoryUrls.openRouter);
    return Response.json(router);
  };
  const first = new PublicModelDirectory(dir, fetcher, () => now);
  const [a, b] = await Promise.all([first.refresh(), first.refresh()]);
  assert.deepEqual(a, b);
  assert.equal(requests.length, 2);
  const next = new PublicModelDirectory(dir, fetcher, () => now);
  assert.deepEqual(await next.refresh(), a);
  assert.equal(requests.length, 2);
  now += 2 * 86400000;
  failCanonical = true;
  assert.deepEqual(await next.refresh(), a);
  await next.refresh();
  assert.equal(requests.length, 4);
  await writeFile(
    path.join(dir, "model-directory", "modelsDev.json"),
    "invalid",
  );
  const recovered = await new PublicModelDirectory(
    dir,
    fetcher,
    () => now,
  ).read();
  assert.ok(
    recovered.modelsDev.some(
      (m) => m.id === "deepseek/deepseek-v4.1-flash-1017",
    ),
  );
  assert.deepEqual(recovered.openRouter, a.openRouter);
  assert.deepEqual(recovered.bundledSources, ["modelsDev"]);
});
