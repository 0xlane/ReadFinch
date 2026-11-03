import type { TextProfile } from "./config";
import { defaultProviderModel } from "./model-catalog";

// The active model remains a single ID. Remember the list choice while editing a custom ID.
export function chooseProviderModel(
  provider: TextProfile,
  model: string,
  custom: boolean,
): TextProfile {
  const customModel = custom;
  return {
    ...provider,
    model,
    customModel,
    ...(model !== provider.model && !custom
      ? { modelKind: undefined, speechProtocol: undefined }
      : {}),
    builtinModel: customModel
      ? provider.builtinModel ||
        (!provider.customModel && provider.model
          ? provider.model
          : defaultProviderModel(provider.preset).model)
      : model,
  };
}
export function toggleCustomModel(
  provider: TextProfile,
  custom: boolean,
): TextProfile {
  if (custom) return chooseProviderModel(provider, provider.model, true);
  const model =
    provider.builtinModel ||
    (!provider.customModel && provider.model) ||
    defaultProviderModel(provider.preset).model;
  return chooseProviderModel(provider, model, false);
}
