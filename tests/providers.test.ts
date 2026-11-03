import test from "node:test";
import assert from "node:assert/strict";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import {
  defaultConfig,
  createProvider,
  OCR_INSTRUCTION,
} from "../src/shared/config";
import {
  complete,
  recognizeVision,
  synthesizeSpeech,
  listModels,
  JobGate,
} from "../src/core/providers";
import { readFile } from "node:fs/promises";
async function fixture(
  handler: (req: IncomingMessage, res: ServerResponse, body: any) => void,
) {
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    handler(req, res, raw ? JSON.parse(raw) : {});
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
}
test("SSE handles split UTF-8 bytes and CRLF event boundaries", async () => {
  const f = await fixture((_q, r) => {
    r.setHeader("Content-Type", "text/event-stream");
    const first = Buffer.from(
      'data: {"choices":[{"delta":{"content":"你好"}}]}\r\n\r\n',
    );
    const split = first.indexOf(Buffer.from("你好")) + 1;
    r.write(first.subarray(0, split));
    setTimeout(() => {
      r.write(first.subarray(split, first.length - 1));
      setTimeout(() => {
        r.write(first.subarray(first.length - 1));
        r.write('data: {"choices":[{"delta":{"content":" world"}}]}\n\n');
        r.end("data: [DONE]\n\n");
      }, 15);
    }, 15);
  });
  try {
    const p = {
      ...defaultConfig().providers[0],
      endpoint: f.url,
      model: "fixture",
      requiresKey: false,
    };
    let seen = "";
    assert.equal(
      await complete(
        p,
        [],
        undefined,
        new AbortController().signal,
        (t) => (seen = t),
      ),
      "你好 world",
    );
    assert.equal(seen, "你好 world");
  } finally {
    await f.close();
  }
});
test("a completed stream returns even if the server keeps the socket open", async () => {
  const f = await fixture((_q, r) => {
    r.writeHead(200, { "Content-Type": "text/event-stream" });
    r.write(
      'data: {"choices":[{"delta":{"content":"done"}}]}\n\ndata: [DONE]\n\n',
    );
    // Intentionally no end: the protocol terminator must be sufficient.
  });
  try {
    assert.equal(
      await complete(
        {
          ...defaultConfig().providers[0],
          endpoint: f.url,
          model: "fixture",
          requiresKey: false,
          timeoutMs: 700,
        },
        [],
        undefined,
        new AbortController().signal,
        () => {},
      ),
      "done",
    );
  } finally {
    await f.close();
  }
});
test("premature stream EOF is a failure and preserves partial output", async () => {
  const f = await fixture((_q, r) => {
    r.writeHead(200, { "Content-Type": "text/event-stream" });
    r.end('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n');
  });
  let partial = "";
  try {
    await assert.rejects(
      () =>
        complete(
          {
            ...defaultConfig().providers[0],
            endpoint: f.url,
            model: "fixture",
            requiresKey: false,
          },
          [],
          undefined,
          new AbortController().signal,
          (text) => {
            partial = text;
          },
        ),
      /连接中断/,
    );
    assert.equal(partial, "partial");
  } finally {
    await f.close();
  }
});
test("invalid JSON responses never leak their response text", async () => {
  const f = await fixture((_q, r) => {
    r.setHeader("Content-Type", "application/json");
    r.end("secret-from-upstream");
  });
  try {
    await assert.rejects(
      () =>
        complete(
          {
            ...defaultConfig().providers[0],
            endpoint: f.url,
            model: "fixture",
            requiresKey: false,
          },
          [],
          undefined,
          new AbortController().signal,
          () => {},
        ),
      (error: Error) => {
        assert.match(error.message, /格式无效/);
        assert.ok(!error.message.includes("secret-from-upstream"));
        return true;
      },
    );
  } finally {
    await f.close();
  }
});
test("provider failures are useful and never echo authorization or raw response", async () => {
  for (const [status, pattern] of [
    [401, /凭据/],
    [429, /额度/],
    [404, /模型/],
    [400, /支持/],
  ] as const) {
    const f = await fixture((_q, r) => {
      r.statusCode = status;
      r.end("secret-key-in-error");
    });
    try {
      await assert.rejects(
        () =>
          complete(
            {
              ...defaultConfig().providers[0],
              model: "fixture",
              endpoint: f.url,
            },
            [],
            "secret-key",
            new AbortController().signal,
            () => {},
          ),
        pattern,
      );
    } finally {
      await f.close();
    }
  }
});
test("cancellation interrupts streaming and superseded job results are discarded", async () => {
  const f = await fixture((_q, r) => {
    r.writeHead(200, { "Content-Type": "text/event-stream" });
    r.write('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n');
  });
  try {
    const c = new AbortController();
    const result = complete(
      {
        ...defaultConfig().providers[0],
        model: "fixture",
        endpoint: f.url,
        requiresKey: false,
      },
      [],
      undefined,
      c.signal,
      () => c.abort(),
    );
    await assert.rejects(() => result, /取消/);
    const gate = new JobGate();
    const previous = gate.begin("same");
    gate.cancel("same");
    const current = gate.begin("same");
    assert.equal(gate.active("same", previous), false);
    gate.finish("same", previous);
    assert.equal(gate.active("same", current), true);
  } finally {
    await f.close();
  }
});
test("model discovery uses the configured endpoint and key; noncompatible responses remain recoverable", async () => {
  let mode = "ok";
  const f = await fixture((q, r) => {
    assert.equal(q.url, "/models");
    assert.equal(q.headers.authorization, "Bearer model-list-key");
    if (mode === "404") {
      r.writeHead(404);
      r.end("raw private error");
      return;
    }
    r.end(
      mode === "invalid"
        ? "raw private response"
        : JSON.stringify({
            data: [{ id: "b" }, { id: "a" }, { id: "b" }, { wrong: true }],
          }),
    );
  });
  try {
    const p = { ...defaultConfig().providers[0], endpoint: f.url };
    assert.deepEqual(
      await listModels(p, "model-list-key", new AbortController().signal),
      ["a", "b"],
    );
    mode = "404";
    await assert.rejects(
      () => listModels(p, "model-list-key", new AbortController().signal),
      /模型或接口不存在/,
    );
    mode = "invalid";
    await assert.rejects(
      () => listModels(p, "model-list-key", new AbortController().signal),
      /手动填写/,
    );
  } finally {
    await f.close();
  }
});
test("vision uses OpenAI image_url, honors stream preference, and reports text-only model rejection", async () => {
  const image =
    "data:image/png;base64," +
    (await readFile("src/renderer/public/icon.png")).toString("base64");
  const calls: any[] = [];
  const f = await fixture((q, r, body) => {
    calls.push({ url: q.url, body, auth: q.headers.authorization });
    if (body.model === "text-only") {
      r.writeHead(400);
      r.end("no image support");
      return;
    }
    r.setHeader("Content-Type", "application/json");
    r.end(
      JSON.stringify({ choices: [{ message: { content: "ReadFinch 123" } }] }),
    );
  });
  try {
    const p = {
      ...defaultConfig().providers[0],
      kind: "openai" as const,
      endpoint: f.url,
      model: "vision-fixture",
      reasoningEffort: "xhigh" as const,
      stream: false,
      instruction: OCR_INSTRUCTION,
    };
    const output = await recognizeVision(
      p,
      image,
      "fixture-key",
      new AbortController().signal,
      () => {},
    );
    assert.equal(output, "ReadFinch 123");
    assert.equal(calls[0].url, "/chat/completions");
    assert.equal(calls[0].auth, "Bearer fixture-key");
    assert.equal(calls[0].body.stream, false);
    assert.equal(calls[0].body.reasoning_effort, "xhigh");
    assert.equal(calls[0].body.messages[0].content[1].image_url.url, image);
    await assert.rejects(
      () =>
        recognizeVision(
          { ...p, model: "text-only" },
          image,
          "fixture-key",
          new AbortController().signal,
          () => {},
        ),
      /图片能力/,
    );
    assert.equal(calls.length, 2);
  } finally {
    await f.close();
  }
});
test("speech uses the configured audio endpoint and credentials, and rejects error documents and oversized audio", async () => {
  const expected = Buffer.from([73, 68, 51, 4]);
  const f = await fixture((req, res, body) => {
    assert.equal(req.url, "/v1/audio/speech");
    assert.equal(req.headers.authorization, "Bearer fixture-token");
    assert.equal(req.headers["x-speaker"], "fixture");
    assert.equal(body.model, "speech-fixture");
    assert.equal(body.voice, "custom-voice");
    assert.equal(body.speed, 1.25);
    assert.equal(body.response_format, "mp3");
    switch (body.input) {
      case "rejected":
        res.writeHead(422);
        res.end();
        break;
      case "json":
        res.writeHead(200, { "content-type": "application/json" });
        res.end("{}");
        break;
      case "empty":
        res.writeHead(200, { "content-type": "audio/mpeg" });
        res.end();
        break;
      case "too large":
        res.writeHead(200, { "content-type": "audio/mpeg" });
        res.end(Buffer.alloc(12 * 1024 * 1024 + 1));
        break;
      default:
        res.writeHead(200, { "content-type": "audio/mpeg" });
        res.end(expected);
    }
  });
  try {
    const profile = {
      ...defaultConfig().providers[0],
      endpoint: f.url + "/v1",
      model: "speech-fixture",
      modelKind: "speech" as const,
      headers: { "X-Speaker": "fixture" },
    };
    const speak = (text: string) =>
      synthesizeSpeech(
        profile,
        "fixture-token",
        text,
        "custom-voice",
        1.25,
        new AbortController().signal,
      );
    const result = await speak("valid");
    assert.deepEqual(Buffer.from(result.bytes), expected);
    assert.equal(result.mime, "audio/mpeg");
    await assert.rejects(speak("rejected"), /模型、音色/);
    await assert.rejects(speak("json"), /没有返回音频/);
    await assert.rejects(speak("empty"), /没有返回音频/);
    await assert.rejects(speak("too large"), /大小限制/);
  } finally {
    await f.close();
  }
});

