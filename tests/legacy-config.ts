import { defaultConfig, OCR_INSTRUCTION } from "../src/shared/config";
export function legacyConfig(version = 2): any {
  const current = defaultConfig();
  const { providers, languageDetection, cache, noteSuggestion, ...rest } = current;
  return {
    ...rest,
    schemaVersion: version,
    textProfiles: providers.map(
      ({ description, enabled, preset, temperature, customModel, instruction, ...p }) => p,
    ),
    ocrProfiles: [
      {
        id: "ocr-offline",
        name: "本地文字识别",
        kind: "offline",
        endpoint: "http://localhost",
        model: "eng+chi_sim",
        requiresKey: false,
        timeoutMs: 120000,
        instruction: OCR_INSTRUCTION,
      },
    ],
  };
}
