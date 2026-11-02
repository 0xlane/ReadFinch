import type { ProviderPreset } from "./provider-presets";
import type { TextProfile } from "./config";
// Reviewed 2026-10-31 (text and vision) and 2026-11-03 (speech). Sources and review policy: docs/MODELS.md.
// This is a suggestion catalog, not an enum restricting custom model IDs.
export const BUILTIN_MODELS: Record<
  ProviderPreset,
  readonly { id: string; vision?: boolean }[]
> = {
  openai: [
    { id: "gpt-5.4-mini", vision: true },
    { id: "gpt-4.1-mini", vision: true },
    { id: "gpt-4o-mini", vision: true },
    { id: "gpt-4o-mini-tts", vision: false },
    { id: "tts-1", vision: false },
    { id: "tts-1-hd", vision: false },
  ],
  deepseek: [
    { id: "deepseek-flash", vision: true },
    { id: "deepseek-v4-pro", vision: false },
  ],
  qwen: [
    { id: "qwen3.7-plus", vision: true },
    { id: "qwen3.8-max", vision: true },
    { id: "qwen3.8-flash" },
  ],
  siliconflow: [
    { id: "Qwen/Qwen3.5-397B-A17B", vision: true },
    { id: "Qwen/Qwen2.5-VL-72B-Instruct", vision: true },
  ],
  gemini: [
    { id: "gemini-3.5-flash-lite", vision: true },
    { id: "gemini-3.8-flash", vision: true },
  ],
  openrouter: [
    { id: "openai/gpt-4.1-mini", vision: true },
    { id: "google/gemini-3.8-flash", vision: true },
    { id: "deepseek/deepseek-v4-pro", vision: false },
  ],
  custom: [],
};
export function supportsImages(p: TextProfile) {
  return (
    Boolean(p.model.trim()) &&
    BUILTIN_MODELS[p.preset].find((m) => m.id === p.model)?.vision !== false
  );
}
