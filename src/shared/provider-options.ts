import { z } from "zod";
import { t } from "./i18n";

export const ProviderOptionsSchema = z
  .record(z.string(), z.json())
  .refine(
    (options) => JSON.stringify(options).length <= 16000,
    "提供商选项最多可包含 16000 个字符。",
  );
export type ProviderOptions = z.infer<typeof ProviderOptionsSchema>;

export function parseProviderOptions(
  text: string,
): ProviderOptions | undefined {
  if (!text.trim()) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw Error(t("请输入有效的 JSON 对象。"));
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error(t("请输入有效的 JSON 对象。"));
  const parsed = ProviderOptionsSchema.safeParse(value);
  if (!parsed.success) throw Error(t("提供商选项最多可包含 16000 个字符。"));
  return parsed.data;
}

// Accept the names from the provider documentation as well as native wire keys.
const chatOptionNames = {
  reasoningEffort: "reasoning_effort",
  textVerbosity: "verbosity",
  maxCompletionTokens: "max_completion_tokens",
  logitBias: "logit_bias",
  parallelToolCalls: "parallel_tool_calls",
  serviceTier: "service_tier",
  promptCacheKey: "prompt_cache_key",
  promptCacheOptions: "prompt_cache_options",
  promptCacheRetention: "prompt_cache_retention",
  safetyIdentifier: "safety_identifier",
};

export function chatRequestOptions(
  options: ProviderOptions = {},
): ProviderOptions {
  const fields = { ...options };
  for (const key of ["model", "messages", "stream", "response_format"])
    delete fields[key];
  for (const [key, wireKey] of Object.entries(chatOptionNames)) {
    if (!Object.hasOwn(options, key)) continue;
    fields[wireKey] = options[key];
    delete fields[key];
  }
  return fields;
}
