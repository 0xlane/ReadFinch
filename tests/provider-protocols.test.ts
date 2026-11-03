import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { EventStreamCodec } from "@smithy/eventstream-codec";
import {
  createProvider,
  defaultConfig,
  parseConfig,
} from "../src/shared/config";
import {
  PROVIDER_PRESETS,
  providerProtocol,
  isTranslationOnly,
  type ProviderPreset,
} from "../src/shared/provider-presets";
import { providerCanServe, assignProvider } from "../src/shared/models";
import { complete, listModels } from "../src/core/providers";
import {
  setProviderTransport,
  type Connection,
} from "../src/core/provider-http";
import type { TextProfile } from "../src/shared/config";

const messages = [
  { role: "system", content: "Translate faithfully" },
  { role: "user", content: "Hello" },
];
const usage = { input_tokens: 2, output_tokens: 2 };
const answer = "你好";
const message = {
  id: "msg-1",
  type: "message",
  role: "assistant",
  model: "fixture",
  content: [{ type: "text", text: answer }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage,
};
const response = {
  id: "resp-1",
  object: "response",
  created_at: 1,
  model: "fixture",
  status: "completed",
  error: null,
  incomplete_details: null,
  output: [
    {
      id: "msg-1",
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text: answer, annotations: [] }],
    },
  ],
  usage: { ...usage, total_tokens: 4 },
};
const sse = (events: any[]) =>
  events.map((e) => "data: " + JSON.stringify(e) + "\n\n").join("");
const codec = new EventStreamCodec(
  (b) => Buffer.from(b).toString("utf8"),
  (s) => Buffer.from(s),
);
const bedrockEvent = (type: string, data: object) =>
  codec.encode({
    headers: {
      ":message-type": { type: "string", value: "event" },
      ":event-type": { type: "string", value: type },
      ":content-type": { type: "string", value: "application/json" },
    },
    body: Buffer.from(JSON.stringify(data)),
  });
