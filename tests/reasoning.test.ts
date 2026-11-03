import test from "node:test";
import assert from "node:assert/strict";
import { complete } from "../src/core/providers";
import { CompletionCache } from "../src/core/completion-cache";
import { createProvider } from "../src/shared/config";
import type { ThinkingSnapshot } from "../src/shared/completion";

const signal = () => new AbortController().signal;
const profile = {
  ...createProvider("openai", "test"),
  requiresKey: false,
  model: "reasoner",
};
const event = (delta: object, finish_reason: string | null = null) =>
  "data: " + JSON.stringify({ choices: [{ delta, finish_reason }] }) + "\n\n";
const stream = (body: string) =>
  new Response(body, { headers: { "content-type": "text/event-stream" } });
const sse = (events: any[]) =>
  events
    .map(
      (v, sequence_number) =>
        "data: " + JSON.stringify({ sequence_number, ...v }) + "\n\n",
    )
    .join("");

test("compatible reasoning stays separate, supports aliases and summaries, and interleaves with answers", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    stream(
      event({ reasoning_content: "先考虑", reasoning: "duplicate" }) +
        event({ reasoning: "语境。" }) +
        event({ content: "你好" }) +
        event({
          reasoning_details: [
            { type: "reasoning.encrypted", data: "not-readable" },
            { type: "reasoning.text", text: "再次核对。" },
            { type: "reasoning.summary", summary: "保持原意。" },
          ],
        }) +
        event({ content: "，世界！" }, "stop"),
    ),
  );
  const seen: { text: string; thinking?: ThinkingSnapshot }[] = [];
  assert.equal(
    await complete(profile, [], undefined, signal(), (text, thinking) =>
      seen.push({ text, thinking }),
    ),
    "你好，世界！",
  );
  assert.equal(seen[0].text, "");
  assert.equal(seen[1].thinking?.text, "先考虑语境。");
  assert.equal(seen[2].thinking?.status, "complete");
  assert.equal(seen[3].thinking?.status, "thinking");
  assert.deepEqual(seen.at(-1)?.thinking, {
    status: "complete",
    text: "先考虑语境。再次核对。保持原意。",
  });
  assert.ok(!JSON.stringify(seen).includes("not-readable"));
  assert.equal(
    seen[0].thinking?.text,
    "先考虑",
    "snapshots must not mutate after delivery",
  );
});

test("a plain answer completes thinking without inventing reasoning, including non-streaming replies", async (t) => {
  for (const streaming of [true, false]) {
    t.mock.method(globalThis, "fetch", async () =>
      streaming
        ? stream(event({ content: "answer" }, "stop"))
        : Response.json({
            choices: [
              { message: { content: "answer" }, finish_reason: "stop" },
            ],
          }),
    );
    let thinking: ThinkingSnapshot | undefined;
    await complete(
      { ...profile, stream: streaming },
      [],
      undefined,
      signal(),
      (_text, value) => {
        thinking = value;
      },
    );
    assert.deepEqual(thinking, { status: "complete", text: "" });
  }
});

test("cache replays completed reasoning and counts it toward its memory limit", async (t) => {
  let count = 0;
  t.mock.method(globalThis, "fetch", async () => {
    count++;
    return Response.json({
      choices: [
        {
          message: { content: "answer", reasoning_content: "reasoning" },
          finish_reason: "stop",
        },
      ],
    });
  });
  const cache = new CompletionCache();
  const first: ThinkingSnapshot[] = [],
    second: ThinkingSnapshot[] = [];
  await cache.run(profile, [], undefined, signal(), (_text, value) => {
    if (value) first.push(value);
  });
  await cache.run(profile, [], undefined, signal(), (_text, value) => {
    if (value) second.push(value);
  });
  assert.equal(count, 1);
  assert.deepEqual(second, [{ status: "complete", text: "reasoning" }]);
  assert.equal(first[0].status, "thinking");
  second[0].text = "mutated by caller";
  await cache.run(profile, [], undefined, signal(), (_text, value) =>
    assert.equal(value?.text, "reasoning"),
  );
  const tiny = new CompletionCache(Date.now, 20);
  for (let i = 0; i < 2; i++)
    await tiny.run(profile, [], undefined, signal(), () => {});
  assert.equal(count, 3, "reasoning plus answer must exceed the capacity");
});

