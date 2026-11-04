import type { TextProfile } from "./config";
import { defaultProviderModel } from "./model-catalog";
import { withCatalogMatch, bundledDirectory } from "./model-capabilities";

// The active model remains a single ID. Remember the list choice while editing a custom ID.
export function chooseProviderModel(
  provider: TextProfile,
  model: string,
  custom: boolean,
  directory = bundledDirectory,
): TextProfile {
  const customModel = custom;
  return withCatalogMatch(
    {
      ...provider,
      model,
      customModel,
      ...(model !== provider.model
        ? {
            modelKind: undefined,
            catalogMatch: undefined,
            speechProtocol: undefined,
          }
        : {}),
      builtinModel: customModel
        ? provider.builtinModel ||
          (!provider.customModel && provider.model
            ? provider.model
            : defaultProviderModel(provider.preset).model)
        : model,
    },
    directory,
  );
}
export function toggleCustomModel(
  provider: TextProfile,
  custom: boolean,
  directory = bundledDirectory,
): TextProfile {
  if (custom)
    return chooseProviderModel(provider, provider.model, true, directory);
  const model =
    provider.builtinModel ||
    (!provider.customModel && provider.model) ||
    defaultProviderModel(provider.preset).model;
  return chooseProviderModel(provider, model, false, directory);
}
