<!-- Generated from docs/readmes/content.json by npm run docs:readme. -->
<div align="center">
<a id="readme-top"></a>

<img src="docs/assets/readfinch-banner.png" alt="ReadFinch · 伴读雀 — A little help, right beside your words." width="1280">

# ReadFinch · 伴读雀

**A reading companion, right beside your words.**

ReadFinch is an open-source desktop reading and writing companion. Translate selected text, look up words, improve writing and save notes across apps, with OCR for text you cannot select.

<p><strong>English</strong> · <a href="docs/readmes/README.zh-CN.md">简体中文</a> · <a href="docs/readmes/README.zh-TW.md">繁體中文</a> · <a href="docs/readmes/README.ja.md">日本語</a> · <a href="docs/readmes/README.ko.md">한국어</a> · <a href="docs/readmes/README.fr.md">Français</a> · <a href="docs/readmes/README.de.md">Deutsch</a> · <a href="docs/readmes/README.es.md">Español</a></p>

<p>
<a href="LICENSE"><img src="https://img.shields.io/badge/License-GPL--3.0-4d443e?style=flat-square" alt="GPL-3.0-only"></a>
<img src="https://img.shields.io/badge/Version-1.2.3-4d443e?style=flat-square" alt="1.2.3">
<img src="https://img.shields.io/badge/AI-Bring_your_own_provider-74675d?style=flat-square" alt="Bring your own AI provider">
</p>