function nativeResponse(
  protocol: string,
  stream: boolean,
  truncated = false,
): { type: string; body: string | Buffer } {
  if (protocol === "anthropic")
    return stream
      ? {
          type: "text/event-stream",
          body: sse([
            {
              type: "message_start",
              message: { ...message, content: [], stop_reason: null },
            },
            {
              type: "content_block_start",
              index: 0,
              content_block: { type: "text", text: "" },
            },
            {
              type: "content_block_delta",
              index: 0,
              delta: { type: "text_delta", text: answer },
            },
            ...(truncated
              ? []
              : [
                  { type: "content_block_stop", index: 0 },
                  {
                    type: "message_delta",
                    delta: { stop_reason: "end_turn", stop_sequence: null },
                    usage,
                  },
                  { type: "message_stop" },
                ]),
          ]),
        }
      : { type: "application/json", body: JSON.stringify(message) };
  if (protocol === "gemini") {
    const data = {
      candidates: [
        {
          index: 0,
          content: { role: "model", parts: [{ text: answer }] },
          ...(truncated ? {} : { finishReason: "STOP" }),
        },
      ],
      usageMetadata: {
        promptTokenCount: 2,
        candidatesTokenCount: 2,
        totalTokenCount: 4,
      },
    };
    return {
      type: stream ? "text/event-stream" : "application/json",
      body: stream ? sse([data]) : JSON.stringify(data),
    };
  }
  if (protocol === "responses")
    return stream
      ? {
          type: "text/event-stream",
          body: sse([
            {
              type: "response.created",
              sequence_number: 0,
              response: { ...response, status: "in_progress", output: [] },
            },
            {
              type: "response.output_item.added",
              sequence_number: 1,
              output_index: 0,
              item: { ...response.output[0], content: [] },
            },
            {
              type: "response.content_part.added",
              sequence_number: 2,
              item_id: "msg-1",
              output_index: 0,
              content_index: 0,
              part: { type: "output_text", text: "", annotations: [] },
            },
            {
              type: "response.output_text.delta",
              sequence_number: 3,
              item_id: "msg-1",
              output_index: 0,
              content_index: 0,
              delta: answer,
              logprobs: [],
            },
            ...(truncated
              ? []
              : [
                  {
                    type: "response.output_text.done",
                    sequence_number: 4,
                    item_id: "msg-1",
                    output_index: 0,
                    content_index: 0,
                    text: answer,
                    logprobs: [],
                  },
                  {
                    type: "response.output_item.done",
                    sequence_number: 5,
                    output_index: 0,
                    item: response.output[0],
                  },
                  { type: "response.completed", sequence_number: 6, response },
                ]),
          ]),
        }
      : { type: "application/json", body: JSON.stringify(response) };
  if (protocol === "cohere")
    return stream
      ? {
          type: "text/event-stream",
          body: sse([
            { type: "message-start", id: "1" },
            {
              type: "content-start",
              index: 0,
              delta: { message: { content: { type: "text", text: "" } } },
            },
            {
              type: "content-delta",
              index: 0,
              delta: { message: { content: { text: answer } } },
            },
            ...(truncated
              ? []
              : [
                  { type: "content-end", index: 0 },
                  {
                    type: "message-end",
                    delta: {
                      finish_reason: "COMPLETE",
                      usage: { tokens: usage },
                    },
                  },
                ]),
          ]),
        }
      : {
          type: "application/json",
          body: JSON.stringify({
            message: {
              role: "assistant",
              content: [{ type: "text", text: answer }],
            },
            finish_reason: "COMPLETE",
            usage: { tokens: usage },
          }),
        };
  if (protocol === "bedrock")
    return stream
      ? {
          type: "application/vnd.amazon.eventstream",
          body: Buffer.concat([
            bedrockEvent("messageStart", { role: "assistant" }),
            bedrockEvent("contentBlockDelta", {
              contentBlockIndex: 0,
              delta: { text: answer },
            }),
            ...(truncated
              ? []
              : [
                  bedrockEvent("contentBlockStop", { contentBlockIndex: 0 }),
                  bedrockEvent("messageStop", { stopReason: "end_turn" }),
                  bedrockEvent("metadata", {
                    usage: { inputTokens: 2, outputTokens: 2, totalTokens: 4 },
                  }),
                ]),
          ]),
        }
      : {
          type: "application/json",
          body: JSON.stringify({
            output: {
              message: { role: "assistant", content: [{ text: answer }] },
            },
            stopReason: "end_turn",
            usage: { inputTokens: 2, outputTokens: 2, totalTokens: 4 },
          }),
        };
  if (protocol === "ollama") {
    const data = {
      model: "fixture",
      created_at: "2026-11-03T00:00:00Z",
      message: { role: "assistant", content: answer },
      done: !truncated,
      ...(truncated
        ? {}
        : {
            done_reason: "stop",
            total_duration: 1,
            eval_count: 2,
            prompt_eval_count: 2,
          }),
    };
    return {
      type: stream ? "application/x-ndjson" : "application/json",
      body: JSON.stringify(data) + (stream ? "\n" : ""),
    };
  }
  return stream
    ? {
        type: "text/event-stream",
        body:
          sse([
            {
              choices: [
                {
                  delta: { content: answer },
                  finish_reason: truncated ? null : "stop",
                },
              ],
            },
          ]) + (truncated ? "" : "data: [DONE]\n\n"),
      }
    : {
        type: "application/json",
        body: JSON.stringify({
          id: "c1",
          object: "chat.completion",
          created: 1,
          model: "fixture",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: answer },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 },
        }),
      };
}
async function fixture(handler: (req: any, res: any, body: any) => void) {
  const errors: unknown[] = [];
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    try {
      handler(req, res, raw ? JSON.parse(raw) : {});
    } catch (e) {
      errors.push(e);
      res.writeHead(500);
      res.end("{}");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = "http://127.0.0.1:" + (server.address() as any).port;
  return {
    url,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
      assert.deepEqual(errors, []);
    },
  };
}
const native: ProviderPreset[] = [
  "anthropic",
  "gemini",
  "azure",
  "bedrock",
  "cohere",
  "open-responses",
  "ollama",
];
for (const preset of native)
  for (const stream of [false, true])
    test(
      preset +
        " " +
        (stream ? "stream" : "JSON") +
        " uses its protocol, account credentials and custom headers",
      async () => {
        const protocol =
          preset === "azure"
            ? "responses"
            : providerProtocol(createProvider(preset, "fixture-" + preset));
        let seen = false;
        const f = await fixture((req, res, body) => {
          seen = true;
          const header =
            preset === "anthropic"
              ? "x-api-key"
              : preset === "gemini"
                ? "x-goog-api-key"
                : preset === "azure"
                  ? "api-key"
                  : "authorization";
          assert.equal(
            req.headers[header],
            header === "authorization" ? "Bearer fixture-key" : "fixture-key",
          );
          assert.equal(req.headers["x-fixture"], "native");
          assert.ok(!JSON.stringify(body).includes("readfinch-no-ambient"));
          const expected: Record<string, RegExp> = {
            anthropic: /\/messages$/,
            gemini: /\/models\/.*:(?:streamGenerateContent|generateContent)/,
            azure: /\/responses/,
            bedrock: /\/model\/.*\/converse/,
            cohere: /\/chat$/,
            ollama: /\/chat$/,
            "open-responses": /\/responses$/,
          };
          assert.match(req.url, expected[preset]);
          if (preset === "bedrock")
            assert.equal(body.system[0].text, messages[0].content);
          if (preset === "anthropic")
            assert.equal(body.system[0].text, messages[0].content);
          const reply = nativeResponse(protocol, stream);
          res.setHeader("content-type", reply.type);
          res.end(reply.body);
        });
        try {
          const profile = {
            ...createProvider(preset, "fixture-" + preset),
            model: "fixture",
            endpoint: f.url + (preset === "open-responses" ? "/responses" : ""),
            stream,
            headers: { "x-fixture": "native" },
            reasoningEffort: undefined,
          };
          const chunks: string[] = [];
          assert.equal(
            await complete(
              profile,
              messages,
              "fixture-key",
              new AbortController().signal,
              (t) => chunks.push(t),
            ),
            answer,
          );
          assert.equal(chunks.at(-1), answer);
          assert.ok(seen);
        } finally {
          await f.close();
        }
      },
    );
