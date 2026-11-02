export const PROVIDER_PRESETS = [
  {
    id: "openai",
    name: "OpenAI",
    endpoint: "https://api.openai.com/v1",
    description: "OpenAI 模型",
    hint: "填写 OpenAI API Key，获取模型或输入模型 ID。",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    endpoint: "https://api.deepseek.com",
    description: "DeepSeek 官方服务",
    hint: "使用 DeepSeek 开放平台的 API Key。",
  },
  {
    id: "qwen",
    name: "阿里云百炼",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    description: "通义千问 · Qwen",
    hint: "预置中国内地地址；其他地域或业务空间专属地址请按控制台修改，Key 与地址须属于同一地域。",
  },
  {
    id: "siliconflow",
    name: "硅基流动",
    endpoint: "https://api.siliconflow.cn/v1",
    description: "多种文字与视觉模型",
    hint: "使用硅基流动中国站地址；模型权限以你的账户为准。",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai",
    description: "Gemini 兼容接口",
    hint: "使用 Google AI Studio API Key 和 OpenAI 兼容地址。",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1",
    description: "聚合模型服务",
    hint: "模型 ID 需要包含提供商前缀；图片能力取决于所选模型。",
  },
  {
    id: "custom",
    name: "自定义 OpenAI 兼容",
    endpoint: "https://api.example.com/v1",
    description: "自己的服务或代理接口",
    hint: "填写 API 基础地址；文字使用 Chat Completions，OCR 还需要模型接受 image_url 图片输入。",
  },
] as const;
export type ProviderPreset = (typeof PROVIDER_PRESETS)[number]["id"];
export function providerPreset(id: string) {
  return (
    PROVIDER_PRESETS.find((item) => item.id === id) ?? PROVIDER_PRESETS.at(-1)!
  );
}
