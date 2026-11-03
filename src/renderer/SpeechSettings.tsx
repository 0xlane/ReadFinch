import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Play, Square, RotateCcw, Plus, X } from "lucide-react";
import type { Config } from "../shared/config";
import { t } from "../shared/i18n";
import {
  OnlineVoiceIdSchema,
  onlineVoices,
  speechTag,
  type SpeechConfig,
  type VoiceChoice,
} from "../shared/tts";
import { ProviderSelect } from "./ProviderSelect";
import { speakText, stopSpeaking, useSpeechStatus, useVoices } from "./speech";

const examples: Record<string, string> = {
  en: "Hello from ReadFinch. This is my reading voice.",
  zh: "你好，欢迎使用伴读雀。这是我的朗读声音。",
  "zh-Hant": "你好，歡迎使用伴讀雀。這是我的朗讀聲音。",
  ja: "こんにちは。これが私の読み上げ音声です。",
  ko: "안녕하세요. 이것이 저의 읽기 목소리입니다.",
  fr: "Bonjour. Voici ma voix de lecture.",
  de: "Hallo. So klingt meine Vorlesestimme.",
  es: "Hola. Esta es mi voz de lectura.",
  it: "Ciao. Questa è la mia voce.",
  pt: "Olá. Esta é a minha voz.",
  ru: "Здравствуйте. Это мой голос.",
  ar: "مرحباً. هذا هو صوتي عند القراءة.",
  hi: "नमस्ते। यह मेरी आवाज़ है।",
};
function VoicePicker({
  label,
  value,
  voices,
  empty,
  change,
}: {
  label: string;
  value: string;
  voices: VoiceChoice[];
  empty: string;
  change: (s: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [index, setIndex] = useState(0);
  const id = useId(),
    input = useRef<HTMLInputElement>(null);
  const selected = voices.find((v) => v.id === value);
  const items = [
    { id: "", name: empty, lang: "", local: true },
    ...voices,
  ].filter((v) =>
    (v.name + " " + v.lang + " " + v.id)
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const active = items[Math.min(index, items.length - 1)];
  function choose(id: string) {
    change(id);
    setOpen(false);
  }
  function show() {
    if (!open) {
      setOpen(true);
      setQuery("");
      setIndex(0);
    }
  }
  return (
    <div
      className="tts-picker"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <div>
        <input
          ref={input}
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={open ? id : undefined}
          aria-activedescendant={
            open && active ? id + "-" + items.indexOf(active) : undefined
          }
          placeholder={t("搜索音色或语言")}
          value={
            open
              ? query
              : (selected?.name ??
                (value
                  ? t("不可用 · {0}", value.split(":").slice(1).join(":"))
                  : empty))
          }
          onFocus={show}
          onClick={show}
          onChange={(e) => {
            show();
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
            }
            if (e.key === "Enter") {
              e.preventDefault();
              if (open && active) choose(active.id);
              else show();
            }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              show();
              const next = Math.max(
                0,
                Math.min(
                  items.length - 1,
                  open ? index + (e.key === "ArrowDown" ? 1 : -1) : 0,
                ),
              );
              setIndex(next);
              document
                .getElementById(id + "-" + next)
                ?.scrollIntoView({ block: "nearest" });
            }
          }}
        />
        <ChevronDown size={14} aria-hidden="true" />
      </div>
      {open && (
        <div role="listbox" id={id} aria-label={label} className="tts-options">
          {items.map((v, i) => (
            <button
              key={v.id}
              type="button"
              role="option"
              id={id + "-" + i}
              tabIndex={-1}
              aria-selected={v.id === value}
              data-active={active?.id === v.id}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setIndex(i)}
              onClick={() => choose(v.id)}
            >
              <span>{v.name}</span>
              {v.id && (
                <small>
                  {v.local ? t("本机") : t("在线")}{" "}
                  {v.lang === "mul" ? "" : v.lang}
                </small>
              )}
            </button>
          ))}
          {!items.length && <span className="hint">{t("没有匹配的音色")}</span>}
        </div>
      )}
    </div>
  );
}
function Dial({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const [number, setNumber] = useState(String(value));
  useEffect(() => setNumber(String(value)), [value]);
  function commit() {
    const n = Number(number);
    if (number.trim() && Number.isFinite(n)) {
      const valid = Math.min(100, Math.max(-100, Math.round(n)));
      onChange(valid);
      setNumber(String(valid));
    } else setNumber(String(value));
  }
  return (
    <div className="tts-row">
      <div>
        <h3>{label}</h3>
        <p>{hint}</p>
      </div>
      <div className="tts-dial">
        <input
          type="range"
          min={-100}
          max={100}
          step={1}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <input
          type="number"
          min={-100}
          max={100}
          value={number}
          aria-label={t("{0}数值", label)}
          onChange={(e) => setNumber(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
      </div>
    </div>
  );
}

export function SpeechSettings({
  config,
  value,
  onChange,
  flush,
}: {
  config: Config;
  value: SpeechConfig;
  onChange: (v: SpeechConfig) => void;
  flush: () => Promise<unknown>;
}) {
  const installed = useVoices(),
    speech = useSpeechStatus(),
    [language, setLanguage] = useState("en"),
    [custom, setCustom] = useState(""),
    [error, setError] = useState("");
  const voices = [...installed, ...onlineVoices(value)];
  const tags = [
    ...new Set([
      ...Object.keys(examples),
      ...Object.keys(value.languageVoices),
      ...installed.flatMap((v) => [
        speechTag(v.lang),
        speechTag(v.lang).split("-")[0],
      ]),
      ..."af am az be bg bn bs ca cs cy da el et eu fa fi fil ga gl gu he hr hu hy id is jv ka kk km kn ku ky la lo lt lv mk ml mn mr ms mt my ne nl no pa pl ps ro si sk sl so sq sr sv sw ta te th tr uk ur uz vi yue zu".split(
        " ",
      ),
    ]),
  ];
  const names = new Intl.DisplayNames(
    [document.documentElement.lang || "zh-CN"],
    { type: "language" },
  );
  const update = (p: Partial<SpeechConfig>) => onChange({ ...value, ...p });
  function bind(id: string) {
    const languageVoices = { ...value.languageVoices };
    if (id) languageVoices[language] = id;
    else delete languageVoices[language];
    update({ languageVoices });
  }
  function removeVoice(name: string) {
    const id = "api:" + name;
    update({
      customVoices: value.customVoices.filter((v) => v !== name),
      defaultVoice: value.defaultVoice === id ? "" : value.defaultVoice,
      languageVoices: Object.fromEntries(
        Object.entries(value.languageVoices).filter(
          ([, voice]) => voice !== id,
        ),
      ),
    });
  }
  useEffect(
    () => () => {
      stopSpeaking("preview-default");
      stopSpeaking("preview-language");
    },
    [],
  );
  async function preview(fallback: boolean) {
    const key = fallback ? "preview-default" : "preview-language";
    if (speech.key === key && ["loading", "playing"].includes(speech.status)) {
      stopSpeaking();
      return;
    }
    setError("");
    try {
      await flush();
      const forced = fallback
        ? value.defaultVoice
        : value.languageVoices[language];
      const lang = fallback
        ? (voices.find((v) => v.id === forced)?.lang ?? language)
        : language;
      const sampleLanguage = speechTag(lang === "mul" ? language : lang);
      const sample =
        examples[sampleLanguage] ??
        examples[sampleLanguage.split("-")[0]] ??
        new Intl.DisplayNames([sampleLanguage], { type: "language" }).of(
          sampleLanguage,
        ) ??
        examples.en;
      await speakText(sample, sampleLanguage, {
        key,
        voice: forced,
        config: fallback ? { ...value, languageVoices: {} } : value,
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function playButton(fallback: boolean) {
    const playing =
      speech.key === (fallback ? "preview-default" : "preview-language") &&
      ["playing", "loading"].includes(speech.status);
    const label = playing
      ? t("停止朗读")
      : t(fallback ? "试听兜底语音" : "试听语言语音");
    return (
      <button
        type="button"
        className="secondary tts-preview"
        aria-label={label}
        title={label}
        disabled={!voices.length}
        onClick={() => void preview(fallback)}
      >
        {playing ? <Square size={14} /> : <Play size={14} />}
      </button>
    );
  }
  return (
    <div className="tts-settings">
      <section>
        <h2>{t("语音")}</h2>
        <div className="tts-row stacked">
          <div>
            <h3>{t("语言音色")}</h3>
            <p>{t("先选语言，再选择朗读它时使用的音色。")}</p>
          </div>
          <div className="tts-voice-line">
            <select
              aria-label={t("朗读语言")}
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              {tags.map((tag) => (
                <option key={tag} value={tag}>
                  {names.of(tag) ?? tag}
                </option>
              ))}
            </select>
            <VoicePicker
              label={t("语言音色")}
              voices={voices}
              value={value.languageVoices[language] ?? ""}
              empty={t("使用兜底语音")}
              change={bind}
            />
            {playButton(false)}
            <button
              className="secondary compact"
              disabled={!value.languageVoices[language]}
              onClick={() => bind("")}
            >
              {t("重置")}
            </button>
          </div>
        </div>
        <div className="tts-row">
          <div>
            <h3>{t("兜底语音")}</h3>
            <p>{t("没有单独指定音色时使用。自动模式会匹配本机语言。")}</p>
          </div>
          <div className="tts-fallback">
            <VoicePicker
              label={t("兜底音色")}
              voices={voices}
              value={value.defaultVoice}
              empty={t("自动匹配系统语音")}
              change={(defaultVoice) => update({ defaultVoice })}
            />
            {playButton(true)}
          </div>
        </div>
        {!installed.some((v) => v.local) && (
          <p className="hint">
            {t("尚未发现本机语音，可以在系统中添加语音或配置在线朗读。")}
          </p>
        )}
        {(error || speech.error) && (
          <p role="alert" className="alert error">
            {error || speech.error}
          </p>
        )}
      </section>
      <section>
        <header>
          <h2>{t("朗读")}</h2>
          <button
            className="text-button"
            disabled={!value.rate && !value.pitch && !value.volume}
            onClick={() => update({ rate: 0, pitch: 0, volume: 0 })}
          >
            <RotateCcw size={13} />
            {t("恢复默认")}
          </button>
        </header>
        <Dial
          label={t("语速")}
          hint={t("调慢或加快朗读，0 为正常语速。")}
          value={value.rate}
          onChange={(rate) => update({ rate })}
        />
        <Dial
          label={t("音高")}
          hint={t("调低或调高声音，0 为原始音高。")}
          value={value.pitch}
          onChange={(pitch) => update({ pitch })}
        />
        <Dial
          label={t("音量")}
          hint={t("从静音到最大音量，0 为基准音量。")}
          value={value.volume}
          onChange={(volume) => update({ volume })}
        />
      </section>
      <section>
        <h2>{t("在线语音")}</h2>
        <div className="tts-row">
          <div>
            <h3>{t("在线朗读提供商")}</h3>
            <p>
              {t(
                "选择支持 /audio/speech 的模型。使用在线音色时，朗读文字会发送给该提供商。",
              )}
            </p>
          </div>
          <ProviderSelect
            config={config}
            value={value.onlineProviderId}
            label={t("在线朗读提供商")}
            emptyLabel={t("不使用在线服务")}
            onChange={(onlineProviderId) => update({ onlineProviderId })}
          />
        </div>
        <div className="tts-provider-help">
          <button
            className="text-button"
            onClick={() =>
              void window.texthop.call("settingsOpen", { tab: "text" })
            }
          >
            {t("配置 API 提供商")}
          </button>
        </div>
        {value.onlineProviderId && (
          <div className="tts-row">
            <div>
              <h3>{t("自定义在线音色")}</h3>
              <p>{t("填写提供商支持的音色 ID，即可在音色列表中选择。")}</p>
            </div>
            <div className="tts-custom">
              <input
                maxLength={200}
                aria-label={t("在线音色 ID")}
                value={custom}
                placeholder="voice-id"
                onChange={(e) => setCustom(e.target.value)}
              />
              <button
                className="secondary compact"
                disabled={
                  !OnlineVoiceIdSchema.safeParse(custom).success ||
                  value.customVoices.length >= 48 ||
                  voices.some((v) => v.id === "api:" + custom.trim())
                }
                onClick={() => {
                  update({
                    customVoices: [...value.customVoices, custom.trim()],
                  });
                  setCustom("");
                }}
              >
                <Plus size={14} />
                {t("添加")}
              </button>
            </div>
          </div>
        )}
        {value.onlineProviderId && value.customVoices.length > 0 && (
          <div className="tts-custom-list">
            {value.customVoices.map((name) => (
              <span key={name}>
                {name}
                <button
                  className="icon-button"
                  type="button"
                  aria-label={t("移除音色 {0}", name)}
                  title={t("移除音色 {0}", name)}
                  onClick={() => removeVoice(name)}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
