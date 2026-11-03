import { z } from "zod";
import { speechProtocol, type ModelCapabilities } from "./model-capabilities";

export const OnlineVoiceIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[^\p{Cc}\p{Zl}\p{Zp}]+$/u);
const voiceId = z.string().trim().max(512);
const dial = z.number().int().min(-100).max(100);
export const SpeechConfigSchema = z.strictObject({
  onlineProviderId: z.string().min(1).max(100).nullable(),
  customVoices: z.array(OnlineVoiceIdSchema).max(48),
  defaultVoice: voiceId,
  languageVoices: z.record(
    z
      .string()
      .regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/)
      .max(48)
      .refine((tag) => {
        try {
          return new Intl.Locale(tag).baseName === tag;
        } catch {
          return false;
        }
      }),
    voiceId.min(1),
  ),
  rate: dial,
  pitch: dial,
  volume: dial,
});
export type SpeechConfig = z.infer<typeof SpeechConfigSchema>;
export const defaultSpeech = (): SpeechConfig => ({
  onlineProviderId: null,
  customVoices: [],
  defaultVoice: "",
  languageVoices: {},
  rate: 0,
  pitch: 0,
  volume: 0,
});
export type VoiceChoice = {
  id: string;
  name: string;
  lang: string;
  local: boolean;
  preferred?: boolean;
};
export const onlineVoiceNames = [
  "alloy",
  "ash",
  "ballad",
  "cedar",
  "coral",
  "echo",
  "fable",
  "marin",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
];
export function onlineVoices(
  settings: SpeechConfig,
  provider?: ModelCapabilities,
): VoiceChoice[] {
  const protocol = provider ? speechProtocol(provider) : "openai";
  const names =
    protocol === "mimo"
      ? /mimo-v2-tts(?:$|[-/])/.test(provider?.model ?? "")
        ? ["mimo_default", "default_zh", "default_en"]
        : [
            "mimo_default",
            "冰糖",
            "茉莉",
            "苏打",
            "白桦",
            "Mia",
            "Chloe",
            "Milo",
            "Dean",
          ]
      : /(?:^|\/)tts-1(?:-hd)?$/.test(provider?.model ?? "")
        ? [
            "alloy",
            "ash",
            "coral",
            "echo",
            "fable",
            "onyx",
            "nova",
            "sage",
            "shimmer",
          ]
        : onlineVoiceNames;
  return settings.onlineProviderId
    ? [...new Set([...names, ...settings.customVoices])].map((name) => ({
        id: "api:" + name,
        name,
        lang: "mul",
        local: false,
      }))
    : [];
}
export function onlineProsody({ rate, pitch, volume }: SpeechConfig) {
  const playbackRate = Math.pow(2, pitch / 100);
  return {
    playbackRate,
    speed: Math.max(0.25, Math.min(4, Math.pow(2, rate / 100) / playbackRate)),
    volume: (volume + 100) / 200,
  };
}
const names: Record<string, string> = {
  简体中文: "zh-CN",
  繁體中文: "zh-TW",
  繁体中文: "zh-TW",
  English: "en",
  日本語: "ja",
  한국어: "ko",
  Français: "fr",
  Deutsch: "de",
  Español: "es",
};
export function speechTag(language: string) {
  try {
    return new Intl.Locale(names[language] ?? language.replaceAll("_", "-"))
      .baseName;
  } catch {
    return "und";
  }
}
export function voiceForLanguage(
  voices: VoiceChoice[],
  settings: SpeechConfig,
  language: string,
) {
  const tag = speechTag(language);
  const locale = new Intl.Locale(tag);
  const base = locale.language;
  const languageKeys = [tag];
  if (base === "zh" && tag !== base)
    languageKeys.push("zh-" + locale.maximize().script);
  languageKeys.push(base);
  for (const key of languageKeys) {
    const chosen = voices.find((v) => v.id === settings.languageVoices[key]);
    if (chosen) return chosen;
  }
  const fallback = voices.find((v) => v.id === settings.defaultVoice);
  if (fallback) return fallback;
  const local = voices.filter((v) => v.local);
  return (
    local.find((v) => speechTag(v.lang) === tag) ??
    local.find(
      (v) =>
        base === "zh" &&
        new Intl.Locale(speechTag(v.lang)).maximize().script ===
          locale.maximize().script &&
        speechTag(v.lang).split("-")[0] === base,
    ) ??
    local.find((v) => speechTag(v.lang).split("-")[0] === base) ??
    local.find((v) => v.preferred) ??
    local[0]
  );
}
// The system API uses a multiplier for rate and pitch, and a bounded 0..1 gain for volume.
// A neutral gain leaves room for both halves of the volume control.
export function systemProsody({ rate, pitch, volume }: SpeechConfig) {
  return {
    rate: Math.max(0.1, 1 + rate / 100),
    pitch: 1 + pitch / 100,
    volume: (volume + 100) / 200,
  };
}
export function speechChunks(text: string, limit = 600) {
  const pieces: string[] = [];
  let remaining = text.trim();
  while (remaining.length > limit) {
    let boundary = remaining
      .slice(0, limit)
      .search(/[。！？.!?]\s*[^。！？.!?]*$/u);
    boundary =
      boundary >= limit / 3 ? boundary + 1 : remaining.lastIndexOf(" ", limit);
    if (boundary < limit / 3) boundary = limit;
    if (/[\uD800-\uDBFF]/.test(remaining[boundary - 1])) boundary--;
    pieces.push(remaining.slice(0, boundary));
    remaining = remaining.slice(boundary);
  }
  if (remaining) pieces.push(remaining);
  return pieces;
}
