import { t, actionLabel } from "./i18n";
import type { Action, Config, TextProfile } from "./config";
import { OFFLINE_OCR_ID } from "./config";
import { BUILTIN_MODELS } from "./model-catalog";
import { supportsImages } from "./model-catalog";
import { isTranslationOnly, supportsSpeech } from "./provider-presets";
import {
  bundledDirectory,
  modelKind,
  type ModelKind,
} from "./model-capabilities";
export { BUILTIN_MODELS, supportsImages } from "./model-catalog";

export type ModelRef = { providerId: string; model: string };
export type ModelInfo = {
  id: string;
  vision?: boolean;
  kind?: ModelKind;
  source: "builtin" | "remote" | "saved";
};
export const catalogKey = (
  provider: Pick<TextProfile, "id" | "endpoint" | "proxy"> &
    Partial<Pick<TextProfile, "preset" | "providerSettings">>,
) =>
  JSON.stringify([
    provider.id,
    provider.endpoint,
    provider.preset,
    provider.providerSettings,
    provider.proxy.mode,
    provider.proxy.mode === "custom" ? provider.proxy.address.trim() : "",
  ]);
export function modelOptions(
  config: Config,
  providerId: string,
  remote?: readonly string[],
  directory = bundledDirectory,
): ModelInfo[] {
  const p = config.providers.find((p) => p.id === providerId);
  if (!p) return [];
  const info = (id: string, source: ModelInfo["source"]): ModelInfo => {
    const kind = modelKind(
      id === p.model ? p : { preset: p.preset, model: id },
      directory,
    );
    return { id, kind, vision: kind === "vision", source };
  };
  if (remote !== undefined)
    return [...new Set(remote)].map((id) => info(id, "remote"));
  const entries = BUILTIN_MODELS[p.preset].map((m) => info(m.id, "builtin"));
  if (p.model && !entries.some((m) => m.id === p.model))
    entries.push(info(p.model, "saved"));
  return entries;
}
export function defaultModel(config: Config): ModelRef {
  const p = config.providers.find(
    (p) => p.id === config.defaults.textProfileId,
  )!;
  return { providerId: p.id, model: p.model };
}
export function actionModel(
  config: Config,
  action: Action,
  override?: { providerId?: string },
): ModelRef {
  const providerId =
    override?.providerId ?? action.providerId ?? config.defaults.textProfileId;
  return {
    providerId,
    model: config.providers.find((p) => p.id === providerId)?.model ?? "",
  };
}
export type ModelPurpose = {
  id: string;
  name: string;
  providerId: string | null;
};
export function suggestionAction(config: Config) {
  return (
    config.actions.find(
      (a) => a.id === (config.noteSuggestion.actionId ?? "dictionary"),
    ) ?? config.actions.find((a) => a.id !== "translate")
  );
}
export function modelPurposes(config: Config): ModelPurpose[] {
  return [
    {
      id: "default",
      name: t("默认提供商"),
      providerId: config.defaults.textProfileId,
    },
    ...config.actions.map((a) => ({
      id: "action:" + a.id,
      name: actionLabel(a),
      providerId: a.providerId,
    })),
    {
      id: "noteSuggestion",
      name: t("猜你想存"),
      providerId: config.noteSuggestion.providerId,
    },
    {
      id: "tts",
      name: t("在线朗读"),
      providerId: config.tts.onlineProviderId,
    },
    {
      id: "ocr",
      name: t("截图识别（OCR）"),
      providerId:
        config.defaults.ocrProfileId === OFFLINE_OCR_ID
          ? null
          : config.defaults.ocrProfileId,
    },
    {
      id: "languageDetection",
      name: t("语言检测"),
      providerId:
        config.languageDetection.mode === "llm"
          ? config.languageDetection.providerId
          : null,
    },
  ];
}
export function assignProvider(
  config: Config,
  purpose: string,
  providerId: string | null,
): Config {
  if (providerId) {
    const provider = config.providers.find((p) => p.id === providerId);
    if (!provider || !providerCanServe(provider, purpose)) return config;
  }
  if (purpose === "tts")
    return { ...config, tts: { ...config.tts, onlineProviderId: providerId } };
  if (purpose === "noteSuggestion")
    return {
      ...config,
      noteSuggestion: { ...config.noteSuggestion, providerId },
    };
  if (purpose === "default")
    return providerId
      ? {
          ...config,
          defaults: { ...config.defaults, textProfileId: providerId },
        }
      : config;
  if (purpose === "ocr")
    return {
      ...config,
      defaults: {
        ...config.defaults,
        ocrProfileId: providerId ?? OFFLINE_OCR_ID,
      },
    };
  if (purpose === "languageDetection")
    return {
      ...config,
      languageDetection: providerId
        ? { mode: "llm", providerId }
        : { mode: "basic" },
    };
  return {
    ...config,
    actions: config.actions.map((a) =>
      purpose === "action:" + a.id ? { ...a, providerId } : a,
    ),
  };
}
export function providerCanServe(provider: TextProfile, purpose: string) {
  if (purpose === "tts") return supportsSpeech(provider);
  if (modelKind(provider) === "speech") return false;
  if (purpose === "action:translate") return true;
  if (isTranslationOnly(provider)) return false;
  if (purpose === "ocr") return supportsImages(provider);
  return true;
}

export function updateProviderModel(
  config: Config,
  updated: TextProfile,
): Config {
  let next = {
    ...config,
    providers: config.providers.map((p) => (p.id === updated.id ? updated : p)),
  };
  for (const purpose of modelPurposes(config)) {
    if (
      purpose.providerId !== updated.id ||
      providerCanServe(updated, purpose.id)
    )
      continue;
    if (purpose.id === "default") {
      const fallback = next.providers.find(
        (p) =>
          p.id !== updated.id && p.enabled && providerCanServe(p, "default"),
      );
      if (fallback) next = assignProvider(next, purpose.id, fallback.id);
    } else next = assignProvider(next, purpose.id, null);
  }
  return next;
}