for (const preset of native)
  test(
    preset + " rejects a stream that stops before the protocol finish marker",
    async () => {
      const f = await fixture((_req, res) => {
        const reply = nativeResponse(
          preset === "azure"
            ? "responses"
            : providerProtocol(createProvider(preset, "fixture-" + preset)),
          true,
          true,
        );
        res.setHeader("content-type", reply.type);
        res.end(reply.body);
      });
      try {
        const profile = {
          ...createProvider(preset, "fixture-" + preset),
          model: "fixture",
          endpoint: f.url + (preset === "open-responses" ? "/responses" : ""),
          stream: true,
          reasoningEffort: undefined,
        };
        await assert.rejects(() =>
          complete(
            profile,
            messages,
            "fixture-key",
            new AbortController().signal,
            () => {},
          ),
        );
      } finally {
        await f.close();
      }
    },
  );
test("every Chat Completions preset sends its default model, and Gemini's compatible URL remains usable", async () => {
  let expected = "";
  const f = await fixture((req, res, body) => {
    assert.equal(req.url, "/v1/chat/completions");
    assert.equal(body.model, expected);
    const reply = nativeResponse("chat", false);
    res.end(reply.body);
  });
  try {
    for (const preset of PROVIDER_PRESETS.filter(
      (p) => p.protocol === "chat",
    )) {
      const profile = {
        ...createProvider(preset.id, "fixture-" + preset.id),
        endpoint: f.url + "/v1",
        stream: false,
      };
      if (!profile.model) profile.model = "custom-model";
      expected = profile.model;
      assert.equal(
        await complete(
          profile,
          messages,
          "fixture-key",
          new AbortController().signal,
          () => {},
        ),
        answer,
      );
    }
    assert.equal(
      providerProtocol({
        ...createProvider("gemini", "gemini-fixture"),
        endpoint: "https://generativelanguage.googleapis.com/v1beta/openai",
      }),
      "chat",
    );
  } finally {
    await f.close();
  }
});
test("Azure Chat mode uses deployment paths only for versioned APIs", async () => {
  const paths: string[] = [];
  const f = await fixture((req, res) => {
    paths.push(req.url);
    res.setHeader("content-type", "application/json");
    res.end(nativeResponse("chat", false).body);
  });
  try {
    for (const apiVersion of ["v1", "2024-10-21"]) {
      const profile = {
        ...createProvider("azure", "azure-fixture"),
        endpoint: f.url + "/openai" + (apiVersion === "v1" ? "/v1" : ""),
        stream: false,
        model: "my-deployment",
        providerSettings: { apiMode: "chat" as const, apiVersion },
      };
      await complete(
        profile,
        messages,
        "fixture-key",
        new AbortController().signal,
        () => {},
      );
    }
    assert.equal(paths[0], "/openai/v1/chat/completions");
    assert.match(
      paths[1],
      /^\/openai\/deployments\/my-deployment\/chat\/completions\?/,
    );
  } finally {
    await f.close();
  }
});
test("native requests obey the per-provider transport and cannot read ambient credentials", async () => {
  const seen: any[] = [];
  setProviderTransport(async (url, init, profile) => {
    seen.push({
      url,
      headers: new Headers(init.headers),
      proxy: profile.proxy,
    });
    const reply = nativeResponse("gemini", false);
    return new Response(String(reply.body), {
      headers: { "content-type": reply.type },
    });
  });
  try {
    const profile = {
      ...createProvider("gemini", "gemini-fixture"),
      stream: false,
      requiresKey: false,
      proxy: { mode: "custom" as const, address: "http://localhost:8080" },
    };
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "ambient-secret";
    await complete(
      profile,
      messages,
      undefined,
      new AbortController().signal,
      () => {},
    );
    assert.equal(seen[0].headers.get("x-goog-api-key"), null);
    assert.deepEqual(seen[0].proxy, profile.proxy);
    await assert.rejects(
      () =>
        complete(
          { ...profile, requiresKey: true },
          messages,
          undefined,
          new AbortController().signal,
          () => {},
        ),
      /API Key/,
    );
    assert.equal(seen.length, 1);
  } finally {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    setProviderTransport((url, init) => fetch(url, init));
  }
});
test("translation providers only bind to translation; schemas reject invalid feature assignments", () => {
  for (const preset of PROVIDER_PRESETS.filter(
    (p) => p.group === "translation",
  )) {
    const config = defaultConfig(),
      p = createProvider(preset.id, "fixture-" + preset.id);
    config.providers.push(p);
    assert.ok(providerCanServe(p, "action:translate"));
    assert.equal(providerCanServe(p, "ocr"), false);
    assert.equal(providerCanServe(p, "default"), false);
    const assigned = assignProvider(config, "action:translate", p.id);
    assert.equal(
      parseConfig(assigned).actions.find((a) => a.id === "translate")!
        .providerId,
      p.id,
    );
    assert.throws(() =>
      parseConfig({
        ...config,
        defaults: { ...config.defaults, textProfileId: p.id },
      }),
    );
    assert.throws(() =>
      parseConfig({
        ...config,
        languageDetection: { mode: "llm", providerId: p.id },
      }),
    );
    assert.throws(() =>
      parseConfig({
        ...config,
        actions: config.actions.map((a) =>
          a.id === "dictionary" ? { ...a, providerId: p.id } : a,
        ),
      }),
    );
  }
});

