import { useEffect, useSyncExternalStore } from "react";
import {
  onlineProsody,
  onlineVoices,
  speechChunks,
  speechTag,
  systemProsody,
  voiceForLanguage,
  type SpeechConfig,
  type VoiceChoice,
} from "../shared/tts";
import { t } from "../shared/i18n";

let voices: VoiceChoice[] = [];
const voiceListeners = new Set<() => void>();
const systemId = (v: SpeechSynthesisVoice) =>
  (v.localService ? "system:" : "browser:") +
  (v.voiceURI || v.name + "|" + v.lang);
function readVoices() {
  const list = (window.speechSynthesis?.getVoices() ?? []).map((v) => ({
    id: systemId(v),
    name: v.name,
    lang: v.lang,
    local: v.localService,
    preferred: v.default,
  }));
  if (JSON.stringify(list) === JSON.stringify(voices)) return;
  voices = list;
  voiceListeners.forEach((f) => f());
}
function subscribeVoices(listener: () => void) {
  voiceListeners.add(listener);
  if (voiceListeners.size === 1)
    window.speechSynthesis?.addEventListener("voiceschanged", readVoices);
  readVoices();
  return () => {
    voiceListeners.delete(listener);
    if (!voiceListeners.size)
      window.speechSynthesis?.removeEventListener("voiceschanged", readVoices);
  };
}
export function useVoices() {
  return useSyncExternalStore(subscribeVoices, () => voices);
}
let initialVoices: Promise<void> | undefined;
function readyVoices() {
  readVoices();
  if (voices.length || !window.speechSynthesis) return;
  return (initialVoices ??= new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      window.speechSynthesis.removeEventListener("voiceschanged", done);
      readVoices();
      resolve();
    };
    const timer = setTimeout(done, 1200);
    window.speechSynthesis.addEventListener("voiceschanged", done, {
      once: true,
    });
  }));
}

type State = {
  status: "idle" | "loading" | "playing" | "error";
  key: string;
  error: string;
};
let state: State = { status: "idle", key: "", error: "" };
const listeners = new Set<() => void>();
function changed(status: State["status"], key = "", error = "") {
  state = { status, key, error };
  listeners.forEach((f) => f());
}
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
};
export function useSpeechStatus() {
  return useSyncExternalStore(subscribe, () => state);
}
type Playback = { id: string; key: string; release?: () => void };
let active: Playback | undefined;
function finish(job: Playback, error = "") {
  if (job !== active) return;
  active = undefined;
  job.release?.();
  changed(error ? "error" : "idle", error ? job.key : "", error);
  void window.readfinch.call("speechEnd", { id: job.id }).catch(() => {});
}
export function stopSpeaking(key?: string) {
  if (active && (!key || active.key === key)) finish(active);
}
export function useSpeechEvents() {
  useEffect(() => {
    const off = window.readfinch.on("speechStop", (id) => {
      if (active?.id === id) stopSpeaking();
    });
    const hidden = () => {
      if (document.hidden) stopSpeaking();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      off();
      document.removeEventListener("visibilitychange", hidden);
      stopSpeaking();
    };
  }, []);
}

function speakChunk(
  job: Playback,
  text: string,
  voice: SpeechSynthesisVoice,
  settings: SpeechConfig,
) {
  return new Promise<void>((resolve, reject) => {
    const u = new SpeechSynthesisUtterance(text);
    Object.assign(u, systemProsody(settings));
    u.voice = voice;
    u.lang = voice.lang;
    job.release = () => {
      u.onend = null;
      u.onerror = null;
      window.speechSynthesis.cancel();
      resolve();
    };
    u.onend = () => {
      job.release = undefined;
      resolve();
    };
    u.onerror = () => {
      reject(Error(t("系统语音播放失败，请更换音色重试。")));
    };
    changed("playing", job.key);
    window.speechSynthesis.speak(u);
  });
}
async function playOnlineChunk(
  job: Playback,
  text: string,
  voice: string,
  settings: SpeechConfig,
) {
  const { speed, playbackRate, volume } = onlineProsody(settings);
  const result = await window.readfinch.call("speechAudio", {
    id: job.id,
    providerId: settings.onlineProviderId!,
    text,
    voice,
    speed,
  });
  if (active !== job) return;
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(result.bytes)], { type: result.mime }),
  );
  try {
    await new Promise<void>((resolve, reject) => {
      const audio = new Audio(url);
      audio.preservesPitch = false;
      audio.playbackRate = playbackRate;
      audio.volume = volume;
      job.release = () => {
        audio.onended = null;
        audio.onerror = null;
        audio.onplaying = null;
        audio.pause();
        resolve();
      };
      audio.onplaying = () => {
        if (active === job) changed("playing", job.key);
      };
      audio.onended = () => {
        job.release = undefined;
        resolve();
      };
      audio.onerror = () => reject(Error(t("无法播放服务返回的音频")));
      void audio.play().catch(reject);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function speakText(
  text: string,
  language?: string,
  options: { key?: string; voice?: string; config?: SpeechConfig } = {},
) {
  if (!text.trim()) return;
  const key = options.key ?? text;
  if (active?.key === key) {
    stopSpeaking();
    return;
  }
  stopSpeaking();
  const job: Playback = { id: crypto.randomUUID(), key };
  active = job;
  changed("loading", key);
  try {
    const saved = await window.readfinch.call("speechBegin", { id: job.id });
    if (active !== job) return;
    const settings = options.config ?? saved;
    const known = speechTag(language ?? "");
    const [code] = await Promise.all([
      known !== "und"
        ? known
        : window.readfinch
            .call("detectLanguage", {
              text: text.slice(0, 2000),
              localOnly: true,
            })
            .catch(() => "und"),
      options.voice?.startsWith("api:") ? undefined : readyVoices(),
    ]);
    if (active !== job) return;
    const choices = [...voices, ...onlineVoices(settings)];
    const choice = options.voice
      ? choices.find((v) => v.id === options.voice)
      : voiceForLanguage(choices, settings, code);
    if (!choice)
      throw Error(t("没有可用的朗读音色，请在文本转语音设置中选择。"));
    const online = choice.id.startsWith("api:");
    const voice = online
      ? undefined
      : window.speechSynthesis
          ?.getVoices()
          .find((v) => systemId(v) === choice.id);
    if (!online && !voice) throw Error(t("所选系统语音不可用"));
    for (const chunk of speechChunks(text, online ? 1800 : 600)) {
      if (active !== job) return;
      if (online)
        await playOnlineChunk(job, chunk, choice.id.slice(4), settings);
      else await speakChunk(job, chunk, voice!, settings);
    }
    finish(job);
  } catch (error) {
    finish(job, (error as Error).message || t("朗读失败"));
  }
}
