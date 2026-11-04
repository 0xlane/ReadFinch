import english from "./en.json";
export type Locale = "zh-CN" | "en";
let active: Locale = "zh-CN";
export function resolveLocale(
  setting: "system" | Locale,
  languages: readonly string[],
  displayLanguage?: string,
): Locale {
  if (setting !== "system") return setting;
  for (const tag of displayLanguage
    ? [displayLanguage, ...languages]
    : languages) {
    const language = tag
      .trim()
      .split(/[-_.@]/, 1)[0]
      .toLowerCase();
    if (language === "zh") return "zh-CN";
    if (language === "en") return "en";
  }
  return "en";
}
export function setLocale(value: Locale) {
  active = value;
}
export function getLocale() {
  return active;
}
export function translate(
  source: string,
  locale: Locale,
  ...args: (string | number | undefined)[]
) {
  const result =
    locale === "en" && Object.hasOwn(english, source)
      ? (english as Record<string, string>)[source]
      : source;
  return args.length
    ? result.replace(/\{(\d+)\}/g, (match, i) => String(args[i] ?? ""))
    : result;
}
export function t(source: string, ...args: (string | number | undefined)[]) {
  return translate(source, active, ...args);
}

const builtinNames: Record<string, string> = {
  translate: "翻译",
  dictionary: "词典",
  sentence: "长难句分析",
  polish: "写作改进",
  shorten: "精简表达",
  tone: "调整语气",
  explain: "简单解释",
  summarize: "提炼要点",
  error: "解释这个报错",
  english: "英语表达教练",
};
export function actionLabel(action: { id: string; name: string }) {
  return action.name === builtinNames[action.id] ? t(action.name) : action.name;
}