test("MiMo speech sends assistant text and audio options to chat/completions and decodes bounded WAV audio", async () => {
  const wav = Buffer.alloc(46);
  wav.write("RIFF");
  wav.writeUInt32LE(38, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24000, 24);
  wav.writeUInt32LE(48000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(2, 40);
  const seen: any[] = [];
  const f = await fixture((req, res, body) => {
    assert.equal(req.url, "/v1/chat/completions");
    assert.equal(req.headers.authorization, "Bearer fixture-key");
    assert.equal(req.headers["x-project"], "voice-test");
    seen.push(body);
    const text = body.messages.at(-1).content;
    if (text === "cancel") {
      res.writeHead(200, { "content-type": "application/json" });
      res.write('{"choices":[');
      return;
    }
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              audio: {
                data:
                  text === "malformed"
                    ? "not base64"
                    : text === "not audio"
                      ? Buffer.from("hello").toString("base64")
                      : wav.toString("base64"),
              },
            },
          },
        ],
      }),
    );
  });
  try {
    const p = {
      ...createProvider("mimo", "speech"),
      endpoint: f.url + "/v1",
      model: "mimo-v2.5-tts",
      headers: { "X-Project": "voice-test" },
      speechInstructions: "Read warmly.",
    };
    const speak = (text: string, signal = new AbortController().signal) =>
      synthesizeSpeech(p, "fixture-key", text, "冰糖", 1.25, signal);
    const result = await speak("你好，world!");
    assert.deepEqual(Buffer.from(result.bytes), wav);
    assert.equal(result.mime, "audio/wav");
    assert.deepEqual(seen[0].messages.at(-1), {
      role: "assistant",
      content: "你好，world!",
    });
    assert.equal(seen[0].messages[0].role, "user");
    assert.match(seen[0].messages[0].content, /Read warmly/);
    assert.deepEqual(seen[0].audio, { format: "wav", voice: "冰糖" });
    assert.equal(seen[0].stream, false);
    assert.equal(seen[0].input, undefined);
    assert.equal(seen[0].speed, undefined);
    await assert.rejects(speak("malformed"), /有效的音频/);
    await assert.rejects(speak("not audio"), /有效的音频/);
    const abort = new AbortController();
    const pending = speak("cancel", abort.signal);
    setTimeout(() => abort.abort(), 30);
    await assert.rejects(pending);
    const alias = {
      ...p,
      preset: "custom" as const,
      model: "voice-alias",
      modelKind: "speech" as const,
      speechProtocol: "mimo" as const,
      endpoint: f.url + "/v1/chat/completions",
    };
    await synthesizeSpeech(
      alias,
      "fixture-key",
      "alias",
      "Mia",
      1,
      new AbortController().signal,
    );
    assert.equal(seen.at(-1).model, "voice-alias");
  } finally {
    await f.close();
  }
});

