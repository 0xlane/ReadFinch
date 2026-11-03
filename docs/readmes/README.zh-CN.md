<!-- Generated from docs/readmes/content.json by npm run docs:readme. -->
<div align="center">
<a id="readme-top"></a>

<img src="../../docs/assets/readfinch-banner.png" alt="ReadFinch · 伴读雀 — A little help, right beside your words." width="1280">

# ReadFinch · 伴读雀

**就在文字旁边，陪你读懂每一句。**

伴读雀是一款开源的桌面阅读与写作助手。在不同应用中选中文字，即可翻译、查词、改进写作或保存笔记；无法选中的图片文字，也可以通过离线或在线 OCR 识别。

<p><a href="../../README.md">English</a> · <strong>简体中文</strong> · <a href="../../docs/readmes/README.zh-TW.md">繁體中文</a> · <a href="../../docs/readmes/README.ja.md">日本語</a> · <a href="../../docs/readmes/README.ko.md">한국어</a> · <a href="../../docs/readmes/README.fr.md">Français</a> · <a href="../../docs/readmes/README.de.md">Deutsch</a> · <a href="../../docs/readmes/README.es.md">Español</a></p>

<p>
<a href="../../LICENSE"><img src="https://img.shields.io/badge/License-GPL--3.0-4d443e?style=flat-square" alt="GPL-3.0-only"></a>
<img src="https://img.shields.io/badge/Version-1.1.0-4d443e?style=flat-square" alt="1.1.0">
<img src="https://img.shields.io/badge/OCR-Offline_+_Online-a9643f?style=flat-square" alt="离线与在线 OCR">
<img src="https://img.shields.io/badge/AI-Bring_your_own_provider-74675d?style=flat-square" alt="Bring your own AI provider">
</p>

