import type { Action, Config } from "./config";
import {
  builtinId,
  definition,
  presetLayout,
  translationDefinition,
} from "./action-templates";
import { localizedSample } from "./action-samples";
import type { Locale } from "./i18n";
import { resultLanguageName } from "./languages";
import history from "./action-default-history.json";
import type { OutputField } from "./action-output";

function equal(a: unknown, b: unknown) {
  const ordered = (v: any): any =>
    Array.isArray(v)
      ? v.map(ordered)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, ordered(x)]),
          )
        : v;
  return JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));
}
const locales: Locale[] = ["zh-CN", "en"];
export function localizeBuiltinAction(
  action: Action,
  locale: Locale,
  targetLanguage: string,
): Action {
  if (action.legacyEditable) return action;
  if (action.id === "translate") {
    const variants = [
      history["zh-CN"].translate,
      history.en.translate,
      ...locales.map(translationDefinition),
    ];
    const next = { ...action },
      desired = translationDefinition(locale);
    for (const key of ["system", "prompt"] as const)
      if (variants.some((v) => v[key] === action[key]))
        next[key] = desired[key];
    return next;
  }
  if (!builtinId(action.id) || !action.outputSchema) return action;
  const kind = action.id,
    desired = definition(kind, locale);
  const variants: Partial<Action>[] = [
    history["zh-CN"][kind] as Partial<Action>,
    history.en[kind] as Partial<Action>,
    ...locales.map((l) => definition(kind, l)),
    ...locales.map((l) => definition(kind, l, "v14")),
  ];
  const next = structuredClone(action);
  for (const key of ["system", "prompt"] as const)
    if (variants.some((v) => v[key] === action[key])) next[key] = desired[key];
  const knownLayout =
    variants.some((v) => v.layout === action.layout) ||
    locales.some(
      (l) => presetLayout(kind, action.outputSchema!, l) === action.layout,
    );
  next.outputSchema = action.outputSchema.map((field) => {
    const dest = desired.outputSchema.find((f) => f.id === field.id);
    if (!dest) return field;
    const known = variants
      .flatMap((v) => v.outputSchema ?? [])
      .filter(
        (f) =>
          f.id === field.id &&
          f.type === field.type &&
          f.source === field.source,
      );
    return {
      ...field,
      name:
        knownLayout && known.some((f) => f.name === field.name)
          ? dest.name
          : field.name,
      description: known.some((f) => f.description === field.description)
        ? dest.description
        : field.description,
    };
  });
  // A custom layout and custom field names stay together; a field ID never changes.
  if (knownLayout) next.layout = presetLayout(kind, next.outputSchema, locale);
  if (action.sample) {
    const generated = localizedSample(
      kind,
      action.sample.targetLanguage,
      action.sample.explanationLanguage,
    );
    if (
      variants.some((v) => equal(v.sample, action.sample)) ||
      equal(generated, action.sample)
    )
      next.sample = localizedSample(kind, targetLanguage);
  }
  return next;
}
export function localizeBuiltinConfig(config: Config, locale: Locale): Config {
  const target = resultLanguageName(config.defaults.targetLanguage);
  return {
    ...config,
    actions: config.actions.map((a) =>
      localizeBuiltinAction(a, locale, target),
    ),
  };
}
// Stored defaults use one canonical form. Changing the UI or OS language must not
// rewrite custom commands, note mappings, sync fingerprints or saved result cards.
export function canonicalizeBuiltinConfig(config: Config): Config {
  return {
    ...config,
    actions: config.actions.map((a) =>
      localizeBuiltinAction(a, "zh-CN", "简体中文"),
    ),
  };
}
export function matchingBuiltinOutput(
  action: Action,
  fields: OutputField[] | undefined,
) {
  if (equal(action.outputSchema, fields)) return action;
  return locales
    .map((locale) => localizeBuiltinAction(action, locale, "English"))
    .find((candidate) => equal(candidate.outputSchema, fields));
}
