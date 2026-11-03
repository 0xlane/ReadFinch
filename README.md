<!-- Generated from docs/readmes/content.json by npm run docs:readme. -->
<div align="center">
<a id="readme-top"></a>

<img src="docs/assets/readfinch-banner.png" alt="ReadFinch · 伴读雀 — A little help, right beside your words." width="1280">

# ReadFinch · 伴读雀

**A reading companion, right beside your words.**

Translate a passage, understand a difficult sentence, or polish what you write—without leaving the app you’re using.

A desktop reading and writing companion. · 随选随用的桌面阅读与写作助手。

<p><strong>English</strong> · <a href="docs/readmes/README.zh-CN.md">简体中文</a> · <a href="docs/readmes/README.zh-TW.md">繁體中文</a> · <a href="docs/readmes/README.ja.md">日本語</a> · <a href="docs/readmes/README.ko.md">한국어</a> · <a href="docs/readmes/README.fr.md">Français</a> · <a href="docs/readmes/README.de.md">Deutsch</a> · <a href="docs/readmes/README.es.md">Español</a></p>

<p>
<a href="LICENSE"><img src="https://img.shields.io/badge/License-GPL--3.0-4d443e?style=flat-square" alt="GPL-3.0-only"></a>
<img src="https://img.shields.io/badge/Version-0.12.0-4d443e?style=flat-square" alt="0.12.0">
<img src="https://img.shields.io/badge/Offline_OCR-中文_+_English-a9643f?style=flat-square" alt="Offline OCR: Simplified Chinese and English">
<img src="https://img.shields.io/badge/AI-Bring_your_own_provider-74675d?style=flat-square" alt="Bring your own AI provider">
</p>

