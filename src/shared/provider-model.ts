import type { TextProfile } from "./config";
import { BUILTIN_MODELS, defaultProviderModel } from "./model-catalog";
import { isCustomProvider } from "./provider-presets";

// The active model remains a single ID. Remember the list choice while editing a custom ID.
export function chooseProviderModel(
  provider: TextProfile,
  model: string,
  custom: boolean,
): TextProfile {
  const builtin = BUILTIN_MODELS[provider.preset].some((m) => m.id === model);
  const customModel = isCustomProvider(provider.preset) || custom || !builtin;
  return {
    ...provider,
    model,
    customModel,
    builtinModel: customModel
      ? provider.builtinModel ||
        (!provider.customModel &&
        BUILTIN_MODELS[provider.preset].some((m) => m.id === provider.model)
          ? provider.model
          : defaultProviderModel(provider.preset).model)
      : model,
  };
}
export function toggleCustomModel(
  provider: TextProfile,
  custom: boolean,
): TextProfile {
  if (isCustomProvider(provider.preset) || custom)
    return chooseProviderModel(provider, provider.model, true);
  const candidates = BUILTIN_MODELS[provider.preset];
  const model =
    [provider.builtinModel, provider.model].find((id) =>
      candidates.some((m) => m.id === id),
    ) ?? defaultProviderModel(provider.preset).model;
  return chooseProviderModel(provider, model, false);
}
