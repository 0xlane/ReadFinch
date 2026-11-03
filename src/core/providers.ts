import {
  request,
  auth,
  providerAuth,
  responseJson,
  ProviderError,
  httpError,
  endpointUrl,
  type Connection,
} from "./provider-http";
export {
  setProviderTransport,
  request,
  ProviderError,
  httpError,
  endpointUrl,
} from "./provider-http";
export type { ProviderTransport } from "./provider-http";
import {
  isTranslationOnly,
  providerProtocol,
  supportsSpeech,
} from "../shared/provider-presets";
import { completeNative, synthesizeAzureSpeech } from "./provider-native";
import { translateText } from "./provider-translation";
import { completeReplicate } from "./provider-replicate";
import { t } from "../shared/i18n";
import type { TextProfile, OcrProfile, Action } from "../shared/config";
import { promptVariables } from "../shared/config";
import { jsonContract } from "../shared/action-output";
import type { CompletionUpdate } from "../shared/completion";
import { CompletionProgress, chatReasoning } from "./completion-progress";

export { listModels } from "./provider-discovery";
export async function synthesizeSpeech(
  profile: Connection<TextProfile>,
  key: string | undefined,
  text: string,
  voice: string,
  speed: number,
  signal: AbortSignal,
) {
  if (!supportsSpeech(profile))
    throw new ProviderError("capability", t("此提供商不支持在线语音接口"));
  if (profile.preset === "azure")
    return synthesizeAzureSpeech(profile, key, text, voice, speed, signal);
  const res = await request(
    endpointUrl(profile.endpoint, "audio/speech"),
    {
      method: "POST",
      headers: auth(key, profile.requiresKey, profile.headers),
      body: JSON.stringify({
        model: profile.model,
        input: text,
        voice,
        response_format: "mp3",
        speed,
      }),
    },
    signal,
    profile.timeoutMs,
    profile,
  );
  if (!res.ok) {
    await res.body?.cancel();
    if (res.status === 400 || res.status === 404 || res.status === 422)
      throw Error(
        t("语音服务不支持当前模型或音色，请检查 /audio/speech 配置。"),
      );
    throw httpError(res.status);
  }
  const mime = (res.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (
    !res.body ||
    (mime && !mime.startsWith("audio/") && mime !== "application/octet-stream")
  ) {
    await res.body?.cancel();
    throw Error(t("语音服务没有返回音频"));
  }
  const reader = res.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 12 * 1024 * 1024) {
        await reader.cancel();
        throw Error(t("音频超过大小限制"));
      }
      chunks.push(value);
    }
  } catch (error) {
    if (signal.aborted) throw new ProviderError("cancelled", t("请求已取消"));
    if ((error as Error).name === "TimeoutError")
      throw new ProviderError(
        "timeout",
        t("请求超时，请检查服务或增加超时时间"),
      );
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (!size) throw Error(t("语音服务没有返回音频"));
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, mime: mime.startsWith("audio/") ? mime : "audio/mpeg" };
}
function contentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((v) => v?.text ?? "").join("");
  return "";
}
export async function complete(
  profile: Connection<TextProfile>,
  messages: unknown[],
  key: string | undefined,
  signal: AbortSignal,
  onText: CompletionUpdate,
): Promise<string> {
  if (isTranslationOnly(profile)) {
    if (!profile.translation)
      throw new ProviderError("capability", t("纯翻译提供商只能用于翻译"));
    return translateText(profile, profile.translation, key, signal, onText);
  }
  if (!profile.model.trim())
    throw new ProviderError("model", t("尚未填写模型 ID，请先配置文字服务"));
  const protocol = providerProtocol(profile);
  if (protocol === "replicate")
    return completeReplicate(profile, messages, key, signal, (text) =>
      onText(text, { status: "complete", text: "" }),
    );
  if (protocol !== "chat")
    return completeNative(profile, messages, key, signal, onText);
  const deadline = AbortSignal.any([
    signal,
    AbortSignal.timeout(profile.timeoutMs),
  ]);
  try {
    const send = (structured: boolean) =>
      request(
        endpointUrl(profile.endpoint, "chat/completions"),
        {
          method: "POST",
          headers: auth(key, profile.requiresKey, profile.headers),
          body: JSON.stringify({
            model: profile.model,
            ...(profile.reasoningEffort && {
              reasoning_effort: profile.reasoningEffort,
            }),
            ...(profile.temperature != null
              ? { temperature: profile.temperature }
              : {}),
            messages,
            ...(structured
              ? {
                  response_format: {
                    type: "json_schema",
                    json_schema: {
                      name: "action_result",
                      strict: true,
                      schema: profile.outputContract,
                    },
                  },
                }
              : {}),
            stream: profile.stream,
          }),
        },
        deadline,
        profile.timeoutMs,
        profile,
      );
    let res = await send(!!profile.outputContract);
    // Some compatible endpoints support JSON by prompt but reject response_format.
    // Retry only an explicit format rejection, before any output was delivered.
    if (
      profile.outputContract &&
      [400, 422].includes(res.status) &&
      /response[_ ]format|json[_ ]schema|structured output/i.test(
        (await res.text()).slice(0, 4000),
      )
    )
      res = await send(false);
    if (!res.ok) throw httpError(res.status);
    const progress = new CompletionProgress(onText);
    if (
      !profile.stream ||
      !res.headers.get("content-type")?.includes("text/event-stream")
    ) {
      const data = await res.json();
      const result = contentText(data.choices?.[0]?.message?.content);
      progress.appendReasoning(chatReasoning(data.choices?.[0]?.message));
      if (!result)
        throw new ProviderError(
          "protocol",
          t("服务未返回文字结果，请检查模型是否兼容 Chat Completions"),
        );
      progress.appendText(result);
      if (
        ["length", "content_filter"].includes(data.choices?.[0]?.finish_reason)
      )
        throw new ProviderError(
          "incomplete",
          t("模型未返回完整结果，可重新生成。"),
        );
      return result;
    }
    if (!res.body) throw new ProviderError("protocol", t("服务没有返回响应体"));
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finished = false;
    const consume = (event: string) => {
      const data = event
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (!data) return;
      if (data === "[DONE]") {
        finished = true;
        return;
      }
      let chunk;
      try {
        chunk = JSON.parse(data);
      } catch {
        throw new ProviderError(
          "protocol",
          t("流式响应格式无效，可关闭流式后重试"),
        );
      }
      if (chunk.error)
        throw new ProviderError(
          "service",
          t("服务在生成中返回错误，请稍后重试"),
        );
      if (chunk.choices?.[0]?.finish_reason) finished = true;
      progress.appendReasoning(chatReasoning(chunk.choices?.[0]?.delta));
      const delta = contentText(chunk.choices?.[0]?.delta?.content);
      progress.appendText(delta);
      if (
        ["length", "content_filter"].includes(chunk.choices?.[0]?.finish_reason)
      )
        throw new ProviderError(
          "incomplete",
          t("模型未返回完整结果，可重新生成。"),
        );
    };
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer = (buffer + decoder.decode(value, { stream: true })).replace(
          /\r\n/g,
          "\n",
        );
        let split;
        while ((split = buffer.indexOf("\n\n")) >= 0) {
          consume(buffer.slice(0, split));
          buffer = buffer.slice(split + 2);
          if (finished) break;
        }
        if (finished) break;
        if (buffer.length > 1_000_000)
          throw new ProviderError("protocol", t("流式响应超出限制"));
      }
      buffer += decoder.decode();
      if (!finished && buffer.trim()) consume(buffer);
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
  } catch (e) {
    if (signal.aborted) throw new ProviderError("cancelled", t("请求已取消"));
    if (deadline.aborted)
      throw new ProviderError("timeout", t("请求超时，已保留部分结果"));
    if (e instanceof ProviderError) throw e;
    if (e instanceof SyntaxError)
      throw new ProviderError(
        "protocol",
        t("服务返回的数据格式无效，请检查接口兼容性"),
      );
    throw new ProviderError("network", t("连接中断，已保留部分结果；可重试"));
  }
}
export function actionMessages(
  action: Action,
  variables: Record<string, string>,
) {
  const expand = (value: string) => promptVariables(value, variables);
  const contract = action.outputSchema
    ? "\n\n## Structured Output Contract\nReturn exactly one JSON object matching this JSON Schema. Include all required keys. Use null when unknown. No Markdown fences or additional keys.\n" +
      JSON.stringify(jsonContract(action.outputSchema, expand))
    : "";
  return [
    { role: "system", content: expand(action.system) + contract },
    { role: "user", content: expand(action.prompt) },
  ];
}
export async function recognizeVision(
  profile: Connection<OcrProfile>,
  image: string,
  key: string | undefined,
  signal: AbortSignal,
  onText: (text: string) => void,
  run: typeof complete = complete,
) {
  if (
    !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image) ||
    image.length > 32_000_000
  )
    throw new ProviderError("image", t("图片格式不支持或超过 24 MB"));
  if (!profile.model.trim())
    throw new ProviderError("model", t("请填写具有图片输入能力的模型 ID"));
  if (profile.kind !== "openai")
    throw new ProviderError("capability", t("请选择 OpenAI 兼容的视觉服务"));
  return run(
    profile,
    [
      {
        role: "user",
        content: [
          { type: "text", text: profile.instruction },
          { type: "image_url", image_url: { url: image } },
        ],
      },
    ],
    key,
    signal,
    onText,
  );
}
export class JobGate {
  private jobs = new Map<string, AbortController>();
  begin(id: string) {
    if (this.jobs.has(id)) throw Error(t("任务 ID 已存在"));
    const c = new AbortController();
    this.jobs.set(id, c);
    return c;
  }
  cancel(id: string) {
    this.jobs.get(id)?.abort();
    this.jobs.delete(id);
  }
  active(id: string, c: AbortController) {
    return this.jobs.get(id) === c && !c.signal.aborted;
  }
  finish(id: string, c: AbortController) {
    if (this.jobs.get(id) === c) this.jobs.delete(id);
  }
  cancelAll() {
    for (const id of this.jobs.keys()) this.cancel(id);
  }
}
