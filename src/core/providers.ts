import { t } from "../shared/i18n";
import type { TextProfile, OcrProfile, Action } from "../shared/config";
import { promptVariables } from "../shared/config";
import { jsonContract } from "../shared/action-output";

type Connection<T> = T & {
  headers?: Record<string, string>;
  outputContract?: object;
};

export type ProviderTransport = (
  url: string,
  init: RequestInit,
  profile: Pick<TextProfile, "id" | "proxy">,
) => Promise<Response>;
let transport: ProviderTransport = (url, init, profile) => {
  if (profile.proxy?.mode === "custom")
    throw new ProviderError("proxy", t("自定义代理需要桌面应用的网络连接"));
  return fetch(url, init);
};
export function setProviderTransport(value: ProviderTransport) {
  transport = value;
}

export class ProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
export function httpError(status: number): ProviderError {
  const errors: Record<number, [string, string]> = {
    401: ["auth", t("凭据无效或已过期，请检查 API Key")],
    403: ["auth", t("服务拒绝访问，请检查权限或额度")],
    404: ["model", t("模型或接口不存在，请检查模型 ID 和服务地址")],
    429: ["rate", t("请求过于频繁或额度不足，请稍后重试")],
    400: [
      "capability",
      t("模型不支持此请求，请检查图片能力、模型 ID 或 API 协议"),
    ],
    413: ["image", t("图片过大，请缩小选区")],
  };
  const [code, message] = errors[status] ?? [
    "service",
    t("服务返回 HTTP {0}，请稍后重试", status),
  ];
  return new ProviderError(code, message);
}
export function endpointUrl(base: string, suffix: string) {
  return base.replace(/\/+$/, "") + "/" + suffix;
}
export async function listModels(
  profile: Connection<TextProfile>,
  key: string | undefined,
  signal: AbortSignal,
): Promise<string[]> {
  const res = await request(
    endpointUrl(profile.endpoint, "models"),
    { method: "GET", headers: auth(key, profile.requiresKey, profile.headers) },
    signal,
    Math.min(profile.timeoutMs, 30000),
    profile,
  );
  if (!res.ok) throw httpError(res.status);
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (!res.body)
    throw new ProviderError(
      "models",
      t("服务未返回模型列表，请手动填写模型 ID"),
    );
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > 2_000_000) {
      await res.body.cancel().catch(() => {});
      throw new ProviderError("models", t("模型列表过大，请手动填写模型 ID"));
    }
    chunks.push(chunk);
  }
  let body: any;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ProviderError("models", t("模型列表格式无效，请手动填写模型 ID"));
  }
  if (!Array.isArray(body.data))
    throw new ProviderError(
      "models",
      t("此接口不提供兼容的模型列表，请手动填写模型 ID"),
    );
  return [
    ...new Set<string>(
      body.data
        .filter(
          (p: any) =>
            typeof p?.id === "string" && p.id.length > 0 && p.id.length <= 200,
        )
        .slice(0, 2000)
        .map((p: any) => p.id),
    ),
  ].sort();
}
export async function request(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
  timeoutMs: number,
  profile: Pick<TextProfile, "id" | "proxy">,
) {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
  try {
    return await transport(
      url,
      {
        ...init,
        redirect: "error",
        signal: deadline,
      },
      profile,
    );
  } catch (e) {
    if (signal.aborted) throw new ProviderError("cancelled", t("请求已取消"));
    if (deadline.aborted || (e as Error).name === "TimeoutError")
      throw new ProviderError(
        "timeout",
        t("请求超时，请检查服务或增加超时时间"),
      );
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(
      "network",
      t("无法连接服务，请检查服务地址、代理设置和网络"),
    );
  }
}
function auth(
  key: string | undefined,
  required: boolean,
  custom?: Record<string, string>,
) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (key) headers.set("Authorization", "Bearer " + key);
  for (const [name, value] of Object.entries(custom ?? {}))
    headers.set(name, value);
  if (required && !key && !headers.has("Authorization"))
    throw new ProviderError(
      "credential",
      t("此服务尚未配置 API Key，请在设置中添加"),
    );
  return headers;
}
export async function synthesizeSpeech(
  profile: Connection<TextProfile>,
  key: string | undefined,
  text: string,
  voice: string,
  speed: number,
  signal: AbortSignal,
) {
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
  onText: (text: string) => void,
): Promise<string> {
  if (!profile.model.trim())
    throw new ProviderError("model", t("尚未填写模型 ID，请先配置文字服务"));
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
    let result = "";
    if (
      !profile.stream ||
      !res.headers.get("content-type")?.includes("text/event-stream")
    ) {
      const data = await res.json();
      result = contentText(data.choices?.[0]?.message?.content);
      if (!result)
        throw new ProviderError(
          "protocol",
          t("服务未返回文字结果，请检查模型是否兼容 Chat Completions"),
        );
      onText(result);
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
      const delta = contentText(chunk.choices?.[0]?.delta?.content);
      if (delta) {
        result += delta;
        if (result.length > 1_000_000)
          throw new ProviderError("limit", t("结果过长，已停止接收"));
        onText(result);
      }
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
    if (!result.trim())
      throw new ProviderError("empty", t("模型返回空结果，请检查输入和模型"));
    return result;
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
