import type { TextProfile } from "../shared/config";
import {
  providerProtocol,
  canDiscoverModels,
} from "../shared/provider-presets";
import {
  request,
  responseJson,
  providerAuth,
  endpointUrl,
  ProviderError,
  type Connection,
} from "./provider-http";
import { t } from "../shared/i18n";

export async function listModels(
  profile: Connection<TextProfile>,
  key: string | undefined,
  signal: AbortSignal,
): Promise<string[]> {
  if (!canDiscoverModels(profile))
    throw new ProviderError(
      "models",
      t("此提供商请使用内置列表或输入部署与模型 ID"),
    );
  const protocol = providerProtocol(profile),
    headers = providerAuth(profile, key);
  const deadline = AbortSignal.any([
    signal,
    AbortSignal.timeout(Math.min(profile.timeoutMs, 30000)),
  ]);
  let url =
    protocol === "responses"
      ? new URL("models", profile.endpoint).href
      : protocol === "ollama"
        ? endpointUrl(profile.endpoint, "tags")
        : protocol === "cohere"
          ? endpointUrl(profile.endpoint.replace(/\/v2\/?$/, "/v1"), "models")
          : endpointUrl(profile.endpoint, "models");
  const origin = new URL(url).origin;
  const ids = new Set<string>();
  for (let page = 0; page < 20; page++) {
    const data = await responseJson(
      await request(
        url,
        { method: "GET", headers },
        deadline,
        profile.timeoutMs,
        profile,
      ),
    ).catch((error) => {
      if (error instanceof ProviderError && error.code === "protocol")
        throw new ProviderError(
          "models",
          t("此接口不提供兼容的模型列表，请手动填写模型 ID"),
        );
      throw error;
    });
    const items =
      protocol === "gemini" || protocol === "ollama" || protocol === "cohere"
        ? data.models
        : protocol === "replicate"
          ? data.results
          : data.data;
    if (!Array.isArray(items))
      throw new ProviderError(
        "models",
        t("此接口不提供兼容的模型列表，请手动填写模型 ID"),
      );
    for (const item of items) {
      if (
        protocol === "gemini" &&
        Array.isArray(item.supportedGenerationMethods) &&
        !item.supportedGenerationMethods.includes("generateContent")
      )
        continue;
      const id =
        protocol === "gemini"
          ? item.name?.replace(/^models\//, "")
          : protocol === "ollama" || protocol === "cohere"
            ? item.name
            : protocol === "replicate" && item.owner && item.name
              ? item.owner + "/" + item.name
              : item.id;
      if (typeof id === "string" && id.length > 0 && id.length <= 200)
        ids.add(id);
      if (ids.size === 2000) return [...ids].sort();
    }
    let next: URL | undefined;
    if (
      protocol === "anthropic" &&
      data.has_more &&
      typeof data.last_id === "string"
    ) {
      next = new URL(url);
      next.searchParams.set("after_id", data.last_id);
    } else if (
      protocol === "gemini" &&
      typeof data.nextPageToken === "string" &&
      data.nextPageToken
    ) {
      next = new URL(url);
      next.searchParams.set("pageToken", data.nextPageToken);
    } else if (
      protocol === "cohere" &&
      typeof data.next_page_token === "string" &&
      data.next_page_token
    ) {
      next = new URL(url);
      next.searchParams.set("page_token", data.next_page_token);
    } else if (protocol === "replicate" && typeof data.next === "string")
      next = new URL(data.next, url);
    if (!next) break;
    if (next.origin !== origin || next.username || next.password)
      throw new ProviderError("models", t("模型列表包含不可信的分页地址"));
    if (next.href === url) break;
    url = next.href;
  }
  return [...ids].sort();
}
