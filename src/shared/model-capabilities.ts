import bundled from "./model-directory.json";
import {
  ModelDirectory,
  type DirectoryData,
  type ModelKind,
} from "./model-directory";
export type { ModelKind } from "./model-directory";
export const bundledDirectoryData = bundled as DirectoryData;
export const bundledDirectory = new ModelDirectory({
  ...bundledDirectoryData,
  bundledSources: ["modelsDev", "openRouter"],
});
export type SpeechProtocol = "openai" | "mimo" | "azure";
export type ModelCapabilities = {
  preset: string;
  model: string;
  endpoint?: string;
  modelKind?: ModelKind;
  catalogMatch?: { id: string; kind: ModelKind };
  speechProtocol?: Exclude<SpeechProtocol, "azure">;
};

// Exact official IDs not covered by the general-purpose directories.
const supplemental = new ModelDirectory({
  modelsDev: [
    ...[
      "gpt-4o-mini-tts",
      "gpt-4o-mini-tts-2025-03-20",
      "gpt-4o-mini-tts-2025-12-15",
      "tts-1",
      "tts-1-hd",
      "tts-1-1106",
      "tts-1-hd-1106",
    ].map((name) => ({ id: "openai/" + name, name, kind: "speech" as const })),
    ...[
      "mimo-v2-tts",
      "mimo-v2.5-tts",
      "mimo-v2.5-tts-voicedesign",
      "mimo-v2.5-tts-voiceclone",
    ].map((name) => ({ id: "xiaomi/" + name, name, kind: "speech" as const })),
    { id: "deepseek/deepseek-flash", name: "DeepSeek Flash", kind: "vision" },
    {
      id: "Qwen/Qwen2.5-VL-72B-Instruct",
      name: "Qwen2.5 VL 72B Instruct",
      kind: "vision",
    },
  ],
  openRouter: [],
});

export function speechModelName(p: ModelCapabilities) {
  return supplemental.lookup(p.preset, p.model)?.name ?? p.model;
}
export function isLegacyOpenAiSpeech(p: ModelCapabilities) {
  return /^tts-1(?:-hd)?(?:-1106)?$/.test(speechModelName(p));
}

export function inferredModelKind(
  p: ModelCapabilities,
  directory?: ModelDirectory,
): ModelKind {
  const match = directory?.match(p.preset, p.model);
  if (match === null) return "text";
  if (match && directory && !directory.isBundled(match)) return match.kind;
  return (
    (p.catalogMatch?.id === p.model ? p.catalogMatch.kind : undefined) ??
    match?.kind ??
    bundledDirectory.lookup(p.preset, p.model)?.kind ??
    supplemental.lookup(p.preset, p.model)?.kind ??
    "text"
  );
}
export function modelKind(
  p: ModelCapabilities,
  directory?: ModelDirectory,
): ModelKind {
  return p.modelKind ?? inferredModelKind(p, directory);
}
export function withCatalogMatch<T extends ModelCapabilities>(
  p: T,
  directory: ModelDirectory,
): T {
  const hit = directory.match(p.preset, p.model);
  if (hit && directory.isBundled(hit)) return p;
  const kind = hit === null ? "text" : hit?.kind;
  // Retain a saved exact match when a source is unavailable. Never transfer it to another ID.
  if (
    !kind ||
    (p.catalogMatch?.id === p.model && p.catalogMatch.kind === kind) ||
    (!p.catalogMatch && inferredModelKind(p) === kind)
  )
    return p;
  return { ...p, catalogMatch: { id: p.model, kind } };
}
export function speechProtocol(p: ModelCapabilities): SpeechProtocol {
  if (p.speechProtocol) return p.speechProtocol;
  if (p.preset === "azure") return "azure";
  if (
    p.preset === "mimo" ||
    supplemental.lookup(p.preset, p.model)?.id.startsWith("xiaomi/")
  )
    return "mimo";
  try {
    if (new URL(p.endpoint ?? "").hostname.endsWith(".xiaomimimo.com"))
      return "mimo";
  } catch {
    /* An endpoint being edited need not be a complete URL yet. */
  }
  return "openai";
}