for (const preset of [
  "deepl",
  "deeplx",
  "google-translate",
  "microsoft-translate",
] as const)
  test(
    preset +
      " translates without a model, maps languages and never sends the instruction prompt",
    async () => {
      const requests: any[] = [];
      const f = await fixture((req, res, body) => {
        requests.push({ url: req.url, headers: req.headers, body });
        res.setHeader("content-type", "application/json");
        if (preset === "deepl")
          res.end(JSON.stringify({ translations: [{ text: answer }] }));
        if (preset === "deeplx")
          res.end(JSON.stringify({ code: 200, data: answer }));
        if (preset === "google-translate")
          res.end(JSON.stringify([[[answer, "Hello"]]]));
        if (preset === "microsoft-translate")
          res.end(
            JSON.stringify([
              { translations: [{ text: answer + "&lt;safe&gt;" }] },
            ]),
          );
      });
      try {
        const profile: Connection<TextProfile> = {
          ...createProvider(preset, "fixture"),
          endpoint:
            f.url + (preset === "deeplx" ? "/{{apiKey}}/translate" : ""),
          translation: {
            text: "Hello <safe>",
            sourceLanguage: "auto",
            targetLanguage: "简体中文",
          },
        };
        const result = await complete(
          profile,
          messages,
          "fixture:key",
          new AbortController().signal,
          () => {},
        );
        assert.equal(
          result,
          preset === "microsoft-translate" ? answer + "<safe>" : answer,
        );
        const { url, body, headers } = requests[0];
        assert.ok(!JSON.stringify(body).includes("Translate faithfully"));
        if (preset === "deepl") {
          assert.equal(headers.authorization, "DeepL-Auth-Key fixture:key");
          assert.equal(url, "/v2/translate");
          assert.equal(body.target_lang, "ZH-HANS");
          assert.equal(body.source_lang, undefined);
        }
        if (preset === "deeplx") {
          assert.equal(url, "/fixture%3Akey/translate");
          assert.equal(body.target_lang, "ZH");
        }
        if (preset === "google-translate") {
          const q = new URL(url, f.url).searchParams;
          assert.equal(q.get("tl"), "zh-CN");
          assert.equal(q.get("q"), "Hello <safe>");
        }
        if (preset === "microsoft-translate") {
          assert.equal(new URL(url, f.url).searchParams.get("to"), "zh-Hans");
          assert.deepEqual(body, ["Hello &lt;safe&gt;"]);
        }
        await assert.rejects(
          () =>
            complete(
              { ...profile, translation: undefined },
              messages,
              "fixture:key",
              new AbortController().signal,
              () => {},
            ),
          /只能用于翻译/,
        );
      } finally {
        await f.close();
      }
    },
  );
