import { t } from "../shared/i18n";
import type { TextProfile } from "../shared/config";
import { providerProtocol, requiresApiKey } from "../shared/provider-presets";
export type TranslationInput = {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
};
export type Connection<T> = T & {
  headers?: Record<string, string>;
  outputContract?: object;
  translation?: TranslationInput;
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
export function auth(
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

export function providerAuth(
  profile: Connection<TextProfile>,
  key: string | undefined,
) {
  const headers = new Headers({ "Content-Type": "application/json" });
  const protocol = providerProtocol(profile);
  const header =
    protocol === "anthropic"
      ? "x-api-key"
      : protocol === "gemini"
        ? "x-goog-api-key"
        : protocol === "azure"
          ? "api-key"
          : "Authorization";
  if (key)
    headers.set(
      header,
      header === "Authorization"
        ? (protocol === "deepl" ? "DeepL-Auth-Key " : "Bearer ") + key
        : key,
    );
  if (protocol === "anthropic") headers.set("anthropic-version", "2023-06-01");
  for (const [name, value] of Object.entries(profile.headers ?? {}))
    headers.set(name, value);
  if (
    requiresApiKey(profile) &&
    !key &&
    !["Authorization", "x-api-key", "api-key", "x-goog-api-key"].some((name) =>
      headers.has(name),
    )
  )
    throw new ProviderError(
      "credential",
      t("此服务尚未配置 API Key，请在设置中添加"),
    );
  return headers;
}
export async function responseJson(response: Response, limit = 2_000_000) {
  if (!response.ok) {
    await response.body?.cancel();
    throw httpError(response.status);
  }
  if (!response.body)
    throw new ProviderError("protocol", t("服务没有返回响应体"));
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new ProviderError("limit", t("响应超过大小限制"));
      chunks.push(value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new ProviderError(
        "protocol",
        t("服务返回的数据格式无效，请检查接口兼容性"),
      );
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