[Download latest](https://github.com/0xlane/ReadFinch/releases/latest) · [Get started](#get-started) · [Features](#features) · [Documentation](#documentation) · [Report an issue](https://github.com/0xlane/ReadFinch/issues)

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

## Features

| What you want to do | How ReadFinch helps |
| --- | --- |
| **Read and understand** | Stream translations, look up pronunciations and examples, and break long sentences into understandable parts. |
| **Write with more confidence** | See changes in context, read the reasoning behind a revision, and take the improved wording back to your editor. |
| **Read text you cannot select** | Capture a screen region or import an image to extract text, then translate it, look up words or run a custom command. |
| **Listen as you read** | Read selections, translations and examples aloud with system offline voices or online text to speech. Choose voices by language and preview them; playback controls depend on the voice service. |
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

### Providers for each feature

Connect your own API account with presets for OpenAI, Anthropic, Gemini, DeepSeek, Azure, Amazon Bedrock, OpenRouter and more, or use a compatible Chat Completions or Responses endpoint. Dedicated translation services are also supported. Each AI provider entry uses one model; duplicate an entry to use another. Assign providers separately for translation, dictionary, writing, OCR, language detection and online speech. Model suggestions, connection tests, temperature, custom headers and per-provider proxies are available where supported.

### Languages

Choose from eight preset languages for translations and explanations:

**English · 简体中文 · 繁體中文 · 日本語 · 한국어 · Français · Deutsch · Español**

The **interface supports English and Simplified Chinese** and follows the system language by default. Interface language and output language are configured separately. Translation quality and language coverage depend on the selected provider and model.

<a id="get-started"></a>

## Get started

**[Download latest](https://github.com/0xlane/ReadFinch/releases/latest)**

Choose the package for your operating system from the latest release. No development tools are needed to use the packaged app.

| System | Package |
| --- | --- |
| Windows x64 | `*-setup.exe` to install, or `*-portable.exe` to run without installing. |
| macOS | `arm64` for Apple silicon or `x64` for Intel; available as `.dmg` and `.zip`. |
| Linux x64 | `.AppImage` to run directly, or `amd64.deb` for Debian and Ubuntu. |

Automatic update checks are enabled by default and can be configured in **About**, where you can also check manually. Windows installations and Linux AppImages can install downloaded updates on exit; portable Windows packages, macOS and Linux DEB packages require manual installation.

### First steps

1. **Connect a provider.** Open API Providers, choose a preset or compatible endpoint, enter the required credentials and model, and test the connection. Assign it as the default or to a specific feature.
2. **Select a sentence.** Click Translate on the selection toolbar, choose your target language and pin the result if you want to keep reading beside it.
3. **Capture text from an image.** Use the OCR shortcut below and select a region. Review the recognized text, then choose a command.

### Useful shortcuts

| Command | Windows / Linux | macOS |
| --- | --- | --- |
| Translate selection | `Alt + T` | `Option + D` |
| Open dictionary | `Alt + Shift + D` | `Option + Shift + D` |
| Improve writing | `Alt + Shift + W` | `Option + Shift + W` |
| Choose a command | `Ctrl + Shift + Space` | `Command + Shift + Space` |
| Capture text with OCR | `Ctrl + Shift + 2` | `Option + Shift + S` |
| Read clipboard text | `Ctrl + Shift + V` | `Command + Shift + V` |
| Input translation | `Alt + A` | `Option + A` |

Rebind shortcuts on the dedicated settings page. Settings save automatically; appearance follows the system or your light/dark preference. Launch at login is off by default and can be changed from the tray menu.

### Platform support

| Platform | How text is acquired |
| --- | --- |
| Windows | Reads foreground selections through UI Automation and Java Access Bridge. |
| macOS | Uses Accessibility for selected text and Screen Recording permission for captures. |
| Linux | Uses PRIMARY selection on X11 (`xclip`, `xdotool`, `xprop`). Wayland uses clipboard input or the desktop screenshot portal; shortcuts depend on the desktop environment. |

Automatic selection depends on the foreground app exposing its text. Use OCR or clipboard input when it does not. Permissions, platform limits and validation status are documented in the [platform support matrix](docs/PLATFORMS.md).

## Data and privacy

**On your device.** Notebook contents stay on your device. Built-in OCR processes images locally, and system offline voices do not need an online speech provider.

**Requests use your chosen provider.** Translation and AI commands send the text needed for the request; online speech sends the text to read aloud. Online OCR sends the captured region or imported image to the selected vision provider. Provider accounts, availability and usage charges are managed by the respective service.

**Portable settings.** Import/export files or manually sync configuration over WebDAV. Provider settings, commands, shortcuts and notebook field mappings move together. API keys and custom request headers remain device-specific; configure them separately on another machine. Notebook contents are not included in configuration sync.

<a id="documentation"></a>

## Documentation

- [Architecture and source layout](docs/ARCHITECTURE.md)
- [Providers, models and feature assignments](docs/MODELS.md)
- [Screenshot and image recognition (OCR)](docs/OCR.md)
- [Configuration and WebDAV](docs/CONFIGURATION.md)
- [Platform support and permissions](docs/PLATFORMS.md)
- [Interface and translation languages](docs/LANGUAGES.md)
- [Releases and application updates](docs/UPDATES.md)

Technical documentation is available in Chinese or English.

## Contributing

Bring a reproducible bug report, an interaction improvement, a translation correction or a pull request. Include your operating system and app version, and remove credentials and private text from examples. [Open an issue](https://github.com/0xlane/ReadFinch/issues) · [Contribute code](https://github.com/0xlane/ReadFinch/pulls).

### Build from source

Build locally with **Node.js 24**, npm and Git. On Windows, install the .NET Framework 4.8 C# compiler and point `JAVA_HOME` at an x64 OpenJDK such as Temurin 21. On macOS, install Xcode Command Line Tools.

```sh
git clone https://github.com/0xlane/ReadFinch.git
cd ReadFinch
npm ci
npm run assets:ocr
npm run build
npm start
```

`assets:ocr` downloads the recognition data **during development**. The data is bundled in the app, so installed copies do not need a language-pack download. Run `npm run dist` on the target operating system to create packages in `release/`.

```sh
npm run typecheck
npm test
npm run build
```

README copy lives in `docs/readmes/content.json`. After editing a translation, run `npm run docs:readme`; the generator checks that coverage matches the target-language list used by the app.

## License and acknowledgements

ReadFinch is licensed under **GPL-3.0-only**. Its selection-toolbar and command-card interactions are inspired by **Read Frog**. ReadFinch is an independent desktop project and is not an official Read Frog release.

[GPL-3.0-only](LICENSE) · [Read Frog](https://github.com/mengxi-ream/read-frog) · [Third-party notices](THIRD_PARTY_NOTICES.md)

<div align="right">

[↑ Back to top](#readme-top)

</div>