test("reasoning-only failures and cancelled generations never enter the cache", async (t) => {
  let count = 0;
  t.mock.method(globalThis, "fetch", async () => {
    count++;
    return stream(event({ reasoning_content: "partial thought" }));
  });
  const cache = new CompletionCache();
  for (let i = 0; i < 2; i++) {
    let thinking: ThinkingSnapshot | undefined;
    await assert.rejects(
      cache.run(profile, [], undefined, signal(), (_text, value) => {
        thinking = value;
      }),
      /连接中断/,
    );
    assert.equal(thinking?.text, "partial thought");
  }
  assert.equal(count, 2);
  t.mock.method(globalThis, "fetch", async () =>
    stream(
      event({ reasoning_content: "partial" }) +
        event({ content: "answer" }, "stop"),
    ),
  );
  const controller = new AbortController();
  await cache
    .run(profile, [], undefined, controller.signal, () => controller.abort())
    .catch(() => {});
  let replay = false;
  t.mock.method(globalThis, "fetch", async () => {
    replay = true;
    return stream(event({ content: "new" }, "stop"));
  });
  assert.equal(
    await cache.run(profile, [], undefined, signal(), () => {}),
    "new",
  );
  assert.equal(replay, true);
});

test("combined answer and reasoning have a bounded size", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    stream(
      event({ reasoning_content: "r".repeat(1_000_001) }) + "data: [DONE]\n\n",
    ),
  );
  await assert.rejects(
    complete(profile, [], undefined, signal(), () => {}),
    /结果过长/,
  );
});

test("native requests opt into available thought summaries without enabling disabled reasoning", async (t) => {
  for (const preset of ["gemini", "open-responses"] as const) {
    for (const reasoningEffort of ["low", "none"] as const) {
      let body: any;
      t.mock.method(
        globalThis,
        "fetch",
        async (_url: unknown, init: RequestInit) => {
          body = JSON.parse(String(init.body));
          return nativeReply(preset, false);
        },
      );
      await complete(
        {
          ...createProvider(preset, "test"),
          model: "gemini-2.5-flash",
          stream: false,
          reasoningEffort,
        },
        [{ role: "user", content: "Hello" }],
        "fixture-key",
        signal(),
        () => {},
      );
      if (preset === "gemini")
        assert.equal(
          body.generationConfig.thinkingConfig.includeThoughts,
          reasoningEffort === "low" ? true : undefined,
        );
      else
        assert.equal(
          body.reasoning?.summary,
          reasoningEffort === "low" ? "auto" : undefined,
        );
    }
  }
});

