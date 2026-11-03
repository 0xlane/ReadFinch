export const PROVIDER_IDS = [
  "openai",
  "deepseek",
  "gemini",
  "anthropic",
  "xai",
  "azure",
  "bedrock",
  "groq",
  "deepinfra",
  "mistral",
  "togetherai",
  "cohere",
  "fireworks",
  "cerebras",
  "replicate",
  "perplexity",
  "ollama",
  "qwen",
  "moonshotai",
  "huggingface",
  "custom",
  "open-responses",
  "jalapenocloud",
  "atlascloud",
  "openrouter",
  "minimax",
  "siliconflow",
  "tensdaq",
  "volcengine",
  "deeplx",
  "deepl",
  "google-translate",
  "microsoft-translate",
] as const;
export type ProviderPreset = (typeof PROVIDER_IDS)[number];
export type ProviderProtocol =
  | "chat"
  | "responses"
  | "anthropic"
  | "gemini"
  | "azure"
  | "bedrock"
  | "cohere"
  | "replicate"
  | "ollama"
  | "deepl"
  | "deeplx"
  | "google-translate"
  | "microsoft-translate";
export type ProviderDefinition = {
  id: ProviderPreset;
  name: string;
  endpoint: string;
  protocol: ProviderProtocol;
  group: "llm" | "compatible" | "translation";
  description: string;
  hint: string;
  requiresKey: boolean;
};
const definitions: Record<ProviderPreset, Omit<ProviderDefinition, "id">> = {
  openai: {
    name: "OpenAI",
    endpoint: "https://api.openai.com/v1",
    protocol: "chat",
    group: "llm",
    description: "OpenAI 模型",
    hint: "填写服务商 API Key；默认模型可直接使用，也可选择或输入自定义模型 ID。",
    requiresKey: true,
  },
  deepseek: {
    name: "DeepSeek",
    endpoint: "https://api.deepseek.com",
    protocol: "chat",
    group: "llm",
    description: "DeepSeek 模型",
    hint: "填写服务商 API Key；默认模型可直接使用，也可选择或输入自定义模型 ID。",
    requiresKey: true,
  },
  gemini: {
    name: "Gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta",
    protocol: "gemini",
    group: "llm",
    description: "Gemini 模型",
    hint: "填写服务商 API Key，使用对应的原生 API 地址和模型 ID。",
    requiresKey: true,
  },
  anthropic: {
    name: "Anthropic",
    endpoint: "https://api.anthropic.com/v1",
    protocol: "anthropic",
    group: "llm",
    description: "Anthropic 模型",
    hint: "填写服务商 API Key，使用对应的原生 API 地址和模型 ID。",
    requiresKey: true,
  },
  xai: {
    name: "Grok",
    endpoint: "https://api.x.ai/v1",
    protocol: "chat",
    group: "llm",
    description: "Grok 模型",
    hint: "填写服务商 API Key；默认模型可直接使用，也可选择或输入自定义模型 ID。",
    requiresKey: true,
  },
  azure: {
    name: "Azure",
    endpoint: "https://your-resource.openai.azure.com/openai/v1",
    protocol: "azure",
    group: "llm",
    description: "Azure 模型",
    hint: "填写 Azure 资源名称和部署 ID，可选择 Responses 或 Chat Completions。",
    requiresKey: true,
  },
  bedrock: {
    name: "Amazon Bedrock",
    endpoint: "https://bedrock-runtime.us-east-1.amazonaws.com",
    protocol: "bedrock",
    group: "llm",
    description: "Amazon Bedrock 模型",
    hint: "填写 Bedrock API Key 和区域，支持区域内可访问的模型与推理配置 ID。",
    requiresKey: true,
  },
  groq: {
    name: "Groq",
    endpoint: "https://api.groq.com/openai/v1",
    protocol: "chat",
    group: "llm",
    description: "Groq 模型",
    hint: "填写服务商 API Key；默认模型可直接使用，也可选择或输入自定义模型 ID。",
    requiresKey: true,
  },
  deepinfra: {
    name: "DeepInfra",
    endpoint: "https://api.deepinfra.com/v1/openai",
    protocol: "chat",
    group: "llm",
    description: "DeepInfra 模型",
    hint: "填写服务商 API Key；默认模型可直接使用，也可选择或输入自定义模型 ID。",
    requiresKey: true,
  },
  mistral: {
    name: "Mistral AI",
    endpoint: "https://api.mistral.ai/v1",
    protocol: "chat",
    group: "llm",
    description: "Mistral AI 模型",
    hint: "填写服务商 API Key；默认模型可直接使用，也可选择或输入自定义模型 ID。",
    requiresKey: true,
  },
  togetherai: {
    name: "Together.ai",
    endpoint: "https://api.together.xyz/v1",
    protocol: "chat",
    group: "llm",
    description: "Together.ai 模型",
    hint: "填写服务商 API Key；默认模型可直接使用，也可选择或输入自定义模型 ID。",
    requiresKey: true,
  },
  cohere: {
    name: "Cohere",
    endpoint: "https://api.cohere.com/v2",
    protocol: "cohere",
    group: "llm",
    description: "Cohere 模型",
    hint: "填写服务商 API Key，使用对应的原生 API 地址和模型 ID。",
    requiresKey: true,
  },
  fireworks: {
    name: "Fireworks AI",
    endpoint: "https://api.fireworks.ai/inference/v1",
    protocol: "chat",
    group: "llm",
    description: "Fireworks AI 模型",
    hint: "填写服务商 API Key；默认模型可直接使用，也可选择或输入自定义模型 ID。",
    requiresKey: true,
  },
  cerebras: {
    name: "Cerebras",
    endpoint: "https://api.cerebras.ai/v1",
    protocol: "chat",
    group: "llm",
    description: "Cerebras 模型",
    hint: "填写服务商 API Key；默认模型可直接使用，也可选择或输入自定义模型 ID。",
    requiresKey: true,
  },
  replicate: {
    name: "Replicate",
    endpoint: "https://api.replicate.com/v1",
    protocol: "replicate",
    group: "llm",
    description: "Replicate 模型",
    hint: "填写 Replicate API Token，模型使用 owner/name 或 owner/name:version。",
    requiresKey: true,
  },
  perplexity: {
    name: "Perplexity",
    endpoint: "https://api.perplexity.ai",
    protocol: "chat",
    group: "llm",
    description: "Perplexity 模型",
    hint: "填写服务商 API Key；默认模型可直接使用，也可选择或输入自定义模型 ID。",
    requiresKey: true,
  },
  ollama: {
    name: "Ollama",
    endpoint: "http://127.0.0.1:11434/api",
    protocol: "ollama",
    group: "llm",
    description: "Ollama 模型",
    hint: "连接已有服务，默认地址为本机 11434 端口；模型需已在服务端准备好。",
    requiresKey: false,
  },
  qwen: {
    name: "阿里云百炼",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    protocol: "chat",
    group: "llm",
    description: "阿里云百炼 模型",
    hint: "预置中国内地地址；其他地域或业务空间专属地址请按控制台修改，Key 与地址须属于同一地域。",
    requiresKey: true,
  },
  moonshotai: {
    name: "Moonshot AI",
    endpoint: "https://api.moonshot.ai/v1",
    protocol: "chat",
    group: "llm",
    description: "Moonshot AI 模型",
    hint: "填写服务商 API Key；默认模型可直接使用，也可选择或输入自定义模型 ID。",
    requiresKey: true,
  },
  huggingface: {
    name: "Hugging Face",
    endpoint: "https://router.huggingface.co/v1",
    protocol: "chat",
    group: "llm",
    description: "Hugging Face 模型",
    hint: "填写服务商 API Key；默认模型可直接使用，也可选择或输入自定义模型 ID。",
    requiresKey: true,
  },
  custom: {
    name: "自定义 Chat Complete",
    endpoint: "https://api.example.com/v1",
    protocol: "chat",
    group: "compatible",
    description: "自定义 Chat Complete 模型",
    hint: "填写自己的 API 地址与模型 ID；需要身份验证时添加 API Key。",
    requiresKey: true,
  },
  "open-responses": {
    name: "自定义 Responses",
    endpoint: "https://api.example.com/v1/responses",
    protocol: "responses",
    group: "compatible",
    description: "自定义 Responses 模型",
    hint: "填写完整 Responses 接口地址，通常以 /responses 结尾。",
    requiresKey: true,
  },
  jalapenocloud: {
    name: "Jalapeno Cloud",
    endpoint: "https://api.jalapeno-cloud.ai/v1",
    protocol: "chat",
    group: "compatible",
    description: "Jalapeno Cloud 模型",
    hint: "填写服务商 API Key；默认模型可直接使用，也可选择或输入自定义模型 ID。",
    requiresKey: true,
  },
  atlascloud: {
    name: "Atlas Cloud",
    endpoint: "https://api.atlascloud.ai/v1",
    protocol: "chat",
    group: "compatible",
    description: "Atlas Cloud 模型",
    hint: "填写服务商 API Key；默认模型可直接使用，也可选择或输入自定义模型 ID。",
    requiresKey: true,
  },
  openrouter: {
    name: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1",
    protocol: "chat",
    group: "compatible",
    description: "OpenRouter 模型",
    hint: "填写服务商 API Key；默认模型可直接使用，也可选择或输入自定义模型 ID。",
    requiresKey: true,
  },
  minimax: {
    name: "MiniMax",
    endpoint: "https://api.minimax.io/v1",
    protocol: "chat",
    group: "compatible",
    description: "MiniMax 模型",
    hint: "填写服务商 API Key；默认模型可直接使用，也可选择或输入自定义模型 ID。",
    requiresKey: true,
  },
  siliconflow: {
    name: "硅基流动",
    endpoint: "https://api.siliconflow.cn/v1",
    protocol: "chat",
    group: "compatible",
    description: "硅基流动 模型",
    hint: "填写服务商 API Key；默认模型可直接使用，也可选择或输入自定义模型 ID。",
    requiresKey: true,
  },
  tensdaq: {
    name: "Tensdaq",
    endpoint: "https://tensdaq-api.x-aio.com/v1",
    protocol: "chat",
    group: "compatible",
    description: "Tensdaq 模型",
    hint: "填写服务商 API Key；默认模型可直接使用，也可选择或输入自定义模型 ID。",
    requiresKey: true,
  },
  volcengine: {
    name: "Volcengine",
    endpoint: "https://ark.cn-beijing.volces.com/api/v3",
    protocol: "chat",
    group: "compatible",
    description: "Volcengine 模型",
    hint: "填写服务商 API Key；默认模型可直接使用，也可选择或输入自定义模型 ID。",
    requiresKey: true,
  },
  deeplx: {
    name: "DeepLX",
    endpoint: "https://api.deeplx.org/{{apiKey}}/translate",
    protocol: "deeplx",
    group: "translation",
    description: "专注于文字翻译",
    hint: "填写完整翻译接口地址。{{apiKey}} 会在请求时替换为单独保存的密钥。",
    requiresKey: true,
  },
  deepl: {
    name: "DeepL",
    endpoint: "https://api.deepl.com",
    protocol: "deepl",
    group: "translation",
    description: "专注于文字翻译",
    hint: "填写 DeepL API Key。官方地址会根据 :fx 密钥自动选择免费 API。",
    requiresKey: true,
  },
  "google-translate": {
    name: "Google 翻译",
    endpoint: "https://translate.googleapis.com/translate_a/single",
    protocol: "google-translate",
    group: "translation",
    description: "专注于文字翻译",
    hint: "无需 API Key，仅支持翻译。服务可用性取决于网络与服务限制。",
    requiresKey: false,
  },
  "microsoft-translate": {
    name: "Microsoft 翻译",
    endpoint: "https://edge.microsoft.com/translate/translatetext",
    protocol: "microsoft-translate",
    group: "translation",
    description: "专注于文字翻译",
    hint: "无需 API Key，仅支持翻译。服务可用性取决于网络与服务限制。",
    requiresKey: false,
  },
};
export const PROVIDER_PRESETS = PROVIDER_IDS.map((id): ProviderDefinition => ({
  id,
  ...definitions[id],
}));
export function providerPreset(id: string): ProviderDefinition {
  return (
    PROVIDER_PRESETS.find((item) => item.id === id) ??
    PROVIDER_PRESETS.find((item) => item.id === "custom")!
  );
}
export function isTranslationOnly(provider: { preset: string }) {
  return providerPreset(provider.preset).group === "translation";
}
export function isCustomProvider(preset: string) {
  return preset === "custom" || preset === "open-responses";
}
export function providerProtocol(provider: {
  preset: string;
  endpoint: string;
}): ProviderProtocol {
  // Google's documented OpenAI-compatible endpoint remains a valid connection option.
  if (provider.preset === "gemini" && /\/openai\/?$/.test(provider.endpoint))
    return "chat";
  return providerPreset(provider.preset).protocol;
}
export function supportsSpeech(provider: { preset: string; endpoint: string }) {
  return providerProtocol(provider) === "chat" || provider.preset === "azure";
}
export function canDiscoverModels(provider: { preset: string }) {
  return (
    !isTranslationOnly(provider) &&
    !["azure", "bedrock", "perplexity"].includes(provider.preset)
  );
}
