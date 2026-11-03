import {
  PROVIDER_IDS,
  isTranslationOnly,
  type ProviderPreset,
} from "./provider-presets";
import type { TextProfile } from "./config";
import catalog from "./provider-catalog.json";
import {
  modelKind,
  inferredModelKind,
  imageCapabilities as capabilities,
} from "./model-capabilities";

// The list and ordering mirror the pinned Read Frog catalog. Capability metadata is
// independent: unknown means "test this endpoint", never a promise of vision support.
export type BuiltinModel = {
  id: string;
  vision?: boolean;
  kind?: "text" | "vision" | "speech";
};
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
        vision:
          capabilities[preset + ":" + id] ??
          (inferredModelKind({ preset, model: id }) === "vision"
            ? true
            : undefined),
        kind: inferredModelKind({ preset, model: id }),
      })),
    ];
  }),
) as unknown as Record<ProviderPreset, readonly BuiltinModel[]>;
// Desktop speech is additional to Read Frog's text catalog and shown in its own group.
BUILTIN_MODELS.openai = [...BUILTIN_MODELS.openai, ...SPEECH_MODELS];
// MiMo's official catalog supplements the pinned Read Frog text catalog.
BUILTIN_MODELS.mimo = [
  { id: "mimo-v2.6-flash", vision: true, kind: "vision" },
  { id: "mimo-v2.6-pro", vision: true, kind: "vision" },
  { id: "mimo-v2.5-tts", vision: false, kind: "speech" },
  { id: "mimo-v2-tts", vision: false, kind: "speech" },
];
export function defaultProviderModel(preset: ProviderPreset) {
  if (preset === "mimo")
    return { model: "mimo-v2.6-flash", customModel: false };
  const item = catalog.providers[preset as keyof typeof catalog.providers];
  if (!item) return { model: "", customModel: true };
  return { model: item.defaultModel, customModel: item.customModel };
}
export function supportsImages(p: TextProfile) {
  if (
    isTranslationOnly(p) ||
    p.preset === "replicate" ||
    p.preset === "perplexity" ||
    modelKind(p) === "speech" ||
    p.modelKind === "text"
  )
    return false;
  if (p.modelKind === "vision") return Boolean(p.model.trim());
  const known =
    BUILTIN_MODELS[p.preset].find((m) => m.id === p.model)?.vision ??
    capabilities[p.preset + ":" + p.model];
  return Boolean(p.model.trim()) && known !== false;
}