test("DeepL Free key switches only the official endpoint; translation cache distinguishes text and target", async () => {
  const { CompletionCache } = await import("../src/core/completion-cache");
  const urls: string[] = [];
  const payloads: any[] = [];
  setProviderTransport(async (url, init) => {
    urls.push(url);
    payloads.push(JSON.parse(init.body as string));
    return Response.json({ translations: [{ text: "result-" + urls.length }] });
  });
  try {
    const p: Connection<TextProfile> = {
      ...createProvider("deepl", "deepl"),
      translation: {
        text: "hello",
        sourceLanguage: "auto",
        targetLanguage: "English",
      },
    };
    const cache = new CompletionCache();
    const run = (profile: Connection<TextProfile>) =>
      cache.run(
        profile,
        [],
        "secret:fx",
        new AbortController().signal,
        () => {},
      );
    assert.equal(await run(p), "result-1");
    assert.equal(await run(p), "result-1");
    assert.equal(
      await run({
        ...p,
        translation: { ...p.translation!, targetLanguage: "繁體中文" },
      }),
      "result-2",
    );
    assert.equal(
      await run({ ...p, translation: { ...p.translation!, text: "other" } }),
      "result-3",
    );
    await run({ ...p, endpoint: "https://custom.example/translation" });
    assert.equal(urls[0], "https://api-free.deepl.com/v2/translate");
    assert.equal(payloads[1].target_lang, "ZH-HANT");
    assert.equal(urls[3], "https://custom.example/translation/v2/translate");
  } finally {
    setProviderTransport((url, init) => fetch(url, init));
  }
});
for (const stream of [false, true])
  test(
    "Replicate " +
      (stream ? "stream" : "poll") +
      " resolves text predictions and returns incremental output",
    async () => {
      let polls = 0,
        bodySeen: any;
      const f = await fixture((req, res, body) => {
        assert.equal(req.headers.authorization, "Bearer fixture-key");
        if (req.method === "POST") {
          bodySeen = body;
          return res.end(
            JSON.stringify({
              status: "starting",
              urls: {
                get: f.url + "/prediction/1",
                stream: stream ? f.url + "/stream/1" : undefined,
                cancel: f.url + "/cancel/1",
              },
            }),
          );
        }
        if (req.url === "/stream/1") {
          res.setHeader("content-type", "text/event-stream");
          res.write("event: output\ndata: 你\n\n");
          return setTimeout(
            () =>
              res.end("event: output\ndata: 好\n\nevent: done\ndata: {}\n\n"),
            15,
          );
        }
        polls++;
        res.end(JSON.stringify({ status: "succeeded", output: ["你", "好"] }));
      });
      try {
        const chunks: string[] = [];
        const p = {
          ...createProvider("replicate", "replicate"),
          endpoint: f.url,
          stream,
        };
        assert.equal(
          await complete(
            p,
            messages,
            "fixture-key",
            new AbortController().signal,
            (t) => chunks.push(t),
          ),
          answer,
        );
        assert.equal(bodySeen.input.prompt, "Hello");
        assert.equal(bodySeen.input.system_prompt, "Translate faithfully");
        assert.deepEqual(chunks, stream ? ["你", answer] : [answer]);
        assert.equal(polls, stream ? 0 : 1);
      } finally {
        await f.close();
      }
    },
  );