function nativeReply(preset: string, streaming: boolean) {
  const reasoning = "先理解语境。",
    answer = "你好";
  if (preset === "gemini") {
    const data = {
      candidates: [
        {
          index: 0,
          content: {
            role: "model",
            parts: [
              {
                text: reasoning,
                thought: true,
                thoughtSignature: "signature-not-text",
              },
              { text: answer },
            ],
          },
          finishReason: "STOP",
        },
      ],
      usageMetadata: {
        promptTokenCount: 2,
        candidatesTokenCount: 2,
        totalTokenCount: 4,
      },
    };
    return streaming ? stream(sse([data])) : Response.json(data);
  }
  if (preset === "anthropic") {
    const thought = {
      type: "thinking",
      thinking: reasoning,
      signature: "signature-not-text",
    };
    const message = {
      id: "msg-1",
      type: "message",
      role: "assistant",
      model: "fixture",
      content: [thought, { type: "text", text: answer }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 2, output_tokens: 2 },
    };
    return !streaming
      ? Response.json(message)
      : stream(
          sse([
            {
              type: "message_start",
              message: { ...message, content: [], stop_reason: null },
            },
            {
              type: "content_block_start",
              index: 0,
              content_block: { ...thought, thinking: "", signature: "" },
            },
            {
              type: "content_block_delta",
              index: 0,
              delta: { type: "thinking_delta", thinking: reasoning },
            },
            {
              type: "content_block_delta",
              index: 0,
              delta: {
                type: "signature_delta",
                signature: "signature-not-text",
              },
            },
            { type: "content_block_stop", index: 0 },
            {
              type: "content_block_start",
              index: 1,
              content_block: { type: "text", text: "" },
            },
            {
              type: "content_block_delta",
              index: 1,
              delta: { type: "text_delta", text: answer },
            },
            { type: "content_block_stop", index: 1 },
            {
              type: "message_delta",
              delta: { stop_reason: "end_turn", stop_sequence: null },
              usage: message.usage,
            },
            { type: "message_stop" },
          ]),
        );
  }
  const thought = {
    id: "rs-1",
    type: "reasoning",
    summary: [{ type: "summary_text", text: reasoning }],
    encrypted_content: "signature-not-text",
  };
  const message = {
    id: "msg-1",
    type: "message",
    status: "completed",
    role: "assistant",
    content: [{ type: "output_text", text: answer, annotations: [] }],
  };
  const response = {
    id: "resp-1",
    object: "response",
    created_at: 1,
    model: "fixture",
    status: "completed",
    error: null,
    incomplete_details: null,
    output: [thought, message],
    usage: { input_tokens: 2, output_tokens: 2, total_tokens: 4 },
  };
  return !streaming
    ? Response.json(response)
    : stream(
        sse([
          {
            type: "response.created",
            response: { ...response, status: "in_progress", output: [] },
          },
          {
            type: "response.output_item.added",
            output_index: 0,
            item: { ...thought, summary: [] },
          },
          {
            type: "response.reasoning_summary_part.added",
            output_index: 0,
            item_id: "rs-1",
            summary_index: 0,
            part: { type: "summary_text", text: "" },
          },
          {
            type: "response.reasoning_summary_text.delta",
            output_index: 0,
            item_id: "rs-1",
            summary_index: 0,
            delta: reasoning,
          },
          {
            type: "response.reasoning_summary_part.done",
            output_index: 0,
            item_id: "rs-1",
            summary_index: 0,
            part: thought.summary[0],
          },
          { type: "response.output_item.done", output_index: 0, item: thought },
          {
            type: "response.output_item.added",
            output_index: 1,
            item: { ...message, content: [] },
          },
          {
            type: "response.content_part.added",
            output_index: 1,
            item_id: "msg-1",
            content_index: 0,
            part: { type: "output_text", text: "", annotations: [] },
          },
          {
            type: "response.output_text.delta",
            output_index: 1,
            item_id: "msg-1",
            content_index: 0,
            delta: answer,
            logprobs: [],
          },
          {
            type: "response.output_text.done",
            output_index: 1,
            item_id: "msg-1",
            content_index: 0,
            text: answer,
            logprobs: [],
          },
          { type: "response.output_item.done", output_index: 1, item: message },
          { type: "response.completed", response },
        ]),
      );
}
for (const preset of [
  "anthropic",
  "gemini",
  "open-responses",
  "azure",
] as const)
  for (const streaming of [false, true])
    test(`${preset} ${streaming ? "streaming" : "JSON"} retains provider reasoning separately from the answer`, async (t) => {
      t.mock.method(globalThis, "fetch", async () =>
        nativeReply(preset, streaming),
      );
      const seen: { text: string; thinking?: ThinkingSnapshot }[] = [];
      assert.equal(
        await complete(
          {
            ...createProvider(preset, "test"),
            model: "fixture",
            stream: streaming,
          },
          [{ role: "user", content: "Hello" }],
          "fixture-key",
          signal(),
          (text, thinking) => seen.push({ text, thinking }),
        ),
        "你好",
      );
      assert.equal(seen.at(-1)?.thinking?.text, "先理解语境。");
      assert.equal(seen.at(-1)?.thinking?.status, "complete");
      assert.ok(!JSON.stringify(seen).includes("signature-not-text"));
      assert.ok(
        seen.some((v) => v.text === "" && v.thinking?.text === "先理解语境。"),
      );
    });
