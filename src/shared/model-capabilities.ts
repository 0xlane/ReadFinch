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
const localKinds = new Map<string, ModelKind>([
  ["gpt-4o-mini-tts", "speech"],
  ["gpt-4o-mini-tts-2025-03-20", "speech"],
  ["gpt-4o-mini-tts-2025-12-15", "speech"],
  ["tts-1", "speech"],
  ["tts-1-hd", "speech"],
  ["tts-1-1106", "speech"],
  ["tts-1-hd-1106", "speech"],
  ["mimo-v2-tts", "speech"],
  ["mimo-v2.5-tts", "speech"],
  ["mimo-v2.5-tts-voicedesign", "speech"],
  ["mimo-v2.5-tts-voiceclone", "speech"],
  ["deepseek-flash", "vision"],
  ["Qwen/Qwen2.5-VL-72B-Instruct", "vision"],
]);

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
    localKinds.get(p.model) ??
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
    [
      "mimo-v2-tts",
      "mimo-v2.5-tts",
      "mimo-v2.5-tts-voicedesign",
      "mimo-v2.5-tts-voiceclone",
    ].includes(p.model.replace(/^xiaomi\//, ""))
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
