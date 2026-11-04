import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAzure } from "@ai-sdk/azure";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createCohere } from "@ai-sdk/cohere";
import { createOpenResponses } from "@ai-sdk/open-responses";
import { createOllama } from "ai-sdk-ollama";
import type {
  LanguageModelV4,
  LanguageModelV4Prompt,
  LanguageModelV4CallOptions,
  JSONSchema7,
} from "@ai-sdk/provider";
import type { TextProfile } from "../shared/config";
import { providerProtocol } from "../shared/provider-presets";
import { t } from "../shared/i18n";
import type { CompletionUpdate } from "../shared/completion";
import { CompletionProgress } from "./completion-progress";
import {
  request,
  providerAuth,
  ProviderError,
  httpError,
  type Connection,
} from "./provider-http";

function settings(
  profile: Connection<TextProfile>,
  key: string | undefined,
  signal: AbortSignal,
) {
  const configured = providerAuth(profile, key);
  const customFetch: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    // The SDK never reads ambient credentials: authentication belongs to this account.
    for (const name of [
      "authorization",
      "x-api-key",
      "x-goog-api-key",
      "api-key",
    ])
      headers.delete(name);
    for (const [name, value] of configured) headers.set(name, value);
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const response = await request(
      url,
      { ...init, headers },
      signal,
      profile.timeoutMs,
      profile,
    );
    if (!response.body) return response;
    let bytes = 0;
    const body = response.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          bytes += chunk.byteLength;
          if (bytes > 16 * 1024 * 1024)
            throw new ProviderError("limit", t("响应超过大小限制"));
          controller.enqueue(chunk);
        },
      }),
    );
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
  return {
    apiKey: key || "readfinch-no-ambient-key",
    baseURL: profile.endpoint.replace(/\/+$/, ""),
    fetch: customFetch,
  };
}
function azure(
  profile: Connection<TextProfile>,
  key: string | undefined,
  signal: AbortSignal,
) {
  return createAzure({
    ...settings(profile, key, signal),
    apiVersion: profile.providerSettings?.apiVersion || "v1",
    resourceName: profile.providerSettings?.resourceName,
    useDeploymentBasedUrls:
      (profile.providerSettings?.apiVersion || "v1") !== "v1",
  });
}
function modelFor(
  profile: Connection<TextProfile>,
  key: string | undefined,
  signal: AbortSignal,
): LanguageModelV4 {
  const options = settings(profile, key, signal);
  switch (providerProtocol(profile)) {
    case "anthropic":
      return createAnthropic(options).languageModel(profile.model);
    case "gemini":
      return createGoogleGenerativeAI(options).languageModel(profile.model);
    case "azure": {
      const provider = azure(profile, key, signal);
      return profile.providerSettings?.apiMode === "chat"
        ? provider.chat(profile.model)
        : provider.responses(profile.model);
    }
    case "bedrock":
      return createAmazonBedrock({
        ...options,
        region: profile.providerSettings?.region || "us-east-1",
      }).languageModel(profile.model);
    case "cohere":
      return createCohere(options).languageModel(profile.model);
    case "responses":
      return createOpenResponses({
        apiKey: options.apiKey,
        fetch: options.fetch,
        name: "readfinch",
        url: profile.endpoint,
      }).languageModel(profile.model);
    case "ollama":
      return createOllama(options).languageModel(profile.model, {
        options: profile.providerOptions,
        think:
          profile.reasoningEffort && profile.reasoningEffort !== "none"
            ? true
            : false,
      });
    default:
      throw new ProviderError("capability", t("不支持此提供商协议"));
  }
}
function promptFor(messages: unknown[]): LanguageModelV4Prompt {
  return messages.map((entry: any) => {
    if (entry.role === "system")
      return { role: "system", content: String(entry.content) };
    if (entry.role !== "user" && entry.role !== "assistant")
      throw new ProviderError("protocol", t("不支持的消息类型"));
    const parts =
      typeof entry.content === "string"
        ? [{ type: "text", text: entry.content }]
        : entry.content;
    return {
      role: entry.role,
      content: parts.map((part: any) => {
        if (part.type === "text")
          return { type: "text", text: String(part.text) };
        const image =
          /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
            part.image_url?.url ?? "",
          );
        if (!image) throw new ProviderError("image", t("图片格式或大小无效"));
        return {
          type: "file",
          mediaType: image[1],
          data: { type: "data", data: image[2] },
        };
      }),
    };
  });
}
function checkedFinish(reason: string) {
  if (reason !== "stop")
    throw new ProviderError(
      "incomplete",
      t("模型未返回完整结果，可重新生成。"),
    );
}
function nativeOptions(
  profile: TextProfile,
  provider: string,
): LanguageModelV4CallOptions["providerOptions"] {
  const protocol = providerProtocol(profile);
  const options = profile.providerOptions;
  if (options !== undefined) {
    if (protocol === "bedrock") return { amazonBedrock: options };
    if (protocol === "azure") return { openai: options, azure: options };
    return { [provider.split(".")[0]]: options };
  }
  if (profile.reasoningEffort === "none") return;
  if (
    protocol === "gemini" &&
    (profile.reasoningEffort ||
      /^gemini-(?:2\.5|[3-9](?:[.-]|$))/.test(profile.model))
  )
    return { google: { thinkingConfig: { includeThoughts: true } } };
  if (protocol === "responses" && profile.reasoningEffort)
    return { readfinch: { reasoningSummary: "auto" } };
}
function safeError(error: unknown, signal: AbortSignal): never {
  if (signal.aborted)
    throw new ProviderError(
      signal.reason?.name === "TimeoutError" ? "timeout" : "cancelled",
      signal.reason?.name === "TimeoutError"
        ? t("请求超时，已保留部分结果")
        : t("请求已取消"),
    );
  if (error instanceof ProviderError) throw error;
  const status = (error as { statusCode?: unknown })?.statusCode;
  if (typeof status === "number" && status >= 400) throw httpError(status);
  throw new ProviderError(
    "protocol",
    t("服务返回的数据格式无效，请检查接口兼容性"),
  );
}
export async function completeNative(
  profile: Connection<TextProfile>,
  messages: unknown[],
  key: string | undefined,
  signal: AbortSignal,
  onText: CompletionUpdate,
): Promise<string> {
  const deadline = AbortSignal.any([
    signal,
    AbortSignal.timeout(profile.timeoutMs),
  ]);
  let emitted = false;
  const emit: CompletionUpdate = (text, thinking) => {
    emitted = true;
    onText(text, thinking);
  };
  try {
    const model = modelFor(profile, key, deadline);
    const options: LanguageModelV4CallOptions = {
      prompt: promptFor(messages),
      abortSignal: deadline,
      temperature: profile.temperature ?? undefined,
      reasoning: profile.reasoningEffort,
      providerOptions: nativeOptions(profile, model.provider),
      ...(profile.preset === "anthropic" ? { maxOutputTokens: 8192 } : {}),
      ...(profile.outputContract
        ? {
            responseFormat: {
              type: "json",
              name: "action_result",
              schema: profile.outputContract as JSONSchema7,
            },
          }
        : {}),
    };
    const run = async (options: LanguageModelV4CallOptions) => {
      const progress = new CompletionProgress(emit);
      if (!profile.stream) {
        const result = await model.doGenerate(options);
        for (const part of result.content) {
          if (part.type === "reasoning") progress.appendReasoning(part.text);
          if (part.type === "text") progress.appendText(part.text);
        }
        checkedFinish(result.finishReason.unified);
        if (!progress.text.trim())
          throw new ProviderError(
            "empty",
            t("模型返回空结果，请检查输入和模型"),
          );
        progress.endThinking();
        return progress.text;
      }
      const response = await model.doStream(options);
      const reader = response.stream.getReader();
      let finished = false;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          deadline.throwIfAborted();
          if (value.type === "error") throw value.error;
          if (value.type === "text-delta") progress.appendText(value.delta);
          if (value.type === "reasoning-start") progress.startThinking();
          if (value.type === "reasoning-delta")
            progress.appendReasoning(value.delta);
          if (value.type === "reasoning-end") progress.endThinking();
          if (value.type === "finish") {
            checkedFinish(value.finishReason.unified);
            finished = true;
            break;
          }
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      if (!finished)
        throw new ProviderError(
          "interrupted",
          t("连接中断，已保留收到的部分结果；可重试"),
        );
      if (!progress.text.trim())
        throw new ProviderError("empty", t("模型返回空结果，请检查输入和模型"));
      progress.endThinking();
      return progress.text;
    };
    try {
      return await run(options);
    } catch (error) {
      const failure = error as { statusCode?: number; responseBody?: string };
      if (
        !emitted &&
        !deadline.aborted &&
        profile.outputContract &&
        [400, 422].includes(failure.statusCode ?? 0) &&
        /response[_ ]format|json[_ ]schema|structured output|output[_ ]config|responseSchema/i.test(
          failure.responseBody ?? "",
        )
      )
        return await run({ ...options, responseFormat: undefined });
      throw error;
    }
  } catch (error) {
    safeError(error, deadline);
  }
}
export async function synthesizeAzureSpeech(
  profile: Connection<TextProfile>,
  key: string | undefined,
  text: string,
  voice: string,
  speed: number,
  signal: AbortSignal,
) {
  const deadline = AbortSignal.any([
    signal,
    AbortSignal.timeout(profile.timeoutMs),
  ]);
  try {
    const output = await azure(profile, key, deadline)
      .speech(profile.model)
      .doGenerate({
        text,
        voice,
        speed,
        outputFormat: "mp3",
        abortSignal: deadline,
      });
    const bytes =
      typeof output.audio === "string"
        ? Buffer.from(output.audio, "base64")
        : output.audio;
    const mime =
      output.response.headers?.["content-type"]?.split(";")[0] || "audio/mpeg";
    if (
      !bytes.length ||
      bytes.length > 12 * 1024 * 1024 ||
      !mime.startsWith("audio/")
    )
      throw new ProviderError("speech", t("语音服务没有返回音频"));
    return { bytes, mime };
  } catch (error) {
    safeError(error, deadline);
  }
}