[Get started](#get-started) · [Features](#features) · [Documentation](#documentation) · [Report an issue](https://github.com/0xlane/ReadFinch/issues)

</div>

## Stay with what you’re reading

Select text in a browser, PDF reader or editor. ReadFinch brings a small toolbar to your cursor and opens the answer beside the original. Pin a result for comparison, or collect a useful word for later.

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/reading-en-dark.png">
  <img src="docs/assets/reading-en-light.png" width="640" alt="ReadFinch shows a selected passage, a streamed translation and words suggested for the local notebook.">
</picture>
<br><em>Select → understand → keep. A short path from unfamiliar text to something you can use.</em>
</p>

<a id="features"></a>

## A little help, wherever your text lives

| What you want to do | How ReadFinch helps |
| --- | --- |
| **Read and understand** | Stream translations, look up pronunciations and examples, and break long sentences into understandable parts. |
| **Write with more confidence** | See changes in context, read the reasoning behind a revision, and take the improved wording back to your editor. |
| **Read text you cannot select** | Capture an area of the screen or import an image. Built-in OCR extracts Simplified Chinese and English offline; review the text before running a command. |
| **Listen as you read** | Read selections, translations and examples aloud. Choose system offline voices or compatible online voices by language, with rate, pitch and volume controls. |
| **Build your own AI commands** | Choose a provider, prompt, icon, shortcut and typed output fields. Arrange results with HTML + Liquid and map fields to a local notebook. |
| **Keep what matters** | Save a result or accept a vocabulary suggestion. Search local notebooks and revisit the original passage alongside the answer you saved. |

<details>
<summary><strong>Explore commands and notebooks</strong></summary>

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/commands-en-dark.png">
  <img src="docs/assets/commands-en-light.png" width="860" alt="Custom AI command layout settings, with a live dictionary-card preview.">
</picture>
<br><em>Turn structured answers into a readable card. Preview layouts at different widths and in light or dark mode.</em>
</p>

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/notebook-en-dark.png">
  <img src="docs/assets/notebook-en-light.png" width="860" alt="ReadFinch local notebook with saved vocabulary and the original reading context.">
</picture>
<br><em>Your collection stays close: search, revisit and learn from the passages you kept.</em>
</p>

</details>

### Your provider. Your model. Your choice.

Use presets for OpenAI, DeepSeek, Gemini, Alibaba Cloud, SiliconFlow and OpenRouter, or connect an OpenAI-compatible Chat Completions endpoint. Each provider entry holds one model; duplicate it to use another. Translation, dictionary, writing and image recognition can use different providers. Model suggestions, connection tests, temperature and custom request headers are available in settings.

### Read in your language

The README translations match the app’s eight preset target languages:

**English · 简体中文 · 繁體中文 · 日本語 · 한국어 · Français · Deutsch · Español**

The **application interface currently supports English and Simplified Chinese**, with automatic system-language selection. Translation quality and additional language support depend on your model. Bundled offline OCR recognizes Simplified Chinese and English.

<a id="get-started"></a>

## Get started

Build locally with **Node.js 24**, npm and Git. Windows builds require the .NET Framework 4.8 C# compiler; macOS builds require Xcode Command Line Tools.

```sh
git clone https://github.com/0xlane/ReadFinch.git
cd ReadFinch
npm ci
npm run assets:ocr
npm run build
npm start
```

`assets:ocr` downloads the recognition data **during development**. The data is bundled in the app, so installed copies do not need a language-pack download. Run `npm run dist` on the target operating system to create packages in `release/`.

### Your first useful minute

1. **Connect a provider.** Open API Providers, choose a preset or compatible endpoint, enter the required credentials and model, and test the connection. Assign it as the default or to a specific feature.
2. **Select a sentence.** Click Translate on the selection toolbar, choose your target language and pin the result if you want to keep reading beside it.
3. **Try a screenshot.** Use the OCR shortcut below, select a region and review the recognized text. Offline OCR and system speech work before you configure an AI provider.

### Useful shortcuts

| Command | Windows / Linux | macOS |
| --- | --- | --- |
| Translate selection | `Alt + T` | `Option + T` |
| Open dictionary | `Alt + Shift + D` | `Option + Shift + D` |
| Improve writing | `Alt + Shift + W` | `Option + Shift + W` |
| Choose a command | `Ctrl + Shift + Space` | `Command + Shift + Space` |
| Capture text with OCR | `Ctrl + Shift + 2` | `Command + Shift + 2` |
| Read clipboard text | `Ctrl + Shift + V` | `Command + Shift + V` |

Rebind shortcuts on the dedicated settings page. Settings save automatically; appearance follows the system or your light/dark preference. Launch at login is off by default and can be changed from the tray menu.

### Desktop integration

| Platform | How text is acquired |
| --- | --- |
| Windows | Reads selections exposed by the foreground app through UI Automation. |
| macOS | Uses Accessibility for selected text and Screen Recording permission for captures. |
| Linux | Uses PRIMARY selection on X11 (`xclip`, `xdotool`, `xprop`). Wayland uses clipboard input or the desktop screenshot portal; shortcuts depend on the desktop environment. |

Windows has been exercised on the development machine. macOS and Linux implementations are available, with native desktop acceptance still requiring target-system checks. See the [platform support matrix](docs/PLATFORMS.md).

## Your text, with clear boundaries

**Local by default where it matters.** Notebook contents live in SQLite on your device. Offline OCR and system voices run locally. The local notebook page only displays local content.

**AI requests go to the provider you choose.** Translation and custom commands send the required text; online speech sends the text to be spoken. Remote image recognition shows the image and destination before you explicitly start the request.

**Portable settings.** Import/export files or manually sync configuration over WebDAV. Provider settings, commands, shortcuts and notebook field mappings move together. API keys and custom request headers remain device-specific; configure them separately on another machine. Notebook contents are not included in configuration sync.

<a id="documentation"></a>

## Go deeper

- [Architecture and source layout](docs/ARCHITECTURE.md)
- [Providers, models and feature assignments](docs/MODELS.md)
- [Offline OCR and vision APIs](docs/OCR.md)
- [Configuration and WebDAV](docs/CONFIGURATION.md)
- [Platform support and permissions](docs/PLATFORMS.md)

Technical documentation is currently maintained in Chinese.

## Help ReadFinch grow

Bring a reproducible bug report, an interaction improvement, a translation correction or a pull request. Include your operating system and app version, and remove credentials and private text from examples. [Open an issue](https://github.com/0xlane/ReadFinch/issues) · [Contribute code](https://github.com/0xlane/ReadFinch/pulls).

```sh
npm run typecheck
npm test
npm run build
```

README copy lives in `docs/readmes/content.json`. After editing a translation, run `npm run docs:readme`; the generator checks that coverage matches the target-language list used by the app.

## License and acknowledgements

ReadFinch is licensed under **GPL-3.0-only**. Its selection-toolbar and command-card interactions are inspired by **Read Frog**. ReadFinch is an independent desktop project and is not an official Read Frog release.

[GPL-3.0-only](LICENSE) · [Read Frog](https://github.com/mengxi-ream/read-frog) · [Third-party notices](THIRD_PARTY_NOTICES.md).

<div align="right">

[↑ Back to top](#readme-top)

</div>
