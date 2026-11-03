import catalog from "./provider-catalog.json";

export const imageCapabilities: Record<string, boolean> = {
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

export type ModelKind = "text" | "vision" | "speech";
export type SpeechProtocol = "openai" | "mimo" | "azure";
export type ModelCapabilities = {
  preset: string;
  model: string;
  endpoint?: string;
  modelKind?: ModelKind;
  speechProtocol?: Exclude<SpeechProtocol, "azure">;
};

// Model lists often contain only IDs. Unknown capabilities stay unknown; a
// user-defined deployment can be classified explicitly in the provider editor.
export function inferredModelKind(
  p: Pick<ModelCapabilities, "preset" | "model">,
): ModelKind | undefined {
  const id = p.model.toLowerCase();
  if (/(?:^|[/._-])tts(?:$|[/._-])|(?:^|\/)kokoro(?:$|[-/])|cosyvoice/.test(id))
    return "speech";
  const images = imageCapabilities[p.preset + ":" + p.model];
  if (images !== undefined) return images ? "vision" : "text";
  if (/(?:^|[-/_])(?:asr|embedding|transcribe|realtime)(?:[-/_]|$)/.test(id))
    return undefined;
  if (
    /(?:^|\/)gpt-(?:4o(?!.*(?:audio|transcribe))|4\.1|5|6)|(?:^|\/)o[134](?:-|$)|(?:^|\/)claude-(?:3|sonnet|opus|haiku)|(?:^|\/)gemini-(?!.*(?:tts|embedding))|(?:^|\/)mimo-v2\.(?:5|6)(?:-|$)|(?:^|[/_-])(?:vl|vision)(?:$|[-/])/.test(
      id,
    )
  )
    return "vision";
  const entries = catalog.providers[p.preset as keyof typeof catalog.providers]
    ?.models as readonly string[] | undefined;
  return entries?.includes(p.model) ? "text" : undefined;
}

export function modelKind(p: ModelCapabilities): ModelKind | undefined {
  return p.modelKind ?? inferredModelKind(p);
}

export function speechProtocol(p: ModelCapabilities): SpeechProtocol {
  if (p.speechProtocol) return p.speechProtocol;
  if (p.preset === "azure") return "azure";
  if (p.preset === "mimo" || /(?:^|\/)mimo-.*tts/i.test(p.model)) return "mimo";
  try {
    if (new URL(p.endpoint ?? "").hostname.endsWith(".xiaomimimo.com"))
      return "mimo";
  } catch {
    /* An endpoint being edited need not be a complete URL yet. */
  }
  return "openai";
}