test("streaming rejection falls back once without changing the provider; authentication errors never retry", async () => {
  const calls: any[] = [];
  const f = await fixture((req, res, body) => {
    calls.push(body);
    assert.equal(req.headers.authorization, undefined);
    if (body.messages[0].content === "auth") {
      res.writeHead(401);
      res.end("stream unsupported");
      return;
    }
    if (body.stream) {
      res.writeHead(400);
      res.end(
        JSON.stringify({
          error: { message: "Streaming is not supported for this model" },
        }),
      );
      return;
    }
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        choices: [{ message: { content: "fallback result" } }],
      }),
    );
  });
  try {
    const p = {
      ...createProvider("custom", "no-key"),
      model: "fixture",
      endpoint: f.url + "/v1",
    };
    const result = await complete(
      p,
      [{ role: "user", content: "test" }],
      undefined,
      new AbortController().signal,
      () => {},
    );
    assert.equal(result, "fallback result");
    assert.deepEqual(
      calls.map((v) => v.stream),
      [true, false],
    );
    assert.equal(p.stream, true);
    await assert.rejects(
      complete(
        p,
        [{ role: "user", content: "auth" }],
        undefined,
        new AbortController().signal,
        () => {},
      ),
      /凭据/,
    );
    assert.equal(calls.length, 3);
  } finally {
    await f.close();
  }
});
