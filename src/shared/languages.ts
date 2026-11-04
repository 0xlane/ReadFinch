import languages from "./target-languages.json";

// Used only when creating a profile or resolving an old "follow" preference.
export function initialTargetLanguage(preferred: readonly string[]) {
  for (const value of preferred) {
    try {
      const locale = new Intl.Locale(value.replaceAll("_", "-"));
      if (locale.language === "zh")
        return locale.maximize().script === "Hant" ? "繁體中文" : "简体中文";
      const found = languages.find((l) => l.code === locale.language);
      if (found) return found.name;
    } catch {
      // Ignore an invalid locale and try the next system preference.
    }
  }
  return "English";
}

export function resultLanguageName(value: string) {
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
