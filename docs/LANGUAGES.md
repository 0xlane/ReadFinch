# Language behavior

ReadFinch separates the interface language, translation target and explanation language.

- **Interface language:** English, Simplified Chinese, or the operating system preference. English is the fallback when an interface translation is unavailable.
- **Translation target:** the language used by Translation and the translated sentence in Sentence analysis.
- **Explanation language:** the language used for dictionary definitions, example translations, memory tips, grammar explanations, writing notes and note suggestions. Writing improvement preserves the original passage's language.

New profiles follow the application language for both result preferences. When the application follows the operating system, results use the first supported OS language preference. The built-in result choices are English, Simplified Chinese, Traditional Chinese, Japanese, Korean, French, German and Spanish. An unsupported preference falls back to English. A manually selected language remains unchanged when the interface language changes.

## Built-in and custom commands

Untouched built-in prompts, output field names, descriptions and layouts follow the interface language. Their language variables are resolved for every request. A Chinese interface can therefore request a French translation and Japanese explanations; the instruction language does not determine the result language.

Preview data follows the target and explanation preferences. OCR transcribes the original text without translating it. Language detection and the internal JSON contract use stable technical instructions.

Custom commands, edited prompts, custom layouts and edited preview data are preserved verbatim. They are not automatically translated. Authors can use these variables:

| Variable | Purpose |
| --- | --- |
| {{sourceLanguage}} | The input language or automatic detection |
| {{targetLanguage}} | The resolved translation target |
| {{explanationLanguage}} | The resolved explanation language |

Commands should name the relevant language variable in each generated field description. Revisions should explicitly preserve the input language unless translation is intended.

## Running requests, notes and synchronization

A running result retains its original field schema and resolved language if preferences change mid-request. Regenerating uses the latest preferences. Saved notes retain the rendered result and language from that run, with stable field IDs for notebase mappings.

Builtin defaults are stored in a canonical form. Localized settings views do not rewrite custom text or cause synchronization changes solely because the operating system language differs.

## Verification

The language tests cover all eight result choices, both interface locales, independent explanation preferences, existing defaults, custom content preservation and configuration round trips. The Electron language smoke test exercises streamed output, changing the interface while a request runs, local note storage and regeneration with different language preferences. These tests verify application behavior; a provider's actual adherence to the requested language depends on its model.