[下载最新版](https://github.com/0xlane/ReadFinch/releases/latest) · [开始使用](#get-started) · [功能介绍](#features) · [技术文档](#documentation) · [反馈问题](https://github.com/0xlane/ReadFinch/issues)

</div>

## 继续阅读，不必来回切换

在浏览器、PDF 阅读器或编辑器里选中文字，伴读雀就会在鼠标旁提供工具栏，并在原文附近展示答案。可以固定结果对照阅读，也可以把值得记住的词留下来。

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/reading-zh-CN-dark.png">
  <img src="../../docs/assets/reading-zh-CN-light.png" width="640" alt="伴读雀在原文旁展示流式译文，并推荐可收藏到本地笔记库的词条。">
</picture>
<br><em>选中 → 理解 → 收藏。从陌生的文字，到可以用起来的知识。</em>
</p>

<a id="features"></a>

## 主要功能

| 想做什么 | 伴读雀如何帮你 |
| --- | --- |
| **读懂原文** | 流式查看译文，查询读音、释义和例句，把长难句拆成容易理解的结构。 |
| **改善表达** | 在原句中查看修改位置，对照修改理由与修订稿，再把改好的文字带回编辑器。 |
| **识别无法选中的文字** | 框选屏幕或导入图片，选择内置离线 OCR 或已配置的在线视觉提供商。核对识别文字后，再运行指令。 |
| **边读边听** | 使用系统离线语音或在线语音朗读选区、译文与例句，可按语言选择音色并试听；可用的播放调节项取决于语音服务。 |
| **定制自己的 AI 指令** | 设置提供商、提示词、图标、快捷键和输出字段，以 HTML + Liquid 编排结果卡片，并将字段映射到本地笔记库。 |
| **留下值得记住的内容** | 收藏结果，或勾选「猜你想存」推荐的词条。通过本地搜索回看保存时的原文与答案。 |

<details>
<summary><strong>看看指令与笔记库</strong></summary>

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/commands-zh-CN-dark.png">
  <img src="../../docs/assets/commands-zh-CN-light.png" width="860" alt="自定义 AI 指令的版式设置与实时词典卡片预览。">
</picture>
<br><em>把结构化回答排成易读的卡片，随时检查不同宽度和深浅色下的效果。</em>
</p>

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/notebook-zh-CN-dark.png">
  <img src="../../docs/assets/notebook-zh-CN-light.png" width="860" alt="伴读雀本地笔记库展示收藏的词条及原文。">
</picture>
<br><em>把阅读中的发现留在身边，随时搜索、回看和复习。</em>
</p>

</details>

### 离线与在线 OCR

框选屏幕区域或导入图片，核对识别出的文字后，即可继续翻译、查词或执行自定义指令。

| 识别方式 | 使用说明 |
| --- | --- |
| **离线识别 · 默认** | 内置引擎在本机识别简体中文和英文，无需 API 账户、网络连接或额外下载语言包。 |
| **在线识别 · 可选** | 使用已配置的视觉提供商提取文字。支持的语言与识别效果取决于模型；框选区域或导入的图片会发送给该提供商。 |

使用在线 OCR 时，先在「API 提供商」中配置支持图片输入的模型，再到「截图识别」选择该提供商。内置离线引擎始终可选，离线识别失败也不会自动上传图片。

### 为不同功能选择提供商

使用自己的 API 账户，接入 OpenAI、Anthropic、Gemini、DeepSeek、Azure、Amazon Bedrock、OpenRouter 等预设提供商，或添加兼容 Chat Completions、Responses 的自定义接口，也支持专用翻译服务。每个 AI 提供商条目使用一个模型，复制条目即可配置其他模型。翻译、词典、写作、OCR、语言检测和在线朗读可分别选择提供商；模型联想、连接测试、温度、自定义请求头与独立代理按服务能力提供。

### 语言支持

翻译和解释可选择以下 8 种预置目标语言：

**English · 简体中文 · 繁體中文 · 日本語 · 한국어 · Français · Deutsch · Español**

**应用界面支持简体中文和英文**，默认跟随系统。界面语言与输出语言独立设置；翻译质量和语言覆盖范围取决于所选提供商及模型。

<a id="get-started"></a>

## 开始使用

**[下载最新版](https://github.com/0xlane/ReadFinch/releases/latest)**

在最新发行版中选择适合当前系统的安装包，使用已打包的应用无需安装开发工具。

| 系统 | 安装包 |
| --- | --- |
| Windows x64 | `*-setup.exe` 为安装版，`*-portable.exe` 为免安装便携版。 |
| macOS | Apple 芯片选择 `arm64`，Intel 选择 `x64`，提供 `.dmg` 和 `.zip`。 |
| Linux x64 | `.AppImage` 可直接运行，`amd64.deb` 适用于 Debian、Ubuntu。 |

默认开启自动检查更新，可在「关于」页调整或手动检查。Windows 安装版和 Linux AppImage 可在退出时安装已下载的更新；Windows 便携版、macOS 和 Linux DEB 需要手动安装。

### 第一次使用

1. **接入提供商。** 打开「API 提供商」，选择预设或兼容接口，填写所需凭据与模型并测试连接。可设为默认提供商，也可单独分配给某项功能。
2. **选中一句话。** 点击划词工具栏的「翻译」，选择目标语言。需要对照时，点图钉固定结果即可。
3. **从图片中取词。** 使用下方 OCR 快捷键框选区域。离线 OCR 开箱即用；在线识别需在「截图识别」选择已配置的视觉提供商。核对识别文字后再继续。

### 常用快捷键

| 指令 | Windows / Linux | macOS |
| --- | --- | --- |
| 翻译选区 | `Alt + T` | `Option + T` |
| 打开词典 | `Alt + Shift + D` | `Option + Shift + D` |
| 写作改进 | `Alt + Shift + W` | `Option + Shift + W` |
| 选择指令 | `Ctrl + Shift + Space` | `Command + Shift + Space` |
| 框选屏幕文字 | `Ctrl + Shift + 2` | `Command + Shift + 2` |
| 读取剪贴板 | `Ctrl + Shift + V` | `Command + Shift + V` |

快捷键可在独立设置页面重新绑定。设置自动保存，外观可跟随系统或手动切换深浅色。开机自启默认关闭，可在托盘菜单中切换。

### 平台支持

| 平台 | 如何取得文字 |
| --- | --- |
| Windows | 通过 UI Automation 读取前台应用提供的文本选区。 |
| macOS | 读取选区需要辅助功能授权；截图需要屏幕录制权限。 |
| Linux | X11 使用 PRIMARY 选区，依赖 `xclip`、`xdotool`、`xprop`。Wayland 使用剪贴板或桌面截图门户，快捷键能力取决于桌面环境。 |

自动划词依赖当前应用提供可读取的文本选区。无法直接取词时，可使用 OCR 或剪贴板入口。系统权限、平台限制与验证情况详见 [平台支持矩阵](../../docs/PLATFORMS.md)。

## 数据与隐私

**笔记与离线识别留在本机。** 笔记正文保存在当前设备；内置 OCR 在本地处理图片，系统离线语音无需在线朗读服务。

**请求发送给你选择的提供商。** 翻译和 AI 指令发送请求所需的文字，在线朗读发送待朗读内容；在线 OCR 将框选区域或导入的图片发送给所选视觉提供商。服务账户、可用性和调用费用由对应提供商管理。

**配置可以迁移。** 支持文件导入、导出和手动 WebDAV 同步，迁移提供商设置、指令、快捷键与笔记字段映射。API Key 和自定义请求头按设备保存，新设备需要单独配置；笔记正文不包含在配置同步中。

<a id="documentation"></a>

## 文档

- [应用架构与源码目录](../../docs/ARCHITECTURE.md)
- [提供商、模型与功能分配](../../docs/MODELS.md)
- [离线与在线 OCR](../../docs/OCR.md)
- [配置管理与 WebDAV](../../docs/CONFIGURATION.md)
- [平台支持与权限](../../docs/PLATFORMS.md)
- [界面、翻译与解释语言](../../docs/LANGUAGES.md)
- [版本发布与应用更新](../../docs/UPDATES.md)

技术文档使用中文或英文。

## 参与贡献

欢迎提交可复现的问题、交互建议、翻译修订和代码贡献。反馈时请注明操作系统与应用版本，并移除示例中的凭据和私人文字。 [反馈问题](https://github.com/0xlane/ReadFinch/issues) · [贡献代码](https://github.com/0xlane/ReadFinch/pulls).

### 从源码构建

本地构建需要 **Node.js 24**、npm 和 Git。Windows 需要 .NET Framework 4.8 的 C# 编译器；macOS 需要 Xcode 命令行工具。

```sh
git clone https://github.com/0xlane/ReadFinch.git
cd ReadFinch
npm ci
npm run assets:ocr
npm run build
npm start
```

`assets:ocr` 仅在**开发构建阶段**准备识别数据。数据随应用打包，安装后无需下载语言包。在目标操作系统上运行 `npm run dist`，安装包会生成到 `release/`。

```sh
npm run typecheck
npm test
npm run build
```

README 文案维护在 `docs/readmes/content.json`。修改翻译后运行 `npm run docs:readme`，生成器会检查是否覆盖应用目标语言列表。

## 许可与致谢

伴读雀采用 **GPL-3.0-only** 许可证。划词工具栏和指令卡片的交互设计受到 **陪读蛙（Read Frog）** 启发。伴读雀是独立桌面项目，并非陪读蛙官方发行版。

[GPL-3.0-only](../../LICENSE) · [Read Frog](https://github.com/mengxi-ream/read-frog) · [第三方组件与资源声明](../../THIRD_PARTY_NOTICES.md)

<div align="right">

[↑ 返回顶部](#readme-top)

</div>
