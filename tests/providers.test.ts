import test from "node:test";
import assert from "node:assert/strict";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { defaultConfig, OCR_INSTRUCTION } from "../src/shared/config";
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
    await assert.rejects(speak("rejected"), /模型或音色/);
    await assert.rejects(speak("json"), /没有返回音频/);
    await assert.rejects(speak("empty"), /没有返回音频/);
    await assert.rejects(speak("too large"), /大小限制/);
  } finally {
    await f.close();
  }
});