test("Replicate rejects cross-origin task URLs, cancels failed streams, and redacts vendor errors", async () => {
  let cancelled = 0,
    mode = "hostile";
  const f = await fixture((req, res) => {
    if (req.url === "/cancel/1") {
      cancelled++;
      return res.end("{}");
    }
    if (req.url === "/stream/1") {
      res.setHeader("content-type", "text/event-stream");
      return res.end(
        "event: output\ndata: partial\n\nevent: error\ndata: private-key-in-server-error\n\n",
      );
    }
    res.end(
      JSON.stringify({
        status: "starting",
        urls: {
          get: "https://evil.invalid/prediction",
          stream: mode === "stream" ? f.url + "/stream/1" : undefined,
          cancel: f.url + "/cancel/1",
        },
      }),
    );
  });
  try {
    const p = {
      ...createProvider("replicate", "replicate"),
      endpoint: f.url,
      stream: true,
    };
    await assert.rejects(
      () =>
        complete(
          p,
          messages,
          "fixture-key",
          new AbortController().signal,
          () => {},
        ),
      /不可信/,
    );
    mode = "stream";
    await assert.rejects(
      () =>
        complete(
          p,
          messages,
          "fixture-key",
          new AbortController().signal,
          () => {},
        ),
      (e) => !String(e).includes("private-key") && /生成中/.test(String(e)),
    );
    assert.equal(cancelled, 2);
  } finally {
    await f.close();
  }
});
test("native model discovery handles names, capabilities, pagination and untrusted next links", async () => {
  let preset: ProviderPreset = "anthropic",
    count = 0;
  const f = await fixture((req, res) => {
    count++;
    res.setHeader("content-type", "application/json");
    if (preset === "anthropic") {
      assert.equal(req.headers["x-api-key"], "fixture-key");
      res.end(
        JSON.stringify({
          data: [{ id: count === 1 ? "a" : "b" }],
          has_more: count === 1,
          last_id: "a",
        }),
      );
    } else if (preset === "gemini")
      res.end(
        JSON.stringify({
          models: [
            {
              name: "models/gemini-vision",
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/embedding",
              supportedGenerationMethods: ["embedContent"],
            },
          ],
        }),
      );
    else if (preset === "ollama") {
      assert.equal(req.url, "/tags");
      res.end(JSON.stringify({ models: [{ name: "local:model" }] }));
    } else if (preset === "cohere")
      res.end(JSON.stringify({ models: [{ name: "command-model" }] }));
    else
      res.end(
        JSON.stringify({
          results: [{ owner: "owner", name: "model" }],
          next: "https://evil.invalid/models",
        }),
      );
  });
  try {
    const lookup = () =>
      listModels(
        { ...createProvider(preset, "fixture"), endpoint: f.url },
        "fixture-key",
        new AbortController().signal,
      );
    assert.deepEqual(await lookup(), ["a", "b"]);
    assert.equal(count, 2);
    preset = "gemini";
    assert.deepEqual(await lookup(), ["gemini-vision"]);
    preset = "ollama";
    assert.deepEqual(await lookup(), ["local:model"]);
    preset = "cohere";
    assert.deepEqual(await lookup(), ["command-model"]);
    preset = "replicate";
    await assert.rejects(lookup, /不可信/);
  } finally {
    await f.close();
  }
});
test("native vision conversion preserves image data for OCR", async () => {
  for (const preset of native) {
    const bodies: any[] = [];
    const f = await fixture((_req, res, body) => {
      bodies.push(body);
      if (body.tools?.some((tool: any) => tool.name === "json")) {
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            ...message,
            content: [
              {
                type: "tool_use",
                id: "tool-1",
                name: "json",
                input: { fixture_field: answer },
              },
            ],
            stop_reason: "tool_use",
          }),
        );
        return;
      }
      if (
        body.toolConfig?.tools?.some(
          (tool: any) => tool.toolSpec?.name === "json",
        )
      ) {
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            output: {
              message: {
                role: "assistant",
                content: [
                  {
                    toolUse: {
                      toolUseId: "tool-1",
                      name: "json",
                      input: { fixture_field: answer },
                    },
                  },
                ],
              },
            },
            stopReason: "tool_use",
            usage: { inputTokens: 2, outputTokens: 2, totalTokens: 4 },
          }),
        );
        return;
      }
      const reply = nativeResponse(
        preset === "azure"
          ? "responses"
          : providerProtocol(createProvider(preset, "fixture")),
        false,
      );
      res.setHeader("content-type", reply.type);
      res.end(reply.body);
    });
    try {
      const p = {
        ...createProvider(preset, "fixture"),
        model: "fixture",
        endpoint: f.url + (preset === "open-responses" ? "/responses" : ""),
        stream: false,
      };
      const picture = [
        {
          role: "user",
          content: [
            { type: "text", text: "Read this image" },
            {
              type: "image_url",
              image_url: { url: "data:image/png;base64,iVBORw0KGgo=" },
            },
          ],
        },
      ];
      await complete(
        p,
        picture,
        "fixture-key",
        new AbortController().signal,
        () => {},
      );
      assert.ok(JSON.stringify(bodies[0]).includes("iVBORw0KGgo="), preset);
      await complete(
        {
          ...p,
          outputContract: {
            type: "object",
            properties: { fixture_field: { type: "string" } },
            required: ["fixture_field"],
            additionalProperties: false,
          },
        },
        messages,
        "fixture-key",
        new AbortController().signal,
        () => {},
      );
      assert.ok(
        JSON.stringify(bodies[1]).includes("fixture_field"),
        preset + " sends the output schema",
      );
    } finally {
      await f.close();
    }
  }
});

test("native structured-output rejection retries once before emitting text and keeps other parameters", async () => {
  let calls = 0;
  const f = await fixture((_req, res, body) => {
    calls++;
    res.setHeader("content-type", "application/json");
    assert.equal(body.model, "fixture");
    if (calls === 1) {
      assert.ok(body.response_format.json_schema);
      res.writeHead(400);
      res.end(JSON.stringify({ message: "json_schema is not supported" }));
    } else {
      assert.equal(body.response_format, undefined);
      res.end(nativeResponse("cohere", false).body);
    }
  });
  try {
    const p = {
      ...createProvider("cohere", "fixture"),
      model: "fixture",
      endpoint: f.url,
      stream: false,
      outputContract: {
        type: "object",
        properties: { answer: { type: "string" } },
      },
    };
    assert.equal(
      await complete(
        p,
        messages,
        "fixture-key",
        new AbortController().signal,
        () => {},
      ),
      answer,
    );
    assert.equal(calls, 2);
  } finally {
    await f.close();
  }
});
