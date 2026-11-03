import languages from "./target-languages.json";
import type { Locale } from "./i18n";

// "system" follows an explicit app language, or the user's OS language preference.
// Keep native output-language names separate from the UI's currently available locales.
export function preferredResultLanguage(
  appearance: "system" | Locale,
  preferred: readonly string[],
) {
  const choices = appearance === "system" ? preferred : [appearance];
  for (const value of choices) {
    const code = value.replaceAll("_", "-").toLowerCase();
    if (code.startsWith("zh"))
      return /(?:hant|tw|hk|mo)/i.test(code) ? "繁體中文" : "简体中文";
    const found = languages.find(
      (l) => l.code.toLowerCase() === code || l.code === code.split("-")[0],
    );
    if (found) return found.name;
  }
  return "English";
}
export function resolveResultLanguage(
  value: string,
  appearance: "system" | Locale,
  preferred: readonly string[],
) {
  if (value === "system") return preferredResultLanguage(appearance, preferred);
  return (
    languages.find((l) => l.code.toLowerCase() === value.toLowerCase())?.name ??
    value
  );
}
export function resultLanguageCode(value: string) {
  return (
    languages.find(
      (l) => l.name === value || l.code.toLowerCase() === value.toLowerCase(),
    )?.code ?? "en"
  );
}
