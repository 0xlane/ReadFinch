import type { TextProfile } from "../shared/config";
import { t } from "../shared/i18n";
import languages from "../shared/target-languages.json";
import {
  request,
  responseJson,
  providerAuth,
  ProviderError,
  endpointUrl,
  type Connection,
  type TranslationInput,
} from "./provider-http";

function language(value: string, provider: string, target: boolean) {
  const normalized =
    languages.find((language) => language.name === value)?.code ?? value;
  if (provider === "deepl" || provider === "deeplx") {
    if (normalized === "auto") return provider === "deepl" ? undefined : "auto";
    if (/^zh(?:-CN|-Hans)?$/i.test(normalized))
      return target && provider === "deepl" ? "ZH-HANS" : "ZH";
    if (/^zh-(?:TW|Hant)$/i.test(normalized))
      return provider === "deepl" && !target ? "ZH" : "ZH-HANT";
    return normalized.toUpperCase();
  }
  if (provider === "microsoft-translate") {
    if (normalized === "auto") return "";
    if (/^zh(?:-CN|-Hans)?$/i.test(normalized)) return "zh-Hans";
    if (/^zh-(?:TW|Hant)$/i.test(normalized)) return "zh-Hant";
  }
  return normalized;
}
const escapeHtml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const decodeHtml = (text: string) =>
  text.replace(
    /&#(x[0-9a-f]+|\d+);|&(amp|lt|gt|quot|apos);/gi,
    (full, code, named) => {
      if (code) {
        const n =
          code[0].toLowerCase() === "x"
            ? parseInt(code.slice(1), 16)
            : Number(code);
        return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : full;
      }
      return (
        (
          { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<
            string,
            string
          >
        )[named.toLowerCase()] ?? full
      );
    },
  );
export async function translateText(
  profile: Connection<TextProfile>,
  input: TranslationInput,
  key: string | undefined,
  signal: AbortSignal,
  onText: (text: string) => void,
) {
  const deadline = AbortSignal.any([
    signal,
    AbortSignal.timeout(profile.timeoutMs),
  ]);
  const headers = providerAuth(profile, key);
  const source = language(input.sourceLanguage, profile.preset, false),
    target = language(input.targetLanguage, profile.preset, true);
  let url = profile.endpoint,
    init: RequestInit,
    parse: (value: any) => unknown;
  switch (profile.preset) {
    case "deepl": {
      if (new URL(url).hostname === "api.deepl.com" && key?.endsWith(":fx"))
        url = url.replace("api.deepl.com", "api-free.deepl.com");
      if (!/\/v2\/translate\/?$/.test(url))
        url = endpointUrl(url, "v2/translate");
      init = {
        method: "POST",
        headers,
        body: JSON.stringify({
          text: [input.text],
          source_lang: source,
          target_lang: target,
        }),
      };
      parse = (data) => data.translations?.[0]?.text;
      break;
    }
    case "deeplx":
      if (url.includes("{{apiKey}}") && !key)
        throw new ProviderError(
          "credential",
          t("此服务尚未配置 API Key，请在设置中添加"),
        );
      url = url.replaceAll("{{apiKey}}", encodeURIComponent(key ?? ""));
      init = {
        method: "POST",
        headers,
        body: JSON.stringify({
          text: input.text,
          source_lang: source,
          target_lang: target,
        }),
      };
      parse = (data) => data.data;
      break;
    case "google-translate": {
      const query = new URL(url);
      for (const [name, value] of Object.entries({
        client: "gtx",
        sl: source || "auto",
        tl: target || "en",
        dt: "t",
        q: input.text,
      }))
        query.searchParams.set(name, value);
      url = query.href;
      init = { method: "GET", headers };
      parse = (data) =>
        Array.isArray(data?.[0])
          ? data[0]
              .map((part: any) =>
                typeof part?.[0] === "string" ? part[0] : "",
              )
              .join("")
          : undefined;
      break;
    }
    case "microsoft-translate": {
      const query = new URL(url);
      query.searchParams.set("from", source || "");
      query.searchParams.set("to", target || "en");
      query.searchParams.set("isEnterpriseClient", "false");
      url = query.href;
      init = {
        method: "POST",
        headers,
        body: JSON.stringify([escapeHtml(input.text)]),
      };
      parse = (data) =>
        typeof data?.[0]?.translations?.[0]?.text === "string"
          ? decodeHtml(data[0].translations[0].text)
          : undefined;
      break;
    }
    default:
      throw new ProviderError("capability", t("纯翻译提供商只能用于翻译"));
  }
  try {
    const data = await responseJson(
      await request(url, init, deadline, profile.timeoutMs, profile),
    );
    const text = parse(data);
    if (typeof text !== "string" || !text.trim())
      throw new ProviderError("protocol", t("服务未返回有效的翻译结果"));
    deadline.throwIfAborted();
    onText(text);
    return text;
  } catch (error) {
    if (deadline.aborted)
      throw new ProviderError(
        signal.aborted ? "cancelled" : "timeout",
        signal.aborted ? t("请求已取消") : t("请求超时，已保留部分结果"),
      );
    throw error;
  }
}
