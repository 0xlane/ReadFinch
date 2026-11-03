import {
  PROVIDER_IDS,
  isTranslationOnly,
  type ProviderPreset,
} from "./provider-presets";
import type { TextProfile } from "./config";
import catalog from "./provider-catalog.json";

// The list and ordering mirror the pinned Read Frog catalog. Capability metadata is
// independent: unknown means "test this endpoint", never a promise of vision support.
const capabilities: Record<string, boolean> = {
  "openai:gpt-5.4-mini": true,
  "openai:gpt-4.1-mini": true,
  "openai:gpt-4o-mini": true,
  "deepseek:deepseek-flash": true,
  "deepseek:deepseek-v4-pro": false,
  "qwen:qwen3.7-plus": true,
  "qwen:qwen3.8-max": true,
  "siliconflow:Qwen/Qwen3.5-397B-A17B": true,
  "siliconflow:Qwen/Qwen2.5-VL-72B-Instruct": true,
  "gemini:gemini-3.5-flash-lite": true,
  "gemini:gemini-3.8-flash": true,
  "openrouter:openai/gpt-4.1-mini": true,
  "openrouter:google/gemini-3.8-flash": true,
  "openrouter:deepseek/deepseek-v4-pro": false,
};
export type BuiltinModel = { id: string; vision?: boolean; kind?: "speech" };
export const SPEECH_MODELS: readonly BuiltinModel[] = [
  { id: "gpt-4o-mini-tts", vision: false, kind: "speech" },
  { id: "tts-1", vision: false, kind: "speech" },
  { id: "tts-1-hd", vision: false, kind: "speech" },
];
export const BUILTIN_MODELS = Object.fromEntries(
  PROVIDER_IDS.map((preset) => {
    const p = catalog.providers[preset as keyof typeof catalog.providers];
    return [
      preset,
      (p?.models ?? []).map((id) => ({
        id,
        vision: capabilities[preset + ":" + id],
      })),
    ];
  }),
) as unknown as Record<ProviderPreset, readonly BuiltinModel[]>;
// Desktop speech is additional to Read Frog's text catalog and shown in its own group.
BUILTIN_MODELS.openai = [...BUILTIN_MODELS.openai, ...SPEECH_MODELS];
export function defaultProviderModel(preset: ProviderPreset) {
  const item = catalog.providers[preset as keyof typeof catalog.providers];
  if (!item) return { model: "", customModel: true };
  return { model: item.defaultModel, customModel: item.customModel };
}
export function supportsImages(p: TextProfile) {
  if (
    isTranslationOnly(p) ||
    p.preset === "replicate" ||
    p.preset === "perplexity"
  )
    return false;
  const known =
    BUILTIN_MODELS[p.preset].find((m) => m.id === p.model)?.vision ??
    capabilities[p.preset + ":" + p.model];
  return Boolean(p.model.trim()) && known !== false;
}
